import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectOnboardingDragStrip,
	expectOnboardingSecondaryAction,
	isInBrowserRunner,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	type ImportItem,
	ImportScreen,
	type ImportScreenProps,
} from "@workspace/ui/components/import-screen"
import { i18n } from "@workspace/ui/lib/i18n"

const DARK = { theme: "dark" } as const

type Artboard = ImportScreenProps

const toggleOf = (args: ImportScreenProps) => {
	if (args.step !== "select") throw new Error("Only the select step toggles")
	return args.onToggle
}

const ATLAS: ImportItem = {
	id: "atlas",
	kind: "companion",
	title: "Atlas",
	detail: "Reviews pull requests and flags risky changes.",
	checked: true,
}

const WREN: ImportItem = {
	id: "wren",
	kind: "companion",
	title: "Wren",
	detail: "Writes release notes from merged work.",
	hue: 150,
	checked: true,
}

const CLAUDE_MD: ImportItem = {
	id: "claude-md",
	kind: "instructions",
	title: "CLAUDE.md",
	detail:
		"Your standing instructions, 42 lines. Kept as yours, for every companion.",
	checked: true,
}

const skillsOf = (names: string[]): ImportItem[] =>
	names.map((name) => ({
		id: name,
		kind: "skill",
		title: name,
		detail: name,
		checked: true,
	}))

const SKILLS = skillsOf([
	"commit-style",
	"test-first",
	"review-checklist",
	"changelog",
])

const NEW_SKILLS = skillsOf(["pr-template", "release-checklist"])

const MORE_COMPANIONS: ImportItem[] = [
	["bramble", "Bramble", "Triages new issues every morning.", 30],
	["cedar", "Cedar", "Keeps the API reference in sync.", 280],
	["dune", "Dune", "Watches the deploys and pings on failures.", 200],
	["fern", "Fern", "Drafts the weekly team update.", 340],
	["harbor", "Harbor", "Answers support tickets from the queue.", 60],
	["ivy", "Ivy", "Reviews copy before anything ships.", 100],
	["kestrel", "Kestrel", "Tracks flaky tests and opens fixes.", 240],
	["lumen", "Lumen", "Plans sprints from the roadmap.", 180],
].map(([id, title, detail, hue]) => ({
	id: String(id),
	kind: "companion" as const,
	title: String(title),
	detail: String(detail),
	hue: Number(hue),
	checked: true,
}))

const withStatus = (
	items: ImportItem[],
	status: (item: ImportItem, index: number) => ImportItem["status"],
) => items.map((item, index) => ({ ...item, status: status(item, index) }))

const FILES = [CLAUDE_MD, ...SKILLS]

const FAILED_CHANGELOG: ImportItem = {
	...SKILLS[3],
	detail: i18n.t("common:claudeImport.row.unparsable", { file: "SKILL.md" }),
	status: "failed",
}

const SKIP = { label: i18n.t("common:claudeImport.select.skip"), onPress: fn() }

const LIST: Artboard = {
	step: "select",
	title: i18n.t("common:claudeImport.select.title"),
	subtitle: i18n.t("common:claudeImport.select.body"),
	items: [ATLAS, WREN, ...FILES],
	onToggle: fn(),
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 7 }),
		onPress: fn(),
	},
	secondary: SKIP,
}

const IMPORTING: Artboard = {
	step: "importing",
	title: i18n.t("common:claudeImport.importing.title"),
	items: [
		...withStatus([ATLAS, WREN], () => "done"),
		...withStatus(FILES, (_, index) => (index === 0 ? "done" : "pending")),
	],
	primary: {
		label: i18n.t("common:claudeImport.importing.action"),
		onPress: fn(),
	},
}

const IMPORTING_PICKED_ONLY: Artboard = {
	...IMPORTING,
	items: [
		{ ...ATLAS, status: "done" },
		{ ...WREN, checked: false, status: "done" },
		{ ...CLAUDE_MD, isInKiroshi: true, status: "done" },
		...SKILLS,
	],
}

const DONE: Artboard = {
	step: "done",
	title: i18n.t("common:claudeImport.done.title"),
	items: [
		...withStatus([ATLAS, WREN], () => "done"),
		...withStatus(FILES, () => "done"),
	],
	primary: {
		label: i18n.t("common:claudeImport.done.continue"),
		onPress: fn(),
	},
}

const ONLY_AGENTS: Artboard = {
	...LIST,
	items: [ATLAS, WREN],
	primary: {
		label: i18n.t("common:claudeImport.select.importCompanions", { count: 2 }),
		onPress: fn(),
	},
}

const ONLY_FILES: Artboard = {
	...LIST,
	items: FILES,
	primary: {
		label: i18n.t("common:claudeImport.select.importItems", { count: 5 }),
		onPress: fn(),
	},
}

const LONG_LIST: Artboard = {
	...LIST,
	subtitle: i18n.t("common:claudeImport.select.bodyMany", { count: 10 }),
	items: [ATLAS, WREN, ...MORE_COMPANIONS, ...FILES],
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
	items: unchecked([ATLAS, WREN, ...FILES]),
	primary: {
		label: i18n.t("common:claudeImport.select.import"),
		onPress: fn(),
	},
}

const NAME_ALREADY_TAKEN: Artboard = {
	...LIST,
	subtitle: i18n.t("common:claudeImport.select.namesTaken.two"),
	items: [
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
	items: [
		...withStatus([ATLAS, WREN], () => "done"),
		{ ...CLAUDE_MD, status: "done" },
		...withStatus(SKILLS.slice(0, 3), () => "done"),
		FAILED_CHANGELOG,
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
	onToggle: fn(),
	items: [
		...alreadyIn([ATLAS, WREN]),
		...alreadyIn([CLAUDE_MD, ...SKILLS]),
		...NEW_SKILLS,
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

const DONE_ONE_COMPANION: Artboard = {
	...DONE,
	items: [{ ...ATLAS, status: "done" }, ...withStatus(FILES, () => "done")],
}

const DONE_WITHOUT_INSTRUCTIONS: Artboard = {
	...DONE,
	items: [
		...withStatus([ATLAS, WREN], () => "done"),
		...withStatus(SKILLS, () => "done"),
	],
}

const partlyFailedOn = (failed: ImportItem): Artboard => ({
	...PARTLY_FAILED,
	items: [
		...withStatus([ATLAS, WREN, ...FILES], (item) =>
			item.id === failed.id ? "failed" : "done",
		),
	],
	secondary: {
		label: i18n.t("common:claudeImport.partlyFailed.retry", {
			name: failed.title,
		}),
		onPress: fn(),
	},
})

const describe = (story: string) => ({ docs: { description: { story } } })

const expectTypeLabels = async (canvasElement: HTMLElement) => {
	const canvas = within(slotIn(canvasElement, "import-list"))
	await expect(canvas.getAllByText("Agent")).toHaveLength(2)
	await expect(canvas.getByText("Instructions")).toBeVisible()
	await expect(canvas.getByText("Skills")).toBeVisible()
}

const primaryIn = (canvasElement: HTMLElement, name: string) =>
	within(slotIn(canvasElement, "import-screen")).getByRole("button", { name })

const meta = preview.meta({
	afterEach: ({ canvasElement }) => expectOnboardingDragStrip(canvasElement),
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
					"Import from Claude Code: what Kiroshi found in ~/.claude on the reader's computer, every row in one card with no heading, the agents first, then CLAUDE.md, then the skills on one row, each row naming its type at the right edge, every row checked by default. Four steps: `select` with a checkbox per row, `importing` with a status icon per row, `done` with or without the rows and their final status, and `unreadable` when the folder could not be opened. Copy comes in as props, from the `common:claudeImport` catalogue. The primary action is disabled while importing and while nothing is checked. A list taller than the window scrolls alone, the actions stay in view. Measured against the Paper file `Kiroshi, Onboarding v2`, artboards 3.1 to 3.3 and C01 to C08, and page Flow · Final, artboard 3, light and dark.",
			},
		},
	},
})

const skipIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole("button", {
		name: i18n.t("common:claudeImport.select.skip"),
	})

export const List = meta.story({
	name: "3.1 List",
	args: LIST,
	parameters: describe(
		"The nominal onboarding case: two agents, CLAUDE.md and four skills, all checked. Check that one 560 px card holds every row with no heading and no tile above the title, that each row names its type at the right edge, the checkboxes wear the Space accent, that unchecking a row hands its id to `onToggle`, and that Skip for now is the ghost pill of Use another account on Connect, filled on hover with no colour transition.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole("heading", { level: 2 })).toBeNull()
		await expectTypeLabels(canvasElement)
		await userEvent.click(canvas.getByRole("checkbox", { name: "Wren" }))
		await expect(toggleOf(args)).toHaveBeenCalledWith("wren", false)
		await expectOnboardingSecondaryAction(skipIn(canvasElement))
		if (!isInBrowserRunner()) return
		const controls = [
			canvas.getByRole("checkbox", { name: "Atlas" }),
			primaryIn(
				canvasElement,
				i18n.t("common:claudeImport.select.importItems", { count: 7 }),
			),
			skipIn(canvasElement),
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
	parameters: describe(
		"3.1 List on the dark scheme. Check that Skip for now is the ghost pill of Use another account on Connect, filled on hover.",
	),
	play: ({ canvasElement }) =>
		expectOnboardingSecondaryAction(skipIn(canvasElement)),
})

const LIST_EXISTING_PROFILE: Artboard = {
	...LIST,
	secondary: {
		label: i18n.t("common:claudeImport.select.notNow"),
		onPress: fn(),
	},
}

export const ListExistingProfile = meta.story({
	name: "3.1 List, existing profile",
	args: LIST_EXISTING_PROFILE,
	parameters: describe(
		"An existing profile sees 3.1 List once at start: the same list, with Not now in place of Skip for now.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(
			canvas.queryByRole("button", {
				name: i18n.t("common:claudeImport.select.skip"),
			}),
		).toBeNull()
		await userEvent.click(
			canvas.getByRole("button", {
				name: i18n.t("common:claudeImport.select.notNow"),
			}),
		)
		await expect(args.secondary?.onPress).toHaveBeenCalledOnce()
	},
})

export const ListExistingProfileDark = meta.story({
	name: "3.1 List, existing profile, dark",
	args: LIST_EXISTING_PROFILE,
	globals: DARK,
	parameters: describe("3.1 List, existing profile on the dark scheme."),
})

export const Importing = meta.story({
	name: "3.2 Importing",
	args: IMPORTING,
	parameters: describe(
		"The import is running, three of seven done, the four skills still in progress on their one row. Check that no checkbox is left, that each row carries a done or in progress icon with its label and keeps its type at the right edge, that the body counts each skill, and that the primary action is disabled with no Skip for now.",
	),
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole("checkbox")).toBeNull()
		await expectTypeLabels(canvasElement)
		await expect(canvas.getAllByRole("img", { name: "Done" })).toHaveLength(3)
		await expect(canvas.getByRole("img", { name: "In progress" })).toBeVisible()
		await expect(
			canvas.getByText("3 of 7 done. This takes a few seconds."),
		).toBeVisible()
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

export const ImportingPickedOnly = meta.story({
	tags: ["test-only"],
	args: IMPORTING_PICKED_ONLY,
	parameters: describe(
		"Proves the importing list keeps only what the reader picked: Wren was unchecked and CLAUDE.md is already in Kiroshi, both carrying a status the host never should have sent. Check that neither row nor its status icon renders, and that the body counts Atlas and the four skills left.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByText(WREN.title)).toBeNull()
		await expect(canvas.queryByText(CLAUDE_MD.title)).toBeNull()
		await expect(canvas.getAllByRole("img", { name: "Done" })).toHaveLength(1)
		await expect(canvas.getByRole("img", { name: "In progress" })).toBeVisible()
		await expect(
			canvas.getByText(
				i18n.t("common:claudeImport.importing.body", { done: 1, count: 5 }),
			),
		).toBeVisible()
	},
})

export const Done = meta.story({
	name: "3.3 Done",
	args: DONE,
	parameters: describe(
		"Everything the reader picked came in, every picked row kept with its done mark and its type. Check that the summary names the agents and counts the skills from the rows shown. Pick `PartlyFailed` when a row did not come in.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(
			canvas.getByText(
				"Atlas and Wren are ready, with your CLAUDE.md and 4 skills.",
			),
		).toBeVisible()
		await expect(canvas.getAllByRole("img", { name: "Done" })).toHaveLength(4)
		await expectTypeLabels(canvasElement)
		await expect(canvas.getByText("4 skills")).toBeVisible()
		await expect(
			canvas.getByText("commit-style, test-first, review-checklist, changelog"),
		).toBeVisible()
	},
})

export const DoneDark = meta.story({
	name: "3.3 Done, dark",
	args: DONE,
	globals: DARK,
	parameters: describe("3.3 Done on the dark scheme."),
})

export const DoneOneCompanion = meta.story({
	tags: ["test-only"],
	args: DONE_ONE_COMPANION,
	parameters: describe(
		"Proves the done summary turns singular when one agent came in.",
	),
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByText(
				"Atlas is ready, with your CLAUDE.md and 4 skills.",
			),
		).toBeVisible()
	},
})

export const DoneWithoutInstructions = meta.story({
	tags: ["test-only"],
	args: DONE_WITHOUT_INSTRUCTIONS,
	parameters: describe(
		"Proves the done summary leaves CLAUDE.md out when none came in.",
	),
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByText(
				"Atlas and Wren are ready, with 4 skills.",
			),
		).toBeVisible()
	},
})

export const OnlyAgents = meta.story({
	name: "C01 Only agents",
	args: ONLY_AGENTS,
	parameters: describe(
		"~/.claude holds agents and nothing else. Check that the card holds the two agents alone, with no heading, and centres with the whole column in the window.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.queryByRole("heading", { level: 2 })).toBeNull()
		await expect(canvas.getAllByText("Agent")).toHaveLength(2)
		await expect(primaryIn(canvasElement, "Import 2 agents")).toBeVisible()
	},
})

export const OnlyAgentsDark = meta.story({
	name: "C01 Only agents, dark",
	args: ONLY_AGENTS,
	globals: DARK,
	parameters: describe("C01 Only agents on the dark scheme."),
})

export const OnlyInstructionsAndSkills = meta.story({
	name: "C02 Only instructions and skills",
	args: ONLY_FILES,
	parameters: describe(
		"~/.claude holds a CLAUDE.md and skills but no agent. Check that CLAUDE.md is set in Geist Mono and the skills carry the sparkles icon.",
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
		"Ten agents and more, taller than the window. Check that the list alone scrolls under a 40 px fade into the page background, and that Import 15 items and Skip for now stay in view.",
	),
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByText(
				"Found 10 agents and more in ~/.claude. Everything is selected; uncheck what you’d rather leave behind.",
			),
		).toBeVisible()
		const list = slotIn(canvasElement, "import-list")
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
		await expect(
			within(canvasElement).getByRole("region", {
				name: i18n.t("common:claudeImport.listLabel"),
			}),
		).toBe(list)
		await expect(list).toHaveAttribute("tabindex", "0")
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
		"Two agents share a name with something already in Kiroshi. Check that each renamed row says what it comes in as, and that its detail wraps inside the card.",
	),
	play: async ({ canvasElement }) => {
		await expect(primaryIn(canvasElement, "Import 3 agents")).toBeVisible()
	},
})

export const NameAlreadyTakenDark = meta.story({
	name: "C05 Name already taken, dark",
	args: NAME_ALREADY_TAKEN,
	globals: DARK,
	parameters: describe("C05 Name already taken on the dark scheme."),
})

type StoryCanvas = { canvasElement: HTMLElement }

const hoverRetry = async ({ canvasElement }: StoryCanvas) => {
	if (!isInBrowserRunner()) return
	const { userEvent: pointer } = await import("vitest/browser")
	await pointer.hover(
		primaryIn(canvasElement, i18n.t("common:claudeImport.unreadable.retry")),
	)
}

export const Unreadable = meta.story({
	name: "C06 Couldn't read ~/.claude",
	args: UNREADABLE,
	parameters: describe(
		"Kiroshi was refused ~/.claude. Check that the title opens the column with no tile above it, no list, then Try again above Skip for now.",
	),
	play: hoverRetry,
})

export const UnreadableDark = meta.story({
	name: "C06 Couldn't read ~/.claude, dark",
	args: UNREADABLE,
	globals: DARK,
	parameters: describe("C06 Couldn't read ~/.claude on the dark scheme."),
	play: hoverRetry,
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
		await expect(canvas.getByText("3 skills")).toBeVisible()
		await expect(
			canvas.getByText("commit-style, test-first, review-checklist"),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"The changelog skill didn’t come in. Try it again, or add it later from Settings.",
			),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Try changelog again" }),
		).toBeVisible()
	},
})

export const PartlyFailedDark = meta.story({
	name: "C07 Partly failed, dark",
	args: PARTLY_FAILED,
	globals: DARK,
	parameters: describe("C07 Partly failed on the dark scheme."),
})

export const PartlyFailedCompanion = meta.story({
	tags: ["test-only"],
	args: partlyFailedOn(WREN),
	parameters: describe(
		"Proves a failed agent is named in the body and the retry link without the word skill.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(
			canvas.getByText(
				"Wren didn’t come in. Try it again, or add it later from Settings.",
			),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Try Wren again" }),
		).toBeVisible()
	},
})

export const PartlyFailedInstructions = meta.story({
	tags: ["test-only"],
	args: partlyFailedOn(CLAUDE_MD),
	parameters: describe(
		"Proves a failed CLAUDE.md is named in the body and the retry link without the word skill.",
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(
			canvas.getByText(
				"CLAUDE.md didn’t come in. Try it again, or add it later from Settings.",
			),
		).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Try CLAUDE.md again" }),
		).toBeVisible()
	},
})

export const AgainFromSettings = meta.story({
	name: "C08 Again from Settings",
	args: AGAIN_FROM_SETTINGS,
	parameters: describe(
		"Opened from Settings after a first import. Check that every row already in Kiroshi reads so, stays unchecked and cannot be toggled, and that the two new skills share one checked row.",
	),
	play: async ({ canvasElement, args }) => {
		const atlas = within(canvasElement).getByRole("checkbox", {
			name: "Atlas",
		})
		await expect(atlas).not.toBeChecked()
		await userEvent.click(atlas, { pointerEventsCheck: 0 })
		await expect(atlas).not.toBeChecked()
		await expect(toggleOf(args)).not.toHaveBeenCalled()
		const newSkills = within(canvasElement).getByRole("checkbox", {
			name: "2 new skills",
		})
		await expect(newSkills).toBeChecked()
		await userEvent.click(newSkills)
		await expect(toggleOf(args)).toHaveBeenCalledWith("pr-template", false)
		await expect(toggleOf(args)).toHaveBeenCalledWith(
			"release-checklist",
			false,
		)
	},
})

export const AgainFromSettingsDark = meta.story({
	name: "C08 Again from Settings, dark",
	args: AGAIN_FROM_SETTINGS,
	globals: DARK,
	parameters: describe("C08 Again from Settings on the dark scheme."),
})
