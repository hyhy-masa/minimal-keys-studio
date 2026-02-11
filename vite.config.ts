import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/minimal-keys-studio/",
  server: {
    strictPort: false,
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
