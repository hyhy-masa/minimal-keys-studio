import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const isTauri = !!process.env.TAURI_ENV_PLATFORM || !!process.env.TAURI_PLATFORM;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: isTauri ? "/" : "/minimal-keys-studio/",
  clearScreen: false,
  server: {
    strictPort: true,
  },
  envPrefix: [
    "VITE_",
    "TAURI_PLATFORM",
    "TAURI_ARCH",
    "TAURI_FAMILY",
    "TAURI_PLATFORM_VERSION",
    "TAURI_PLATFORM_TYPE",
    "TAURI_DEBUG",
  ],
  define: {
    // Release flag for the firmware-update feature (B/C flasher wizard).
    // src/firmware-update/isTauri.ts gates on isTauri() AND
    // VITE_FEATURE_FW_UPDATE === "1". ON in production builds (npm run build /
    // tauri build), OFF in dev so the wizard stays hidden while iterating.
    // Override explicitly with the VITE_FEATURE_FW_UPDATE env var if needed.
    // Kept here (not a committed .env file) so the release flag is versioned
    // and reviewable in one place.
    "import.meta.env.VITE_FEATURE_FW_UPDATE": JSON.stringify(
      process.env.VITE_FEATURE_FW_UPDATE ?? (mode === "production" ? "1" : "0"),
    ),
  },
  build: {
    target: isTauri
      ? (process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM) == "windows"
        ? "chrome105"
        : "safari13"
      : "es2022",
    minify: !(process.env.TAURI_ENV_DEBUG || process.env.TAURI_DEBUG) ? "esbuild" : false,
    sourcemap: !!(process.env.TAURI_ENV_DEBUG || process.env.TAURI_DEBUG),
  },
}));
