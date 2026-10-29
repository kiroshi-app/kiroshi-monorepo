import { resolve } from "node:path"

import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { version } from "./package.json" with { type: "json" }

// biome-ignore lint/style/noDefaultExport: Vite requires a default export
export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(version) },
	clearScreen: false,
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
	],
	server: {
		port: 1420,
		strictPort: true,
		host: "127.0.0.1",
		watch: { ignored: ["**/src-tauri/**"] },
	},
	build: {
		target: "safari13",
		cssTarget: "safari16.4",
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
		rolldownOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				dragGhost: resolve(__dirname, "drag-ghost.html"),
			},
		},
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			"@workspace/ui": resolve(__dirname, "../../packages/ui/src"),
		},
	},
})
