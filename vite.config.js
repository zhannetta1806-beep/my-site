import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      strict: true,
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/*.sqlite",
        "**/*.sqlite-*",
        "**/data/**",
      ],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
        xfwd: true,
      },
    },
  },
  preview: {
    headers: {
      "Cache-Control": "no-store",
    },
  },
});
