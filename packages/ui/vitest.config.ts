import { fileURLToPath } from "node:url"

import babel from "@rolldown/plugin-babel"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const NO_PAGE_OR_POINTER_SHARED_BETWEEN_STORY_FILES = {
	isolate: true,
	fileParallelism: false,
}

const LOCAL_MAX_WORKERS = process.env.CI ? undefined : 4

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
					maxWorkers: LOCAL_MAX_WORKERS,
					include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
				},
			},
			{
				plugins: [storybookTest({ configDir: ".storybook" })],
				test: {
					name: "storybook",
					setupFiles: [".storybook/vitest.setup.ts"],
					...NO_PAGE_OR_POINTER_SHARED_BETWEEN_STORY_FILES,
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({
							contextOptions: { reducedMotion: "reduce" },
						}),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
})
