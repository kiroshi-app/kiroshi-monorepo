import "./styles.css"

import addonA11y from "@storybook/addon-a11y"
import addonDocs from "@storybook/addon-docs"
import addonThemes, { withThemeByClassName } from "@storybook/addon-themes"
import {
	type Decorator,
	definePreview,
	type ReactRenderer,
} from "@storybook/react-vite"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { prepareHighlighter } from "@workspace/ui/lib/code-highlight"

import { THEME_CLASS_NAMES, ThemedDocsContainer } from "./themed-docs-container"

prepareHighlighter()

const SIDE_BY_SIDE_THEMES = Object.keys(THEME_CLASS_NAMES)

const withTranslations: Decorator = (Story) => (
	<I18nProvider>
		<Story />
	</I18nProvider>
)

const withThemeLayout: Decorator = (Story, context) => {
	if (context.globals.theme_layout !== "side-by-side") {
		return <Story />
	}

	return (
		<div className="grid grid-cols-2 gap-px bg-border">
			{SIDE_BY_SIDE_THEMES.map((theme) => (
				<div key={theme} className={`${theme} bg-card p-6 text-foreground`}>
					<Story />
				</div>
			))}
		</div>
	)
}

export default definePreview({
	addons: [addonDocs(), addonA11y(), addonThemes()],
	tags: ["autodocs"],
	decorators: [
		withThemeByClassName<ReactRenderer>({
			themes: THEME_CLASS_NAMES,
			defaultTheme: "light",
		}),
		withThemeLayout,
		withTranslations,
	],
	globalTypes: {
		theme_layout: {
			description: "Render the story in one theme or in both at once",
			toolbar: {
				title: "Theme layout",
				icon: "mirror",
				items: [
					{ value: "single", title: "Single" },
					{ value: "side-by-side", title: "Side by side" },
				],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		theme_layout: "single",
	},
	parameters: {
		a11y: {
			test: "error",
			context: { exclude: ["[data-base-ui-focus-guard]"] },
		},
		docs: { container: ThemedDocsContainer },
		options: {
			storySort: (a, b) => {
				const FAMILIES = [
					"Foundations",
					"Primitives",
					"Forms",
					"Feedback",
					"Navigation",
					"Layout",
					"Overlays",
					"Branding",
					"Conversation",
					"Settings",
				]
				const SUB_LEVELS = [
					"Foundations/Introduction",
					"Foundations/Colors",
					"Foundations/Typography",
					"Foundations/Spacing",
					"Foundations/Radius & Shadows",
					"Foundations/Scrollbars",
					"Foundations/Motion",
					"Foundations/Icons",
					"Primitives/Overview",
					"Forms/Overview",
					"Feedback/Overview",
					"Navigation/Overview",
					"Layout/Overview",
					"Overlays/Overview",
					"Branding/Overview",
					"Conversation/Overview",
					"Conversation/Message",
					"Conversation/Prompt",
					"Conversation/Markdown",
					"Conversation/Tools",
					"Conversation/Missions",
					"Conversation/Routines",
					"Conversation/Missions",
					"Conversation/Onboarding",
					"Settings/Overview",
					"Settings/Bot",
					"Settings/User",
					"Settings/Space",
					"Settings/Environment",
					"Settings/Conversation",
					"Settings/Plugins",
				]
				const UNRANKED = SUB_LEVELS.length

				const [familyA, ...pathA] = a.title.split("/")
				const [familyB, ...pathB] = b.title.split("/")

				const familyRankA = FAMILIES.indexOf(familyA)
				const familyRankB = FAMILIES.indexOf(familyB)
				if (familyRankA === -1 || familyRankB === -1) {
					const unknown = familyRankA === -1 ? familyA : familyB
					throw new Error(
						`Unknown top-level story family "${unknown}". Allowed: ${FAMILIES.join(", ")}.`,
					)
				}

				const subRankA = SUB_LEVELS.indexOf(`${familyA}/${pathA[0]}`)
				const subRankB = SUB_LEVELS.indexOf(`${familyB}/${pathB[0]}`)

				return (
					[
						familyRankA - familyRankB,
						(subRankA === -1 ? UNRANKED : subRankA) -
							(subRankB === -1 ? UNRANKED : subRankB),
						(a.tags?.includes("deprecated") ? 1 : 0) -
							(b.tags?.includes("deprecated") ? 1 : 0),
						pathA.join("/").localeCompare(pathB.join("/")),
						(a.type === "docs" ? 0 : 1) - (b.type === "docs" ? 0 : 1),
					].find((comparison) => comparison !== 0) ?? 0
				)
			},
		},
		viewport: {
			options: {
				mobile: { name: "Mobile", styles: { width: "390px", height: "844px" } },
				tablet: {
					name: "Tablet",
					styles: { width: "768px", height: "1024px" },
				},
				laptop: {
					name: "Laptop",
					styles: { width: "1280px", height: "800px" },
				},
				desktop: {
					name: "Desktop",
					styles: { width: "1536px", height: "960px" },
				},
			},
		},
	},
})
