import { useState } from "react"
import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
import {
	BLANK_BOT_PERMISSIONS,
	type BotModelOption,
	type BotSettingsValue,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { BOT_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import {
	CATALOGUE_APPLICATIONS,
	MARKED_APPLICATIONS,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { EVERYTHING_CATEGORY } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import {
	CompanionSettingsScreen,
	type CompanionSettingsScreenProps,
} from "@workspace/ui/components/settings-screen"

const BACK_TO_COMPANIONS = "Back to Companions"

const COMPANION_MENU = [
	"General",
	"Appearance",
	"Instructions",
	"Skills",
	"Applications",
	"Secrets",
	"History",
	"Approvals",
	"Runtime",
	"Danger zone",
]

const COMPANION: BotSettingsValue = {
	identity: { blot: "blue" },
	name: "Nest Keeper",
	title: "Repository archivist",
	instructions:
		"You are the Nest Keeper.\n\nEvery visual belongs to packages/ui. The app composes, it never draws.\n\nBefore proposing a component, search the package for one that already does the job. Answer with the file you would touch, then the change.",
	model: "sonnet-4-5",
	effort: "high",
	permissions: {
		...BLANK_BOT_PERMISSIONS,
		deny: ["Bash", "Edit", "Write", "NotebookEdit"],
	},
}

const MODELS: BotModelOption[] = [
	{
		label: "Claude Sonnet 4.5",
		value: "sonnet-4-5",
		supportedEfforts: ["low", "medium", "high"],
	},
	{ label: "Claude Haiku 4.5", value: "haiku-4-5", supportedEfforts: [] },
]

const RAIL = <AppRail selected="conversations" user={{ name: "Ada Martin" }} />

const ScreenHost = (props: CompanionSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)
	const [value, setValue] = useState(props.value)

	return (
		<CompanionSettingsScreen
			{...props}
			entry={entry}
			onEntryChange={(next) => {
				setEntry(next)
				props.onEntryChange(next)
			}}
			onValueChange={(next) => {
				setValue(next)
				props.onValueChange(next)
			}}
			value={value}
		/>
	)
}

const menuIn = () => screen.findByRole("navigation", { name: "Settings" })

const entryIn = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("button", { name })

const pageHeading = (name: string) =>
	within(screen.getByRole("main")).getByRole("heading", { level: 2, name })

const meta = preview.meta({
	title: "Settings/Bot/CompanionSettingsScreen",
	component: CompanionSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A companion's settings as a whole window instead of the dialog. The settings menu takes the place of the conversations panel: the Back link the caller names, the companion's hexagon, its name and Companion settings, then the dialog's ten sections with Danger zone pinned at the foot. The content column draws the same panels the dialog draws, centred under the section's title.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		entry: "general",
		onEntryChange: fn(),
		onBack: fn(),
		backLabel: BACK_TO_COMPANIONS,
		rail: RAIL,
		value: COMPANION,
		onValueChange: fn(),
		models: MODELS,
		outputStyle: DEFAULT_BOT_OUTPUT_STYLE,
		onOutputStyleChange: fn(),
		memory: BOT_MEMORY,
		onMemoryChange: fn(),
		onAvatarUpload: fn(),
		seed: "bot-7",
		environment: BOT_ENVIRONMENT,
		onEnvironmentSet: fn(),
		onEnvironmentDelete: fn(),
		skills: BOT_SKILLS,
		onSkillCreate: fn(),
		onSkillChange: fn(),
		onSkillPreloadedChange: fn(),
		onSkillDelete: fn(),
		mcpServers: MARKED_APPLICATIONS,
		onMcpServerCreate: fn(),
		onMcpServerChange: fn(),
		onMcpServerDelete: fn(),
		onMcpServerOpen: fn(),
		mcpCatalogue: {
			category: EVERYTHING_CATEGORY,
			onCategoryChange: fn(),
			query: "",
			onQueryChange: fn(),
			applications: CATALOGUE_APPLICATIONS,
			onRetry: fn(),
			onPick: fn(),
			onOpen: fn(),
		},
		history: {
			days: HISTORY_DAYS,
			oldestDate: HISTORY_OLDEST_DATE,
			onUndo: fn(),
		},
		onDelete: fn(),
	},
	render: (args) => <ScreenHost {...args} />,
})

export const General = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H02: the companion's settings open on General. Check the menu order with Danger zone pinned last under its rule, the 36px hexagon beside the name and Companion settings, General as the current page, and the Name then Title fields under the General title.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(
			within(menu)
				.getAllByRole("button")
				.map((button) => button.textContent),
		).toEqual([BACK_TO_COMPANIONS, ...COMPANION_MENU])
		await expect(entryIn(menu, "General")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(within(menu).getByText("Nest Keeper")).toBeVisible()
		await expect(within(menu).getByText("Companion settings")).toBeVisible()
		await expect(
			slotIn(menu, "bot-identity-avatar").getBoundingClientRect().width,
		).toBe(36)

		await expect(pageHeading("General")).toBeVisible()
		const main = screen.getByRole("main")
		await expect(within(main).getByLabelText("Title")).toHaveValue(
			"Repository archivist",
		)
		await userEvent.type(within(main).getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "Nest Keeper!" }),
		)
		await expect(within(menu).getByText("Nest Keeper!")).toBeVisible()
	},
})

export const Appearance = meta.story({
	args: { entry: "appearance" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H03: Appearance, the dialog's identity picker in the page column. Check that choosing a colour writes the whole value back.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		await expect(pageHeading("Appearance")).toBeVisible()
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("radio", { name: "Red" }),
		)
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				identity: expect.objectContaining({ blot: "red" }),
			}),
		)
	},
})

export const Instructions = meta.story({
	args: { entry: "instructions" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H04: Instructions, the prompt then the companion's memory with Clear and Save memory. Check that the prompt saves as you type while the memory waits for Save memory.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		const main = screen.getByRole("main")
		await expect(pageHeading("Instructions")).toBeVisible()
		await userEvent.type(within(main).getByLabelText("Instructions"), ".")
		await expect(args.onValueChange).toHaveBeenCalledOnce()

		await userEvent.type(within(main).getByLabelText("Memory"), "!")
		await userEvent.click(
			within(main).getByRole("button", { name: "Save memory" }),
		)
		await expect(args.onMemoryChange).toHaveBeenCalledWith(`${BOT_MEMORY}!`)
		await expect(
			within(main).getByRole("button", { name: "Clear" }),
		).toBeVisible()
	},
})

export const Skills = meta.story({
	args: { entry: "skills" },
	parameters: {
		docs: {
			description: {
				story: "Artboard H05: Skills, the companion's skills list.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expect(pageHeading("Skills")).toBeVisible()
	},
})

export const Applications = meta.story({
	args: { entry: "mcp" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H06: Applications, its description, search, add button and rows. Check that the menu lists each installed application under the entry, and that a row opens the application as a pushed page.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(pageHeading("Applications")).toBeVisible()
		await userEvent.click(
			await within(menu).findByRole("button", { name: "Linear Connected" }),
		)
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith("linear")
		await expect(
			await screen.findByRole("heading", { level: 2, name: "Linear" }),
		).toBeVisible()
	},
})

export const Secrets = meta.story({
	args: { entry: "environment" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H07: Secrets, the companion's environment with what it inherits from the space.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expect(pageHeading("Secrets")).toBeVisible()
		await expect(
			within(screen.getByRole("main")).getByText("BOT_SEED"),
		).toBeVisible()
	},
})

export const History = meta.story({
	args: { entry: "history" },
	parameters: {
		docs: {
			description: {
				story: "Artboard H08: History, the companion's changes day by day.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expect(pageHeading("History")).toBeVisible()
	},
})

export const Approvals = meta.story({
	args: { entry: "permissions" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H09: Approvals, what the companion may do without asking.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expect(pageHeading("Approvals")).toBeVisible()
	},
})

export const Runtime = meta.story({
	args: { entry: "runtime" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H10: Runtime, the model, the effort and the output style.",
			},
		},
	},
	play: async () => {
		await menuIn()
		await expect(pageHeading("Runtime")).toBeVisible()
	},
})

export const DangerZone = meta.story({
	args: { entry: "danger" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H11: Danger zone, the delete card. Check that Danger zone is the current page and that deleting asks first, then reports.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expect(entryIn(menu, "Danger zone")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expect(pageHeading("Danger zone")).toBeVisible()
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("button", {
				name: "Delete companion",
			}),
		)
		const question = await screen.findByRole("alertdialog")
		await userEvent.click(
			within(question).getByRole("button", { name: "Delete companion" }),
		)
		await expect(args.onDelete).toHaveBeenCalledOnce()
	},
})

export const BackToCompanions = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Opened from the Companions section. Check that the Back link reads Back to Companions and reports itself.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await userEvent.click(entryIn(menu, "Back to Companions"))
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const BackToConversations = meta.story({
	args: { backLabel: "Back to conversations" },
	parameters: {
		docs: {
			description: {
				story:
					"Opened from a conversation. Check that the Back link reads Back to conversations and reports itself.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await userEvent.click(entryIn(menu, "Back to conversations"))
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})
