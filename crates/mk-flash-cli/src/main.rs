//! `mk-flash` — CLI harness for the flashing core.
//!
//! Doubles as the M1 real-hardware test harness and a WebView-free rescue tool.
//! Deliberately tiny (manual arg parsing, no clap) to keep the dependency set to
//! exactly what the core needs.
//!
//! Usage:
//!   mk-flash scan
//!   mk-flash validate <file.uf2>
//!   mk-flash write <file.uf2>                 # wait for bootloader, then flash one half
//!   mk-flash flow --manifest <url> [--reset]  # download latest + guide R->L

use mk_flash_core::{
    acquire_bootloader, flash_uf2, scan_bootloader_volumes, validate_uf2, CancelFlag, FlashConfig,
    FlashEnv, RealEnv, Uf2Limits,
};

/// INFO_UF2.TXT Board-ID prefix on the shipping Seeed XIAO nRF52840 Sense
/// (measured on hardware 2026-07-09, plan U-2).
const BOARD_ID_PREFIX: &str = "Seeed_XIAO_nRF52840";
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Duration;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("help");
    let rest = &args[args.len().min(1)..];
    let result = match cmd {
        "scan" => cmd_scan(),
        "validate" => cmd_validate(rest),
        "write" => cmd_write(rest),
        "manifest" => cmd_manifest(rest),
        "flow" => cmd_flow(rest),
        "help" | "-h" | "--help" => {
            print_help();
            Ok(())
        }
        other => {
            eprintln!("unknown command: {other}\n");
            print_help();
            return ExitCode::from(2);
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(msg) => {
            eprintln!("error: {msg}");
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    eprintln!(
        "mk-flash — minimal-keys firmware flasher (CLI)\n\n\
         COMMANDS:\n  \
         scan                      list detected UF2 bootloader volumes\n  \
         validate <file.uf2>       structurally validate a UF2 file\n  \
         write <file.uf2>          wait for a bootloader volume, then flash it\n  \
         manifest <manifest.json>  validate a manifest.json file (parse only)\n  \
         flow --manifest <url>     download the latest release and guide R->L\n"
    );
}

fn cmd_scan() -> Result<(), String> {
    let env = RealEnv::new();
    let vols = scan_bootloader_volumes(&env);
    if vols.is_empty() {
        println!("no UF2 bootloader volumes found");
    } else {
        for v in vols {
            println!(
                "{}  (label={}, board_id={})",
                v.path,
                v.label,
                v.board_id.as_deref().unwrap_or("?")
            );
        }
    }
    Ok(())
}

fn cmd_validate(args: &[String]) -> Result<(), String> {
    let path = args.first().ok_or("usage: mk-flash validate <file.uf2>")?;
    let bytes = std::fs::read(path).map_err(|e| format!("read {path}: {e}"))?;
    let info = validate_uf2(&bytes, &Uf2Limits::default()).map_err(|e| e.to_string())?;
    println!(
        "OK  blocks={} range={:#x}..{:#x} payload={} sha256={}",
        info.num_blocks, info.start_addr, info.end_addr, info.total_payload, info.sha256
    );
    Ok(())
}

fn cmd_manifest(args: &[String]) -> Result<(), String> {
    let path = args.first().ok_or("usage: mk-flash manifest <manifest.json>")?;
    let body = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    let m = mk_flash_core::parse_manifest(&body).map_err(|e| e.to_string())?;
    println!(
        "OK  version={} schema={} assets={} requires_settings_reset={}",
        m.version,
        m.schema,
        m.assets.len(),
        m.requires_settings_reset
    );
    for a in &m.assets {
        let short = &a.sha256[..a.sha256.len().min(12)];
        println!("  {:<14} {} sha256={}...", a.role, a.name, short);
    }
    Ok(())
}

fn cmd_write(args: &[String]) -> Result<(), String> {
    let path = args.first().ok_or("usage: mk-flash write <file.uf2>")?;
    let bytes = std::fs::read(path).map_err(|e| format!("read {path}: {e}"))?;
    validate_uf2(&bytes, &Uf2Limits::default()).map_err(|e| e.to_string())?;

    let env = RealEnv::new();
    let baseline: Vec<String> = scan_bootloader_volumes(&env)
        .into_iter()
        .map(|v| v.path)
        .collect();
    println!("Put the keyboard into bootloader mode (double-tap reset)...");
    let cancel = CancelFlag::new();
    let vol = acquire_bootloader(
        &env,
        &baseline,
        Some(BOARD_ID_PREFIX),
        Duration::from_secs(60),
        Duration::from_millis(500),
        &cancel,
    )
    .map_err(|e| e.to_string())?;
    println!("detected {}", vol.path);
    flash_one(&env, &PathBuf::from(&vol.path), path, &bytes)
}

fn cmd_flow(args: &[String]) -> Result<(), String> {
    let manifest_url = flag_value(args, "--manifest")
        .ok_or("usage: mk-flash flow --manifest <url> [--reset]")?;
    let do_reset = args.iter().any(|a| a == "--reset");

    let manifest =
        mk_flash_core::download::fetch_manifest(&manifest_url).map_err(|e| e.to_string())?;
    println!("release {} ({} assets)", manifest.version, manifest.assets.len());

    let dir = std::env::temp_dir().join(format!("mk-flash-{}", manifest.version));
    let central = manifest.central().ok_or("manifest missing central asset")?;
    let peripheral = manifest.peripheral().ok_or("manifest missing peripheral asset")?;

    let env = RealEnv::new();

    if do_reset && manifest.requires_settings_reset {
        let reset = manifest
            .settings_reset()
            .ok_or("manifest requires settings_reset but has no asset")?;
        let reset_path =
            mk_flash_core::download::download_asset(reset, &dir).map_err(|e| e.to_string())?;
        println!("== R: settings_reset ==");
        guided_flash(&env, &reset_path, &reset.uf2_limits())?;
        println!("== R: firmware ==");
        let r = mk_flash_core::download::download_asset(central, &dir).map_err(|e| e.to_string())?;
        guided_flash(&env, &r, &central.uf2_limits())?;
        println!("== L: settings_reset ==");
        guided_flash(&env, &reset_path, &reset.uf2_limits())?;
        println!("== L: firmware ==");
        let l =
            mk_flash_core::download::download_asset(peripheral, &dir).map_err(|e| e.to_string())?;
        guided_flash(&env, &l, &peripheral.uf2_limits())?;
    } else {
        println!("== R (right, central) ==");
        let r = mk_flash_core::download::download_asset(central, &dir).map_err(|e| e.to_string())?;
        guided_flash(&env, &r, &central.uf2_limits())?;
        println!("== L (left, peripheral) ==");
        let l =
            mk_flash_core::download::download_asset(peripheral, &dir).map_err(|e| e.to_string())?;
        guided_flash(&env, &l, &peripheral.uf2_limits())?;
    }
    println!("done. Re-pair with your host if this was a settings_reset update.");
    Ok(())
}

fn guided_flash(env: &dyn FlashEnv, uf2_path: &Path, limits: &Uf2Limits) -> Result<(), String> {
    let bytes = std::fs::read(uf2_path).map_err(|e| format!("read {uf2_path:?}: {e}"))?;
    validate_uf2(&bytes, limits).map_err(|e| e.to_string())?;
    let baseline: Vec<String> = scan_bootloader_volumes(env).into_iter().map(|v| v.path).collect();
    println!("  double-tap reset to enter bootloader mode...");
    let cancel = CancelFlag::new();
    let vol = acquire_bootloader(
        env,
        &baseline,
        Some(BOARD_ID_PREFIX),
        Duration::from_secs(60),
        Duration::from_millis(500),
        &cancel,
    )
    .map_err(|e| e.to_string())?;
    println!("  detected {}", vol.path);
    flash_one(env, &PathBuf::from(&vol.path), uf2_path.to_str().unwrap_or("uf2"), &bytes)
}

fn flash_one(env: &dyn FlashEnv, volume: &Path, name_hint: &str, bytes: &[u8]) -> Result<(), String> {
    let filename = Path::new(name_hint)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "firmware.uf2".to_string());
    let cancel = CancelFlag::new();
    let outcome = flash_uf2(
        env,
        volume,
        &filename,
        bytes,
        &FlashConfig::default(),
        &mut |p| println!("  {p:?}"),
        &cancel,
    )
    .map_err(|e| e.to_string())?;
    println!("  {outcome:?}");
    Ok(())
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}
