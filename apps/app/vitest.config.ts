import { fileURLToPath } from "node:url"

import babel from "@rolldown/plugin-babel"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

import { version } from "./package.json" with { type: "json" }

const PERF_TESTS = [
	"src/lib/perf/chat-open-baseline.test.ts",
	"src/lib/perf/render-baseline.test.ts",
	"src/first-opening-of-a-joined-space.test.ts",
	"src/lib/sidebar/settings-subject.test.ts",
]

const LOCAL_MAX_WORKERS = process.env.CI ? undefined : 4

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(version) },
	plugins: [babel({ presets: [reactCompilerPreset().preset] })],
	test: {
		environment: "node",
		maxWorkers: LOCAL_MAX_WORKERS,
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["src/**/*.test.ts"],
					exclude: PERF_TESTS,
				},
			},
			{
				extends: true,
				test: { name: "perf", include: PERF_TESTS },
			},
		],
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
