# Codex 独立レビュー（第3の目）— Track2 設計

OpenAI Codex による独立レビュー（2026-07-09、実コード裏取り）。設計= Fable5、
土台レビュー= 別 Fable5、本レビュー= Codex の3重チェック。方針はこの後、案A(統合)
→ **案B(単独ツール)** に転換（`~/.claude/plans/fable-curious-rabin.md` / minimal-keys-flash 実装）。

---

## CONFIRMED（同意できる部分）

- Studio本体にflash/UF2書込機能は現状なし。Tauri登録済みコマンドもtransport系6個だけ（main.rs:23 / capabilities default.json:28）。
- build対象はR/L/settings_resetの3つ、R/Lとも `studio-rpc-usb-uart` snippet付き（build.yaml:3）。
- `&bootloader → sys_reboot(0x57) → GPREGRET` は成立（reset.h:13 / behavior_reset.c:32 / Kconfig:45）。
- Seeed/Adafruit bootloader側も `DFU_MAGIC_UF2_RESET=0x57`、`UF2_VOLUME_LABEL "XIAO-SENSE"`、`UF2_BOARD_ID "nRF52840-SeeedXiaoSense-v1"`（外部一次ソース）。
- 現物UF2はR/L/settings_resetすべて 512B境界・全ブロックmagic正常・flags 0x2000・familyID 0xADA52840・先頭targetAddr 0x27000。
- settings_reset.uf2はNVS設定領域全体を消す（settings_reset.conf:2 / reset_settings_nvs.c:21）。

## 要修正（誤り・過小評価）

- 1(a): 「全チェーン裏取り済み」は言い過ぎ。出荷済み個体のbootloaderはwest.ymlでpinされない。UF2 bootloader 0.6.1個体差あり（flash-troubleshooting.md:7）→ 各ロットのINFO_UF2.TXT実測をM1必須に。
- 1(b): familyID 0xADA52840はnRF52840系判定でminimal-keys/R/L判定ではない。flags&0x2000・blockNo/numBlocks整合・重複なし・targetAddr範囲・payloadSize妥当性を入れよ。§3.3のtargetAddr範囲ガードが弱い。
- 1(c): 「単一ボリューム＋baseline差分」はRステップでLだけリセットする事故を防げない。かつ設計の `get_device_info.name=="minimal-keys_R"` は**誤り**（実際は "minimal-keys"。minimal-keys_R.conf:10 / core_subsystem.c:25）。
- 1(d): I/Oエラー容認が広すぎ。EACCES/0バイト失敗まで末期I/O扱いは危険。macOS FSKitでマウント直後Permission denied → 2秒待ち＋リトライ＋cp -X＋sync が必要（flash-troubleshooting.md:20 / flash_v5_production.sh:48）。
- 1(e): WindowsはMSC書込で標準ユーザー権限で足りるは概ね妥当だが「stdだけで中〜高」は過信。A:Z走査はnot-ready/ネットワークドライブ/AV/レター再利用で揺れる。Win実機で確定を。
- 2: settings_resetによる設定消失は重大。既存exportはキーマップのみ（keymap-io.ts:15）。combos/rip/rsr/holdtapは保存対象。GATT変更を顧客セルフ更新させるならbackup/restore必須。
- 3: A案は主ルートとして最適だが「Bに利点なし」は言い過ぎ。救出専用の独立CLI/GUIはサポート用途で価値あり。A本体＋flash coreをcrate化して救出ツールへ切り出せる設計を推奨。
- 4: ロードマップ順序修正が必要。Mac+Win要件なので顧客到達はM3後。初回がsettings_reset込みならM5を後ろに置くのは危険、M2/M3前後にbackup/restore込みで前倒し。
- 5: 「真の文鎮ほぼゼロ」は方向妥当だが顧客視点の機能的文鎮を過小評価。RにL/LにR/片側だけ/bond消失/古いbootloaderで非アンマウント/途中抜線/AV隔離をリカバリ導線に明示。

## 追加提案

- dfu.GetFirmwareInfo に role(central/peripheral)/build target/board id/settings schema/split protocol version を持たせ、nameでのR/L検証は捨てる。
- 手動MVPは「R/L機械識別不能」前提で、書込後の失敗分類を厚く（RにL/LにR を分けて復旧誘導）。
- GATT変更は backup→settings_reset→更新→再接続→restore、BLEボンドのみ再ペアリング。復元対象=keymap/combos/RIP/RSR/hold-tap/activity。
- manifestに requires_backup_restore / breaking_gatt / min_bootloader_version_tested / assets.role / assets.target_addr_min|max / sha256 を追加。
- 書込は「任意I/O容認」でなくエラー種別×書込済みバイト数×アンマウントの状態機械に。

## 総括

A案で進める判断は妥当だが、この設計のまま実装開始は危ない。R/L検証の誤り、settings_reset時の設定保全、I/Oエラー判定の3点はMVP前に設計修正が必要。

→ **本レビュー後の方針転換**: まさかず判断で案B(Studioと分離した単独GUIツール, flash専用)を採用。R/L検証誤りは「名前判別を捨て順序＋単一ボリューム＋書込後分類」で、設定保全は「Studio側に残す（更新前後にStudioで退避/復元）」で、I/O判定は「errno×書込済みバイト×アンマウントの状態機械」で解決。実装= `~/farmware/minimal-keys-flash`。
