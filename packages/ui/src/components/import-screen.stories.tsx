import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	type ImportItem,
	ImportScreen,
	type ImportScreenProps,
	type ImportSection,
} from "@workspace/ui/components/import-screen"
import { i18n } from "@workspace/ui/lib/i18n"

const DARK = { theme: "dark" } as const

type Artboard = Omit<ImportScreenProps, "onToggle">

const ATLAS: ImportItem = {
	id: "atlas",
	kind: "companion",
	title: "Atlas",
	detail: "Reviews pull requests and keeps the tests green",
	checked: true,
}

const WREN: ImportItem = {
	id: "wren",
	kind: "companion",
	title: "Wren",
	detail: "Writes and tidies the docs",
	hue: 150,
	checked: true,
}

const CLAUDE_MD: ImportItem = {
	id: "claude-md",
	kind: "instructions",
	title: "CLAUDE.md",
	detail: "Your instructions for every project",
	checked: true,
}

const SKILLS: ImportItem[] = [
	{
		id: "changelog",
		kind: "skill",
		title: "changelog",
		detail: "Writes the changelog from merged pull requests",
		checked: true,
	},
	{
		id: "release-notes",
		kind: "skill",
		title: "release-notes",
		detail: "Drafts the notes for the next release",
		checked: true,
	},
	{
		id: "triage",
		kind: "skill",
		title: "triage",
		detail: "Sorts new issues by area and urgency",
		checked: true,
	},
	{
		id: "review",
		kind: "skill",
		title: "review",
		detail: "Reads a diff and flags what breaks",
		checked: true,
	},
]

const MORE_COMPANIONS: ImportItem[] = [
	["orion", "Orion", "Keeps the release branch green", 30],
	["juno", "Juno", "Answers questions about the codebase", 280],
	["pike", "Pike", "Plans the work for the week", 200],
	["sable", "Sable", "Watches the error logs", 340],
	["tamsin", "Tamsin", "Migrates the database", 60],
	["vale", "Vale", "Reviews the design tokens", 100],
	["quill", "Quill", "Writes the onboarding copy", 240],
	["rook", "Rook", "Runs the nightly benchmarks", 180],
].map(([id, title, detail, hue]) => ({
	id: String(id),
	kind: "companion" as const,
	title: String(title),
	detail: String(detail),
	hue: Number(hue),
	checked: true,
}))

const companionsOf = (items: ImportItem[]): ImportSection => ({
	id: "companions",
	label: i18n.t("common:claudeImport.sections.companions"),
	items,
})

const filesOf = (items: ImportItem[]): ImportSection => ({
	id: "instructions-and-skills",
	label: i18n.t("common:claudeImport.sections.instructionsAndSkills"),
	items,
})

const withStatus = (
	items: ImportItem[],
	status: (item: ImportItem, index: number) => ImportItem["status"],
) => items.map((item, index) => ({ ...item, status: status(item, index) }))

const FILES = [CLAUDE_MD, ...SKILLS]

const FAILED_CHANGELOG: ImportItem = {
	...SKILLS[0],
	detail: i18n.t("common:claudeImport.row.unparsable", { file: "SKILL.md" }),
	status: "failed",
}

const SKIP = { label: i18n.t("common:claudeImport.select.skip"), onPress: fn() }

const LIST: Artboard = {
	step: "select",
	title: i18n.t("common:claudeImport.select.title"),
	subtitle: i18n.t("common:claudeImport.select.body"),
	sections: [companionsOf([ATLAS, WREN]), filesOf(FILES)],
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 7 }),
		onPress: fn(),
	},
	secondary: SKIP,
}

const IMPORTING: Artboard = {
	step: "importing",
	title: i18n.t("common:claudeImport.importing.title"),
	subtitle: i18n.t("common:claudeImport.importing.body", { done: 3, count: 7 }),
	sections: [
		companionsOf(withStatus([ATLAS, WREN], () => "done")),
		filesOf(
			withStatus(FILES, (_, index) => (index === 0 ? "done" : "pending")),
		),
	],
	primary: {
		label: i18n.t("common:claudeImport.importing.action"),
		onPress: fn(),
	},
}

const DONE: Artboard = {
	step: "done",
	title: i18n.t("common:claudeImport.done.title"),
	subtitle: i18n.t("common:claudeImport.done.body", {
		companions: new Intl.ListFormat("en", { type: "conjunction" }).format([
			ATLAS.title,
			WREN.title,
		]),
		count: SKILLS.length,
	}),
	primary: {
		label: i18n.t("common:claudeImport.done.continue"),
		onPress: fn(),
	},
}

const ONLY_COMPANIONS: Artboard = {
	...LIST,
	sections: [companionsOf([ATLAS, WREN])],
	primary: {
		label: i18n.t("common:claudeImport.select.importCompanions", { count: 2 }),
		onPress: fn(),
	},
}

const ONLY_FILES: Artboard = {
	...LIST,
	sections: [filesOf(FILES)],
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 5 }),
		onPress: fn(),
	},
}

const LONG_LIST: Artboard = {
	...LIST,
	subtitle: i18n.t("common:claudeImport.select.bodyMany", { count: 10 }),
	sections: [companionsOf([ATLAS, WREN, ...MORE_COMPANIONS]), filesOf(FILES)],
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 15 }),
		onPress: fn(),
	},
}

const unchecked = (items: ImportItem[]) =>
	items.map((item) => ({ ...item, checked: false }))

const NOTHING_SELECTED: Artboard = {
	...LIST,
	subtitle: i18n.t("common:claudeImport.select.nothingSelected"),
	sections: [companionsOf(unchecked([ATLAS, WREN])), filesOf(unchecked(FILES))],
	primary: {
		label: i18n.t("common:claudeImport.select.import"),
		onPress: fn(),
	},
}

const NAME_ALREADY_TAKEN: Artboard = {
	...LIST,
	subtitle: i18n.t("common:claudeImport.select.namesTaken.two"),
	sections: [
		companionsOf([
			{
				id: "shoto",
				kind: "companion",
				title: "Shoto 2",
				detail: i18n.t("common:claudeImport.row.nameTaken", {
					name: "Shoto",
					renamed: "Shoto 2",
				}),
				hue: 320,
				checked: true,
			},
			{
				...ATLAS,
				title: "Atlas 2",
				detail: i18n.t("common:claudeImport.row.companionNameTaken", {
					name: "Atlas",
					renamed: "Atlas 2",
				}),
			},
			WREN,
		]),
	],
	primary: {
		label: i18n.t("common:claudeImport.select.importCompanions", { count: 3 }),
		onPress: fn(),
	},
}

const UNREADABLE: Artboard = {
	step: "unreadable",
	title: i18n.t("common:claudeImport.unreadable.title"),
	subtitle: i18n.t("common:claudeImport.unreadable.body"),
	primary: {
		label: i18n.t("common:claudeImport.unreadable.retry"),
		onPress: fn(),
	},
	secondary: SKIP,
}

const PARTLY_FAILED: Artboard = {
	step: "done",
	title: i18n.t("common:claudeImport.partlyFailed.title"),
	subtitle: i18n.t("common:claudeImport.partlyFailed.body", {
		name: FAILED_CHANGELOG.title,
	}),
	sections: [
		companionsOf(withStatus([ATLAS, WREN], () => "done")),
		filesOf([
			{ ...CLAUDE_MD, status: "done" },
			FAILED_CHANGELOG,
			...withStatus(SKILLS.slice(1), () => "done"),
		]),
	],
	primary: {
		label: i18n.t("common:claudeImport.done.continue"),
		onPress: fn(),
	},
	secondary: {
		label: i18n.t("common:claudeImport.partlyFailed.retry", {
			name: FAILED_CHANGELOG.title,
		}),
		onPress: fn(),
	},
}

const alreadyIn = (items: ImportItem[]) =>
	items.map((item) => ({ ...item, checked: false, isInKiroshi: true }))

const AGAIN_FROM_SETTINGS: Artboard = {
	step: "select",
	title: i18n.t("common:claudeImport.fromSettings.title"),
	subtitle: i18n.t("common:claudeImport.fromSettings.body"),
	sections: [
		companionsOf(alreadyIn([ATLAS, WREN])),
		filesOf([
			...alreadyIn([CLAUDE_MD, ...SKILLS.slice(0, 2)]),
			...SKILLS.slice(2),
		]),
	],
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 2 }),
		onPress: fn(),
	},
	secondary: {
		label: i18n.t("common:claudeImport.fromSettings.cancel"),
		onPress: fn(),
	},
}

const describe = (story: string) => ({ docs: { description: { story } } })

const primaryIn = (canvasElement: HTMLElement, name: string) =>
	within(slotIn(canvasElement, "import-screen")).getByRole("button", { name })

const meta = preview.meta({
	title: "Feedback/ImportScreen",
	component: ImportScreen,
	globals: { viewport: { value: "window" } },
	parameters: {
		layout: "fullscreen",
		viewport: {
			options: {
				window: {
					name: "1200 by 760 window",
					styles: { width: "1200px", height: "760px" },
				},
			},
		},
		docs: {
			description: {
				component:
					"Import from Claude Code: what Kiroshi found in ~/.claude on the reader's computer, the companions in one card and the CLAUDE.md instructions with the skills in another, every row checked by default. Four steps: `select` with a checkbox per row, `importing` with a status icon per row, `done` with or without the rows and their final status, and `unreadable` when the folder could not be opened. Copy comes in as props, from the `common:claudeImport` catalogue. The primary action is disabled while importing and while nothing is checked. A list taller than the window scrolls alone, the actions stay in view. Measured against the Paper file `Kiroshi, Onboarding v2`, artboards 3.1 to 3.3 and C01 to C08, light and dark.",
			},
		},
	},
	args: { onToggle: fn() },
})

export const List = meta.story({
	name: "3.1 List",
	args: LIST,
	parameters: describe(
		"The nominal onboarding case: two companions, CLAUDE.md and four skills, all checked. Check that both cards share the 560 px column, the checkboxes wear the Space accent, and that unchecking a row hands its id to `onToggle`.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await userEvent.click(canvas.getByRole("checkbox", { name: "Wren" }))
		await expect(args.onToggle).toHaveBeenCalledWith("wren", false)
		if (!isInBrowserRunner()) return
		const controls = [
			canvas.getByRole("checkbox", { name: "Atlas" }),
			primaryIn(
				canvasElement,
				i18n.t("common:claudeImport.select.importItems", { count: 7 }),
			),
			canvas.getByRole("button", {
				name: i18n.t("common:claudeImport.select.skip"),
			}),
		]
		await withMotionAllowed(async () => {
			for (const control of controls) {
				await expect(getComputedStyle(control).transitionDuration).toBe("0s")
			}
		})
	},
})

export const ListDark = meta.story({
	name: "3.1 List, dark",
	args: LIST,
	globals: DARK,
	parameters: describe("3.1 List on the dark scheme."),
})

export const Importing = meta.story({
	name: "3.2 Importing",
	args: IMPORTING,
	parameters: describe(
		"The import is running, three of seven done. Check that no checkbox is left, that each row carries a done or in progress icon with its label, and that the primary action is disabled with no Skip link.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole("checkbox")).toBeNull()
		await expect(canvas.getAllByRole("img", { name: "Done" })).toHaveLength(3)
		await expect(
			canvas.getAllByRole("img", { name: "In progress" }),
		).toHaveLength(4)
		const primary = primaryIn(
			canvasElement,
			i18n.t("common:claudeImport.importing.action"),
		)
		await expect(primary).toHaveAttribute("aria-disabled", "true")
		await userEvent.click(primary, { pointerEventsCheck: 0 })
		await expect(args.primary?.onPress).not.toHaveBeenCalled()
	},
})

export const ImportingDark = meta.story({
	name: "3.2 Importing, dark",
	args: IMPORTING,
	globals: DARK,
	parameters: describe("3.2 Importing on the dark scheme."),
})

export const Done = meta.story({
	name: "3.3 Done",
	args: DONE,
	parameters: describe(
		"Everything came in. No list, only the summary and Continue. Pick `PartlyFailed` when a row did not come in.",
	),
})

export const DoneDark = meta.story({
	name: "3.3 Done, dark",
	args: DONE,
	globals: DARK,
	parameters: describe("3.3 Done on the dark scheme."),
})

export const OnlyCompanions = meta.story({
	name: "C01 Only companions",
	args: ONLY_COMPANIONS,
	parameters: describe(
		"~/.claude holds companions and nothing else. Check that the single card centres with the whole column in the window.",
	),
})

export const OnlyCompanionsDark = meta.story({
	name: "C01 Only companions, dark",
	args: ONLY_COMPANIONS,
	globals: DARK,
	parameters: describe("C01 Only companions on the dark scheme."),
})

export const OnlyInstructionsAndSkills = meta.story({
	name: "C02 Only instructions and skills",
	args: ONLY_FILES,
	parameters: describe(
		"~/.claude holds a CLAUDE.md and skills but no companion. Check that CLAUDE.md is set in Geist Mono and the skills carry the sparkles icon.",
	),
})

export const OnlyInstructionsAndSkillsDark = meta.story({
	name: "C02 Only instructions and skills, dark",
	args: ONLY_FILES,
	globals: DARK,
	parameters: describe("C02 Only instructions and skills on the dark scheme."),
})

export const LongListScrolled = meta.story({
	name: "C03 Long list scrolled",
	args: LONG_LIST,
	parameters: describe(
		"Ten companions and more, taller than the window. Check that the list alone scrolls under a 40 px fade into the page background, and that Import 15 items and Skip for now stay in view.",
	),
	play: async ({ canvasElement }) => {
		const list = slotIn(canvasElement, "import-list")
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
		await expect(slotIn(canvasElement, "import-list-fade")).toBeInTheDocument()
		list.scrollTop = 120
		await expect(list.scrollTop).toBeGreaterThan(0)
		const primary = primaryIn(
			canvasElement,
			i18n.t("common:claudeImport.select.importItems", { count: 15 }),
		).getBoundingClientRect()
		await expect(primary.top).toBeGreaterThanOrEqual(0)
		await expect(primary.bottom).toBeLessThanOrEqual(window.innerHeight)
	},
})

export const LongListScrolledDark = meta.story({
	name: "C03 Long list scrolled, dark",
	args: LONG_LIST,
	globals: DARK,
	parameters: describe("C03 Long list scrolled on the dark scheme."),
})

export const NothingSelected = meta.story({
	name: "C04 Nothing selected",
	args: NOTHING_SELECTED,
	parameters: describe(
		"The reader unchecked every row. Check that Import is disabled at half opacity, still reachable by Tab, and that neither a click nor Enter calls it.",
	),
	play: async ({ canvasElement, args }) => {
		const primary = primaryIn(
			canvasElement,
			i18n.t("common:claudeImport.select.import"),
		)
		await expect(primary).toHaveAttribute("aria-disabled", "true")
		await userEvent.click(primary, { pointerEventsCheck: 0 })
		primary.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.primary?.onPress).not.toHaveBeenCalled()
	},
})

export const NothingSelectedDark = meta.story({
	name: "C04 Nothing selected, dark",
	args: NOTHING_SELECTED,
	globals: DARK,
	parameters: describe("C04 Nothing selected on the dark scheme."),
})

export const NameAlreadyTaken = meta.story({
	name: "C05 Name already taken",
	args: NAME_ALREADY_TAKEN,
	parameters: describe(
		"Two companions share a name with something already in Kiroshi. Check that each renamed row says what it comes in as, and that its detail wraps inside the card.",
	),
})

export const NameAlreadyTakenDark = meta.story({
	name: "C05 Name already taken, dark",
	args: NAME_ALREADY_TAKEN,
	globals: DARK,
	parameters: describe("C05 Name already taken on the dark scheme."),
})

export const Unreadable = meta.story({
	name: "C06 Couldn't read ~/.claude",
	args: UNREADABLE,
	parameters: describe(
		"Kiroshi was refused ~/.claude. Check the danger tile and its alert icon, no list, then Try again above Skip for now.",
	),
})

export const UnreadableDark = meta.story({
	name: "C06 Couldn't read ~/.claude, dark",
	args: UNREADABLE,
	globals: DARK,
	parameters: describe("C06 Couldn't read ~/.claude on the dark scheme."),
})

export const PartlyFailed = meta.story({
	name: "C07 Partly failed",
	args: PARTLY_FAILED,
	parameters: describe(
		"Every row came in but the changelog skill. Check that its alert icon and its cause are in the danger colour, and that Try changelog again sits under Continue.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const cause = canvas.getByText(
			i18n.t("common:claudeImport.row.unparsable", { file: "SKILL.md" }),
		)
		const glyph = canvas.getByRole("img", { name: "Failed" }).firstElementChild
		if (!glyph) throw new Error("The failed status draws no icon")
		await expect(getComputedStyle(cause).color).toBe(
			getComputedStyle(glyph).color,
		)
		await expect(getComputedStyle(cause).color).not.toBe(
			getComputedStyle(canvas.getByText("Atlas")).color,
		)
	},
})

export const PartlyFailedDark = meta.story({
	name: "C07 Partly failed, dark",
	args: PARTLY_FAILED,
	globals: DARK,
	parameters: describe("C07 Partly failed on the dark scheme."),
})

export const AgainFromSettings = meta.story({
	name: "C08 Again from Settings",
	args: AGAIN_FROM_SETTINGS,
	parameters: describe(
		"Opened from Settings after a first import. Check that every row already in Kiroshi reads so, stays unchecked and cannot be toggled, and that only the two new skills are checked.",
	),
	play: async ({ canvasElement, args }) => {
		const atlas = within(canvasElement).getByRole("checkbox", {
			name: "Atlas",
		})
		await expect(atlas).not.toBeChecked()
		await userEvent.click(atlas, { pointerEventsCheck: 0 })
		await expect(atlas).not.toBeChecked()
		await expect(args.onToggle).not.toHaveBeenCalled()
	},
})

export const AgainFromSettingsDark = meta.story({
	name: "C08 Again from Settings, dark",
	args: AGAIN_FROM_SETTINGS,
	globals: DARK,
	parameters: describe("C08 Again from Settings on the dark scheme."),
})
