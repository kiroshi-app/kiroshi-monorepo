import { resolve } from "node:path"

import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// biome-ignore lint/style/noDefaultExport: Vite requires a default export
export default defineConfig({
	base: "/",
	plugins: [
		react(),
		babel({ presets: [reactCompilerPreset()] }),
		tailwindcss(),
	],
	server: {
		port: 5173,
		host: "127.0.0.1",
	},
	resolve: {
		alias: {
			"@workspace/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
		},
	},
})
