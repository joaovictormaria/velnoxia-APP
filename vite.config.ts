import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    host: true,
    // Pinned so the dev URL stays stable — the nitro plugin otherwise
    // switches the dev server to its own default port.
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    // Builds the server output Vercel deploys as a Function — without it the
    // build emits a bare fetch handler that no host knows how to run.
    nitro(),
    viteReact(),
  ],
});
