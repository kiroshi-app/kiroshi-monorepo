import { fileURLToPath } from "node:url"

import babel from "@rolldown/plugin-babel"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

import { version } from "./package.json" with { type: "json" }

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(version) },
	plugins: [babel({ presets: [reactCompilerPreset().preset] })],
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			"@workspace/ui": fileURLToPath(
				new URL("../../packages/ui/src", import.meta.url),
			),
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
})
