import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		environment: "happy-dom",
	},
	resolve: {
		alias: {
			"@workspace/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
		},
	},
})
