import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const isTauri = !!process.env.TAURI_PLATFORM;

// https://vitejs.dev/config/
export default defineConfig({
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
  build: {
    target: isTauri
      ? process.env.TAURI_PLATFORM == "windows"
        ? "chrome105"
        : "safari13"
      : "es2022",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
