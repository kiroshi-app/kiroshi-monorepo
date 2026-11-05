import { defineConfig } from "vitest/config"

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export
export default defineConfig({
	test: { include: ["board/**/*.test.ts"], environment: "node" },
})
