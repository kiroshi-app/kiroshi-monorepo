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

// KIROSHI_TEST_WORKERS caps the vitest workers, 2 by default outside CI, the vitest default in CI.
const LOCAL_TEST_WORKERS = 2

const readTestWorkers = () => {
	const requested = process.env.KIROSHI_TEST_WORKERS
	if (requested === undefined) {
		return process.env.CI ? undefined : LOCAL_TEST_WORKERS
	}
	if (!/^[1-9]\d*$/.test(requested)) {
		throw new Error(
			`KIROSHI_TEST_WORKERS must be a positive integer, received "${requested}"`,
		)
	}
	return Number(requested)
}

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	define: { __APP_VERSION__: JSON.stringify(version) },
	plugins: [babel({ presets: [reactCompilerPreset().preset] })],
	test: {
		environment: "node",
		maxWorkers: readTestWorkers(),
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
