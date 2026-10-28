import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

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
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		environment: "happy-dom",
		maxWorkers: readTestWorkers(),
	},
	resolve: {
		alias: {
			"@workspace/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
			"@": resolve(import.meta.dirname, "../app/src"),
		},
	},
})
