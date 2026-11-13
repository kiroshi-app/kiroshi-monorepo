import { renderToStaticMarkup } from "react-dom/server"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	expectMutedUntilHoveredOrActive,
	FRAME_POLL,
	settled,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	barIn,
	boxOf,
	unpinnedTabsIn,
} from "@workspace/storybook/tab-drag-gesture"
import {
	AppTitleBar,
	type AppTitleBarProps,
} from "@workspace/ui/components/app-title-bar"
import {
	BUG_BASH,
	DESIGN_REVIEW,
	HIRING_PLAN,
	INVOICE_EXPORT,
	LOGIN_REDIRECT,
	LONG_DOCUMENT_NAME,
	LONG_DOCUMENT_NAME_TAB,
	MOODBOARD,
	MOODBOARD_TAB,
	QUARTERLY_REPORT,
	QUARTERLY_REPORT_TAB,
	RELEASE_NOTES,
	TITLE_BAR,
	WEEKLY_PLANNING,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationTabIcon } from "@workspace/ui/components/conversation-tab-icon"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { Icons } from "@workspace/ui/components/icons"
import {
	type TitleBarTabDescriptor,
	TitleBarTabs,
} from "@workspace/ui/components/title-bar-tabs"

const ICON_SLOT = 16

const GLYPH_ICON = 15

const LINE_HEIGHT = 16

const meta = preview.meta({
	title: "Navigation/TitleBarTabs",
	component: TitleBarTabs,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The tab row of the title bar. A tab carrying a descriptor, plain data naming a kind, a name and an icon, draws that icon and that name in the tab, in the overflow menu and in the drag chip, and every accessible name reads the name. A tab without one draws its own title and icon.",
			},
		},
	},
	args: {
		onSelectTab: fn(),
		onCloseTab: fn(),
		onReorderTabs: fn(),
		onNewTab: fn(),
	},
	render: (args) => (
		<div className="surface-shell relative h-10 w-320">
			<AppTitleBar {...TITLE_BAR} {...args} />
		</div>
	),
})

type DescriptorPlayContext = {
	canvasElement: HTMLElement
}

const glyphOf = (root: ParentNode) =>
	Array.from(root.querySelectorAll("path"), (path) => path.getAttribute("d"))

const glyphDrawnBy = (Glyph: (typeof Icons)[keyof typeof Icons]) => {
	const template = document.createElement("template")
	template.innerHTML = renderToStaticMarkup(<Glyph />)
	return glyphOf(template.content)
}

const glyphNamedBy = ({ icon }: TitleBarTabDescriptor) =>
	glyphDrawnBy(Icons[icon])

const iconSlotOf = (owner: HTMLElement) => {
	const slot = owner.querySelector<HTMLElement>('span[aria-hidden="true"]')
	if (!slot) throw new Error(`No icon slot in ${owner.textContent}`)
	return slot
}

const expectIconOf = async (
	owner: HTMLElement,
	descriptor: TitleBarTabDescriptor,
	slotSide: number,
) => {
	const slot = iconSlotOf(owner)
	await expect(boxOf(slot).width).toBe(slotSide)
	await expect(boxOf(slot).height).toBe(slotSide)
	const icon = slot.querySelector("svg")
	if (!icon) throw new Error(`No icon in ${owner.textContent}`)
	await expect(boxOf(icon).width).toBe(GLYPH_ICON)
	await expect(boxOf(icon).height).toBe(GLYPH_ICON)
	await expect(glyphOf(icon)).toEqual(glyphNamedBy(descriptor))
}

const tabNamed = (canvasElement: HTMLElement, name: string) =>
	within(barIn(canvasElement)).getByRole("tab", { name })

const expectTabDrawing = async (
	canvasElement: HTMLElement,
	descriptor: TitleBarTabDescriptor,
) => {
	const tab = tabNamed(canvasElement, descriptor.name)
	await expect(tab).toHaveTextContent(descriptor.name)
	await expect(tab).toBeVisible()
	await expectIconOf(tab, descriptor, ICON_SLOT)
	await expect(
		within(barIn(canvasElement)).getByRole("button", {
			name: `Close ${descriptor.name}`,
		}),
	).toBeInTheDocument()
	return tab
}

const DOCUMENT_TABS = {
	tabs: [QUARTERLY_REPORT_TAB, RELEASE_NOTES],
	activeTabId: QUARTERLY_REPORT_TAB.id,
} satisfies Partial<AppTitleBarProps>

export const LibraryDocumentTab = meta.story({
	args: DOCUMENT_TABS,
	parameters: {
		docs: {
			description: {
				story:
					"A Library document open in a tab beside a conversation. Check the document draws the File glyph in the 16px icon slot and its file name as the label, that Close and the move announcement read the file name, and that the conversation tab without a descriptor keeps its own title. Pick `LibraryImageTab` for an image.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		const tab = await expectTabDrawing(canvasElement, QUARTERLY_REPORT)
		await expect(
			tabNamed(canvasElement, RELEASE_NOTES.title),
		).toHaveTextContent(RELEASE_NOTES.title)

		tab.focus()
		fireEvent.keyDown(tab, { key: "ArrowRight", altKey: true })
		await waitFor(() =>
			expect(
				slotIn(document.body, "title-bar-tab-move-announcement"),
			).toHaveTextContent(`${QUARTERLY_REPORT.name} moved to position 2 of 2`),
		)
	},
})

const WHITESPACE_NAMED_DOCUMENT_TAB = {
	...QUARTERLY_REPORT_TAB,
	descriptor: { ...QUARTERLY_REPORT, name: "   " },
}

export const WhitespaceDocumentNameReadsUntitled = meta.story({
	args: {
		tabs: [WHITESPACE_NAMED_DOCUMENT_TAB, RELEASE_NOTES],
		activeTabId: WHITESPACE_NAMED_DOCUMENT_TAB.id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A Library document whose name holds only spaces, open in a tab beside a conversation. Check the tab, its accessible name, Close and the move announcement read Untitled, and that the conversation tab without a descriptor keeps its own title.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		const tab = tabNamed(canvasElement, "Untitled")
		await expect(tab).toHaveTextContent("Untitled")
		await expect(
			within(barIn(canvasElement)).getByRole("button", {
				name: "Close Untitled",
			}),
		).toBeInTheDocument()
		await expect(
			tabNamed(canvasElement, RELEASE_NOTES.title),
		).toHaveTextContent(RELEASE_NOTES.title)

		tab.focus()
		fireEvent.keyDown(tab, { key: "ArrowRight", altKey: true })
		await waitFor(() =>
			expect(
				slotIn(document.body, "title-bar-tab-move-announcement"),
			).toHaveTextContent("Untitled moved to position 2 of 2"),
		)
	},
})

const IMAGE_TABS = {
	tabs: [MOODBOARD_TAB, RELEASE_NOTES],
	activeTabId: MOODBOARD_TAB.id,
	incomingTab: { tab: QUARTERLY_REPORT_TAB, clientX: 0 },
} satisfies Partial<AppTitleBarProps>

export const LibraryImageTab = meta.story({
	args: IMAGE_TABS,
	parameters: {
		docs: {
			description: {
				story:
					"A Library image open in a tab while a Library document from another window is held over the strip. Check the image draws the Image glyph in the 16px icon slot and its file name as the label, and that the drag chip of the held document draws the File glyph and its file name. Pick `LibraryDocumentTab` for a document alone.",
			},
		},
	},
	play: async ({ canvasElement }: DescriptorPlayContext) => {
		await expectTabDrawing(canvasElement, MOODBOARD)

		const chip = await waitFor(() =>
			slotIn(barIn(canvasElement), "title-bar-tab-chip"),
		)
		await expect(slotIn(chip, "title-bar-tab-chip-title")).toHaveTextContent(
			QUARTERLY_REPORT.name,
		)
		await expectIconOf(chip, QUARTERLY_REPORT, ICON_SLOT)
	},
})

const CROWDED_TABS = [
	LONG_DOCUMENT_NAME_TAB,
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
	MOODBOARD_TAB,
]

const LONG_NAME_TABS = {
	tabs: CROWDED_TABS,
	activeTabId: LONG_DOCUMENT_NAME_TAB.id,
} satisfies Partial<AppTitleBarProps>

export const LongNameTruncated = meta.story({
	args: LONG_NAME_TABS,
	render: (args) => (
		<div className="surface-shell relative h-10 w-150">
			<AppTitleBar {...TITLE_BAR} {...args} />
		</div>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A Library document whose file name is wider than its tab, in a strip too narrow for every tab. Check the name holds one line and ends on an ellipsis while the tab's accessible name keeps it whole, and that the overflow menu draws the Library image left out of the strip with the Image glyph and its file name.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const tab = await expectTabDrawing(canvasElement, LONG_DOCUMENT_NAME)
		await expect(tab).toHaveAccessibleName(LONG_DOCUMENT_NAME.name)
		const label = Array.from(tab.querySelectorAll("span")).find(
			(span) => span.textContent === LONG_DOCUMENT_NAME.name,
		)
		if (!label) throw new Error("The tab draws no name")
		const style = getComputedStyle(label)
		await expect(style.whiteSpace).toBe("nowrap")
		await expect(style.textOverflow).toBe("ellipsis")
		await expect(boxOf(label).height).toBe(LINE_HEIGHT)
		await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)

		await expect(unpinnedTabsIn(canvasElement)).not.toHaveLength(
			CROWDED_TABS.length,
		)
		await userEvent.click(slotIn(barIn(canvasElement), "title-bar-overflow"))
		const menu = await settled(await screen.findByRole("menu"))
		const row = within(menu).getByRole("menuitem", {
			name: MOODBOARD.name,
		})
		await expect(row).toHaveTextContent(MOODBOARD.name)
		await expectIconOf(row, MOODBOARD, ICON_SLOT)
	},
})

export const SearchAfterForward = meta.story({
	args: {
		canGoBack: true,
		canGoForward: true,
		onToggleSidebar: fn(),
		onGoBack: fn(),
		onGoForward: fn(),
		onOpenSearch: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The history cluster with Search, as the workspace mounts it. Check the order reads Sidebar toggle, Back, Forward, Search, that Search draws the Search glyph at the size and on the button of Back and Forward, carries Search as its name and its tooltip, and that a click opens the search once.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const history = within(slotIn(canvasElement, "title-bar-history"))
		const buttons = history.getAllByRole("button")
		await expect(buttons.map((button) => button.ariaLabel)).toEqual([
			"Toggle sidebar",
			"Back",
			"Forward",
			"Search",
		])
		const [, , forward, search] = buttons as [
			HTMLElement,
			HTMLElement,
			HTMLElement,
			HTMLElement,
		]
		await expect(search).toHaveAccessibleName("Search")
		await expect(search.className).toBe(forward.className)
		await expect(boxOf(search).width).toBe(boxOf(forward).width)
		const glyph = search.querySelector("svg")
		if (!glyph) throw new Error("Search draws no glyph")
		await expect(boxOf(glyph).width).toBe(GLYPH_ICON)
		await expect(glyphOf(glyph)).toEqual(glyphDrawnBy(Icons.Search))

		await userEvent.click(search)
		await expect(args.onOpenSearch).toHaveBeenCalledOnce()
		await userEvent.hover(search)
		await waitFor(
			() =>
				expect(document.querySelector('[role="tooltip"]')).toHaveTextContent(
					"Search",
				),
			FRAME_POLL,
		)
	},
})

export const NoSearchWithoutHandler = meta.story({
	args: { onToggleSidebar: fn() },
	play: async ({ canvasElement }) => {
		const history = within(slotIn(canvasElement, "title-bar-history"))
		await expect(history.getAllByRole("button")).toHaveLength(3)
		await expect(history.queryByRole("button", { name: "Search" })).toBeNull()
	},
})

const COLOURED_ACTIVE = {
	...DESIGN_REVIEW,
	icon: <ConversationTabIcon hue={BLOT_HUES.pink} icon="Rocket" />,
}

const COLOURED_INACTIVE = {
	...BUG_BASH,
	icon: <ConversationTabIcon hue={BLOT_HUES.pink} icon="Bug" />,
}

const MONOCHROME = {
	...HIRING_PLAN,
	icon: <ConversationTabIcon hue={null} icon="Users" />,
}

const COLOURED_TABS = {
	tabs: [COLOURED_ACTIVE, MONOCHROME, COLOURED_INACTIVE],
	activeTabId: COLOURED_ACTIVE.id,
} satisfies Partial<AppTitleBarProps>

const rgbOf = (hex: string) =>
	`rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(", ")})`

const expectColouredConversationTabs = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	const [active, monochrome, inactive] = [
		COLOURED_ACTIVE,
		MONOCHROME,
		COLOURED_INACTIVE,
	].map(({ title }) => tabNamed(canvasElement, title))
	await expect(
		[active, monochrome, inactive].map((tab) =>
			tab.getAttribute("aria-selected"),
		),
	).toEqual(["true", "false", "false"])

	for (const tab of [active, inactive]) {
		const slot = iconSlotOf(tab)
		const icon = slotIn(slot, "conversation-subject-icon")
		const glyph = icon.querySelector("svg") as SVGElement
		const ink = getComputedStyle(icon)
			.getPropertyValue(`--hue-${theme}-avatar-ink`)
			.trim()
		await expect(icon.dataset.hue).toBe(String(BLOT_HUES.pink))
		await expect(getComputedStyle(icon).color).toBe(rgbOf(ink))
		await expect(getComputedStyle(glyph).color).toBe(rgbOf(ink))
		await expect(icon.children).toHaveLength(1)
		await expect(getComputedStyle(icon).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect([boxOf(slot).width, boxOf(slot).height]).toEqual([
			ICON_SLOT,
			ICON_SLOT,
		])
		await expect([boxOf(glyph).width, boxOf(glyph).height]).toEqual([
			GLYPH_ICON,
			GLYPH_ICON,
		])
	}

	const plain = iconSlotOf(monochrome).firstElementChild as SVGElement
	await expect(plain.tagName.toLowerCase()).toBe("svg")
	await expect(getComputedStyle(plain).color).toBe(
		getComputedStyle(monochrome).color,
	)
	await expect(getComputedStyle(plain).color).not.toBe(
		getComputedStyle(slotIn(active, "conversation-subject-icon")).color,
	)
	await expect([boxOf(plain).width, boxOf(plain).height]).toEqual([
		GLYPH_ICON,
		GLYPH_ICON,
	])
}

const COLOURED_TABS_DESCRIPTION =
	"Two conversations with a colour, one in the active tab and one in an inactive tab, either side of a conversation with none. Check both coloured tabs draw their filled glyph in the avatar ink of their hue, the colour their compact sidebar row shows, with no tile behind it, 15px in the 16px icon slot, and that the tab without a colour keeps the bare glyph in the tab's own text colour."

export const ColouredConversationTabs = meta.story({
	args: COLOURED_TABS,
	parameters: {
		docs: { description: { story: COLOURED_TABS_DESCRIPTION } },
	},
	play: ({ canvasElement }) =>
		expectColouredConversationTabs(canvasElement, "light"),
})

export const ColouredConversationTabsDark = meta.story({
	globals: { theme: "dark" },
	args: COLOURED_TABS,
	parameters: {
		docs: {
			description: { story: `${COLOURED_TABS_DESCRIPTION} Dark theme.` },
		},
	},
	play: ({ canvasElement }) =>
		expectColouredConversationTabs(canvasElement, "dark"),
})

const TAB_STATES = ["At rest", "Hovered", "Selected"]

const PINNED_TAB_STATES = [
	"Pinned at rest",
	"Pinned hovered",
	"Pinned selected",
]

const stateTabsOf = (
	titles: string[],
	isPinned: boolean,
): Pick<AppTitleBarProps, "tabs" | "activeTabId"> => ({
	tabs: titles.map((title) => ({
		...RELEASE_NOTES,
		id: title,
		title,
		isPinned,
	})),
	activeTabId: titles.at(-1),
})

const TAB_STATE_BARS = [
	stateTabsOf(TAB_STATES, false),
	stateTabsOf(PINNED_TAB_STATES, true),
]

const tabStatesStory = (globals?: { theme: "dark" }) => ({
	globals,
	render: (args: AppTitleBarProps) => (
		<div className="flex flex-col gap-2">
			{TAB_STATE_BARS.map((bar) => (
				<div
					className="surface-shell relative h-10 w-320"
					key={bar.activeTabId}
				>
					<AppTitleBar {...TITLE_BAR} {...args} {...bar} />
				</div>
			))}
		</div>
	),
	parameters: {
		pseudo: { hover: '[role="tablist"] > [role="tab"]:nth-of-type(2)' },
		docs: {
			description: {
				story:
					"Two title bars, the first with three tabs and the second with three pinned tabs, each showing one at rest, one under the pointer and the selected one. Check the label and the icon sit in `--muted-foreground` at rest and in `--foreground` under the pointer and on the selected tab, pinned or not, and that the colour switches with no fade.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const tab = (name: string) =>
			within(canvasElement).getByRole("tab", { name })

		for (const titles of [TAB_STATES, PINNED_TAB_STATES]) {
			const [atRest, hovered, active] = titles.map(tab)
			await expectMutedUntilHoveredOrActive({
				states: { atRest, hovered, active },
				inkedPartsOf: (owner) => [...owner.querySelectorAll("span, svg")],
				fullInk: "text-foreground",
			})
		}
	},
})

export const TabsAtRestHoveredAndSelected = meta.story(tabStatesStory())

export const TabsAtRestHoveredAndSelectedDark = meta.story(
	tabStatesStory({ theme: "dark" }),
)
