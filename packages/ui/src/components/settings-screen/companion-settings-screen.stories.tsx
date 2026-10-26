import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	opaque,
	slotIn,
} from "@workspace/storybook/story-utils"
import { AppRail } from "@workspace/ui/components/app-rail"
import {
	type BotModelOption,
	type BotSettingsValue,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { BOT_ENVIRONMENT } from "@workspace/ui/components/environment.fixtures"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
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
import { i18n } from "@workspace/ui/lib/i18n"

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

const INSTRUCTIONS =
	"You write release notes and changelogs for the Studio team. Group changes by area, lead with what a reader can now do, and keep each line under twenty words. Ask before publishing anything."

const INSTRUCTIONS_BOX_HEIGHT = 220

const COMPANION: BotSettingsValue = {
	identity: { blot: "green" },
	name: "Juniper",
	title: "Writer",
	instructions: INSTRUCTIONS,
	model: "sonnet-4-6",
	effort: "medium",
	permissions: {
		defaultMode: "acceptEdits",
		allow: ["Read", "Bash(git log:*)"],
		ask: ["Bash(git push:*)"],
		deny: [],
	},
}

const MODELS: BotModelOption[] = [
	{
		label: "Claude Sonnet 4.6",
		value: "sonnet-4-6",
		supportedEfforts: ["low", "medium", "high"],
	},
	{ label: "Claude Haiku 4.5", value: "haiku-4-5", supportedEfforts: [] },
]

const RAIL = () => (
	<AppRail selected="conversations" user={{ name: "Ada Martin" }} />
)

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
		onServerConnect: fn(),
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
		await expect(within(menu).getByText("Juniper")).toBeVisible()
		await expect(within(menu).getByText("Companion settings")).toBeVisible()
		await expect(
			slotIn(menu, "bot-identity-avatar").getBoundingClientRect().width,
		).toBe(36)

		await expect(pageHeading("General")).toBeVisible()
		const main = screen.getByRole("main")
		await expect(within(main).getByLabelText("Title")).toHaveValue("Writer")
		await userEvent.type(within(main).getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "Juniper!" }),
		)
		await expect(within(menu).getByText("Juniper!")).toBeVisible()
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
					"Artboard H04: Instructions, the prompt in a 220px box then the companion's memory with Clear and Save memory. Check the box height, that Memory sits under it, and that the prompt saves as you type while the memory waits for Save memory.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		const main = screen.getByRole("main")
		await expect(pageHeading("Instructions")).toBeVisible()
		const instructions = within(main).getByLabelText("Instructions")
		await expect(instructions).toHaveValue(INSTRUCTIONS)
		const box = instructions.getBoundingClientRect()
		await expect(box.height).toBe(INSTRUCTIONS_BOX_HEIGHT)
		await expect(
			within(main).getByLabelText("Memory").getBoundingClientRect().top,
		).toBeGreaterThan(box.bottom)

		await userEvent.type(instructions, ".")
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

let raisedNotice: string | undefined

export const DeleteFailed = meta.story({
	args: {
		entry: "danger",
		onDelete: fn(() => {
			raisedNotice = raiseFailureNotice({ title: i18n.t("bots:danger.failed") })
		}),
	},
	render: (args) => (
		<>
			<ScreenHost {...args} />
			<NoticeSurface />
		</>
	),
	beforeEach: () => () => {
		if (raisedNotice) endNotice(raisedNotice)
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The deletion confirmed from the Danger zone failed. Check that the failure notice says the companion couldn't be deleted, not that it couldn't be removed from a space. The app raises it with `raiseFailureNotice` and the catalogue's `bots:danger.failed` copy; the screen only reports the deletion. The `aria-hidden-focus` audit is left to review for the reason given in the NoticeSurface `LongContent` story.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
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
		await opaque(await waitFor(() => slotIn(document.body, "toast")))
		const title = slotIn(document.body, "toast-title")
		await expect(title.textContent).toBe(i18n.t("bots:danger.failed"))
		await expect(
			screen.queryByText(i18n.t("bots:spaces.remove.failed")),
		).toBeNull()
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
