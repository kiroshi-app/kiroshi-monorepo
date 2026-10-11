import babel from "@rolldown/plugin-babel"
import { defineMain } from "@storybook/react-vite/node"
import { reactCompilerPreset } from "@vitejs/plugin-react"

export default defineMain({
	framework: "@storybook/react-vite",
	stories: ["../src/**/*.@(mdx|stories.tsx)"],
	addons: [
		"@storybook/addon-docs",
		"@storybook/addon-a11y",
		"@storybook/addon-themes",
		"@storybook/addon-vitest",
		"storybook-addon-pseudo-states",
		"@storybook/addon-mcp",
	],
	typescript: {
		reactDocgen: "react-docgen-typescript",
		reactDocgenTypescriptOptions: {
			skipChildrenPropWithoutDoc: false,
			tsconfigPath: "tsconfig.docgen.json",
			include: ["**/*.tsx", ".storybook/**/*.tsx"],
		},
	},
	tags: {
		experimental: { defaultFilterSelection: "exclude" },
		deprecated: { defaultFilterSelection: "exclude" },
		"test-only": { defaultFilterSelection: "exclude" },
	},
	viteFinal: async (config) => {
		const { mergeConfig } = await import("vite")
		const tailwindcss = await import("@tailwindcss/vite")

		return mergeConfig(config, {
			plugins: [
				babel({ presets: [reactCompilerPreset()] }),
				tailwindcss.default(),
			],
			resolve: {
				alias: {
					"@workspace/storybook": new URL("../.storybook", import.meta.url)
						.pathname,
					"@workspace/ui": new URL("../src", import.meta.url).pathname,
				},
			},
			optimizeDeps: {
				include: ["@keyline-icons/react", "motion/react", "shiki"],
			},
		})
	},
})
