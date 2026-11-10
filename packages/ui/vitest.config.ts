import { fileURLToPath } from "node:url"

import babel from "@rolldown/plugin-babel"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

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

export default defineConfig({
	test: {
		projects: [
			{
				plugins: [babel({ presets: [reactCompilerPreset().preset] })],
				resolve: {
					alias: {
						"@workspace/ui": fileURLToPath(new URL("./src", import.meta.url)),
					},
				},
				test: {
					name: "unit",
					environment: "node",
					maxWorkers: readTestWorkers(),
					include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
				},
			},
		],
	},
})
