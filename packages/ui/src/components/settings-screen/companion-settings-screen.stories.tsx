import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	expectLaptopWindow,
	expectSettingsChrome,
	expectSettingsMenuLeftColumn,
	expectSettingsPage,
	LAPTOP_WINDOW,
	opaque,
	slotIn,
} from "@workspace/storybook/story-utils"
import { TITLE_BAR } from "@workspace/ui/components/app-title-bar.fixtures"
import {
	type BotModelOption,
	type BotSettingsValue,
	DEFAULT_BOT_OUTPUT_STYLE,
} from "@workspace/ui/components/bot-settings"
import { BOT_MEMORY } from "@workspace/ui/components/bot-settings-dialog/memory.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
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
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "@workspace/ui/components/sidebar-resize"
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
	identity: { blot: BLOT_HUES.green },
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

const RAIL: CompanionSettingsScreenProps["rail"] = {
	selected: "conversations",
	user: { name: "Ada Martin" },
}

const ScreenHost = (props: CompanionSettingsScreenProps) => {
	const [entry, setEntry] = useState(props.entry)
	const [value, setValue] = useState(props.value)

	return (
		<CompanionSettingsScreen
			{...props}
			entry={entry}
			onEntryChange={(next, modifiers) => {
				setEntry(next)
				props.onEntryChange(next, modifiers)
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

const inlinePaddingOf = (element: HTMLElement) => {
	const style = getComputedStyle(element)
	return [style.paddingInlineStart, style.paddingInlineEnd]
}

const entryIn = (menu: HTMLElement, name: string) =>
	within(menu).getByRole("button", { name })

const FULL_PAGES = new Set(["Skills", "Applications", "History", "Approvals"])

const expectPageShown = (label: string) =>
	expectSettingsPage(
		screen.getByRole("main"),
		label,
		FULL_PAGES.has(label) ? "full" : "column",
	)

const meta = preview.meta({
	title: "Settings/Bot/CompanionSettingsScreen",
	component: CompanionSettingsScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A companion's settings as a whole window instead of the dialog. The settings menu takes the place of the conversations panel: the Back link the caller names, the companion's hexagon, its name and Companion settings, then the dialog's ten sections with Danger zone pinned at the foot. The content column draws the same panels the dialog draws. Each page sits under a header bar the height of a conversation's header carrying the entry's label, its first row where a conversation's first message starts: forms in a column centred and capped at 800px, lists across the whole card. Skills, Applications, History and Approvals are lists.",
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
		titleBar: { ...TITLE_BAR, onSelectSpace: fn() },
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
					"Artboard H02: the companion's settings open on General. Check the menu order with Danger zone pinned last under its rule, the 36px hexagon beside the name and Companion settings inset as far as the Settings title the entries sit under, General as the current page, and the Name then Title fields under the General title.",
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
		await expect(
			within(menu).getByRole("list", { name: "Settings" }),
		).toContainElement(entryIn(menu, "General"))
		await expect(inlinePaddingOf(slotIn(menu, "settings-menu-header"))).toEqual(
			inlinePaddingOf(slotIn(menu, "settings-menu-group-title")),
		)

		await expectPageShown("General")
		const main = screen.getByRole("main")
		await expect(within(main).getByLabelText("Title")).toHaveValue("Writer")
		await userEvent.type(within(main).getByLabelText("Name"), "!")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ name: "Juniper!" }),
		)
		await expect(within(menu).getByText("Juniper!")).toBeVisible()
	},
})

export const CompanionGeneral = meta.story({
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see a companion's General page as a form page in a laptop window. Check the General header bar, then the Name and Title fields in a column centred and capped at 800px, the first row where a conversation's first message starts. The screen in a 1280 by 800 window, the size the review screenshot is taken at.",
			},
		},
	},
	play: async () => {
		await expectLaptopWindow()
		await menuIn()
		await expectPageShown("General")
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
		await expectPageShown("Appearance")
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("radio", { name: "Red" }),
		)
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				identity: expect.objectContaining({ blot: BLOT_HUES.red }),
			}),
		)
	},
})

export const AppearanceAtFreeHue = meta.story({
	args: {
		entry: "appearance",
		value: { ...COMPANION, identity: { blot: 210 } },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Appearance for a companion stored at a hue outside the eight presets, 210. Check that `Your hue` is selected at 210 rather than the nearest preset, and that moving the slider writes the new hue back untouched. Pick `Appearance` for a preset.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		await menuIn()
		await expectPageShown("Appearance")
		const page = within(screen.getByRole("main"))

		await expect(page.getByRole("radio", { name: "Your hue" })).toBeChecked()
		const slider = page.getByRole("slider", { name: "Your hue" })
		await expect(slider).toHaveValue("210")

		slider.focus()
		await userEvent.keyboard("{ArrowRight}")
		await expect(args.onValueChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				identity: expect.objectContaining({ blot: 211 }),
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
		await expectPageShown("Instructions")
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
		await expectPageShown("Skills")
	},
})

export const Applications = meta.story({
	args: { entry: "mcp" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard H06: Applications, its description, search, add button and rows. Check that the menu holds no application under the entry, that a row of the list opens the application as a pushed page in the centred column, and that Applications stays the current entry and the header label.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const menu = await menuIn()
		await expectPageShown("Applications")
		await expect(
			within(menu).queryByRole("button", { name: "Linear Connected" }),
		).not.toBeInTheDocument()
		await userEvent.click(
			within(screen.getByRole("main")).getByRole("button", {
				name: "Open Linear",
			}),
		)
		await expect(args.onMcpServerOpen).toHaveBeenLastCalledWith("linear")
		await expect(
			await screen.findByRole("heading", { level: 2, name: "Linear" }),
		).toBeVisible()
		await expect(entryIn(menu, "Applications")).toHaveAttribute(
			"aria-current",
			"page",
		)
		await expectSettingsPage(screen.getByRole("main"), "Applications", "column")
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
		await expectPageShown("Secrets")
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
		await expectPageShown("History")
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
		await expectPageShown("Approvals")
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
		await expectPageShown("Runtime")
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
		await expectPageShown("Danger zone")
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

const LEFT_COLUMN = {
	parameters: {
		docs: {
			description: {
				story:
					"The companion settings menu as the left column every screen shares. Check that the column opens 8px under its top edge and closes 12px over its bottom edge, that its pieces stand 8px apart, that its back header is 32px tall like the Conversations panel header and that its first entry sits 8px in from its inner edge, the same numbers the Conversations and Missions panels and the User and Space settings menus read.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectSettingsMenuLeftColumn(canvasElement)
	},
}

export const LeftColumn = meta.story(LEFT_COLUMN)

export const LeftColumnDark = meta.story({
	...LEFT_COLUMN,
	globals: { theme: "dark" },
})

export const DefaultWidth = meta.story({
	args: { width: SIDEBAR_DEFAULT_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"Artboards H02 to H11: a companion's settings at the panel width the conversations screen opens with. Check that the 34px title bar carries the window controls reserve and the Space switcher at the place the conversations screen draws them, that the 60px rail follows, and that the menu panel is 304px wide with the conversations panel's end separator. Pick `MinimumWidth` or `MaximumWidth` for a reader who resized the panel.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_DEFAULT_WIDTH),
})

export const MinimumWidth = meta.story({
	args: { width: SIDEBAR_MIN_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"`DefaultWidth` after the reader narrowed the conversations panel as far as it goes. Check that the menu panel follows it down to 224px and the title bar and rail do not move.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_MIN_WIDTH),
})

export const MaximumWidth = meta.story({
	args: { width: SIDEBAR_MAX_WIDTH },
	parameters: {
		docs: {
			description: {
				story:
					"`DefaultWidth` after the reader widened the conversations panel as far as it goes. Check that the menu panel follows it up to 416px and the title bar and rail do not move.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectSettingsChrome(canvasElement, SIDEBAR_MAX_WIDTH),
})
