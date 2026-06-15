import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// On GitHub Pages a project site is served from https://<user>.github.io/<repo>/,
// so production assets must be prefixed with "/pdf-highlight/". Dev stays at "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/pdf-highlight/" : "/",
  plugins: [react()],
}));
