import { useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	isInBrowserRunner,
	probedStyleOf,
	realPointer,
	settled,
	slotIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	AppRail,
	type AppRailPanel,
	type AppRailProps,
	NAVIGATION_ROW_GAP,
} from "@workspace/ui/components/app-rail"
import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import {
	ATELIER,
	GARAGE,
	LOGIN_REDIRECT,
	RELEASE_NOTES,
	STUDIO,
	WEEKLY_PLANNING,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import type { Space } from "@workspace/ui/components/space"
import {
	UpdateBadge,
	type UpdateBadgeStatus,
} from "@workspace/ui/components/update-badge"
import {
	SHELL_TITLE_BAR_HEIGHT,
	WorkspaceShell,
} from "@workspace/ui/components/workspace-shell"

const READER = { name: "Ada Lovelace" }

const OPENING_PANEL: AppRailPanel = "conversations"

const ENTRY_NAMES: Record<AppRailPanel, string> = {
	conversations: "Conversations",
	missions: "Missions",
	library: "Library",
}

const SPACE_SETTINGS = "Space settings"

const SEARCH = "Search"

const SEARCH_CHORD = "⌘K"

const CURRENT_SPACE: Space = {
	id: "vocca",
	name: "Vocca",
	colour: BLOT_HUES.blue,
	avatarSeed: "vocca",
}

const SPACE_LOGO = 26

const SPACE_AVATAR = '[data-slot="space-avatar"]'

const RAIL_WIDTH = 60

const RAIL_BUTTON = 44

const RAIL_TOP_INSET = 7

const RAIL_AVATAR = 26

const REMOVED_PANEL = "companions"

const PANELS = Object.keys(ENTRY_NAMES) as AppRailPanel[]

const TOP_GROUP = [
	SPACE_SETTINGS,
	SEARCH,
	...PANELS.map((panel) => ENTRY_NAMES[panel]),
]

const renderRail = (args: AppRailProps) => (
	<div className="flex h-[32rem] bg-background">
		<AppRail {...args} />
	</div>
)

const entryNamed = (canvasElement: HTMLElement, name: string) => {
	const entry = Array.from(
		canvasElement.querySelectorAll<HTMLElement>('[data-slot="app-rail-item"]'),
	).find((item) => item.getAttribute("aria-label") === name)
	if (!entry) throw new Error(`No rail entry named ${name}`)
	return entry
}

const topGroupEntriesIn = (canvasElement: HTMLElement) =>
	Array.from(
		slotIn(canvasElement, "app-rail").querySelectorAll<HTMLElement>(
			'ul:first-of-type [data-slot="app-rail-item"]',
		),
	).map((entry) => entry.getAttribute("aria-label"))

const renderInSidebar = (openPanel: string) => () => (
	<WorkspaceShell sidebar={<AppSidebar bots={[]} openPanel={openPanel} />}>
		{null}
	</WorkspaceShell>
)

const bottomGroupItemsIn = (canvasElement: HTMLElement) =>
	Array.from(
		slotIn(canvasElement, "app-rail").querySelectorAll<HTMLElement>(
			"ul:last-of-type > li",
		),
	)

const expectBareBottomGroup = async (canvasElement: HTMLElement) => {
	const items = bottomGroupItemsIn(canvasElement).filter((item) =>
		item.checkVisibility(),
	)
	await expect(items).toHaveLength(1)
	await expect(within(items[0]).getByRole("button")).toBe(
		entryNamed(canvasElement, READER.name),
	)
}

const updateBadgeIn = (status: UpdateBadgeStatus) => ({
	args: {
		updateBadge: <UpdateBadge progress={42} status={status} version="1.4.0" />,
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const [slot, readerItem] = bottomGroupItemsIn(canvasElement)
		const reader = entryNamed(canvasElement, READER.name)
		await expect(slot).toHaveAttribute("data-slot", "app-rail-update")
		await expect(slot.nextElementSibling).toBe(readerItem)
		await expect(readerItem.contains(reader)).toBe(true)

		const slotBox = slot.getBoundingClientRect()
		const badge = slot.firstElementChild as HTMLElement
		await expect(slotBox.width).toBe(RAIL_BUTTON)
		await expect(slotBox.height).toBe(RAIL_BUTTON)
		await expect(slotBox.left).toBe(reader.getBoundingClientRect().left)
		await expect(centreOf(badge.getBoundingClientRect())).toEqual(
			centreOf(slotBox),
		)
		await expectListRowGapBetweenEntries(canvasElement)
	},
})

const boxesInGroup = (group: Element) =>
	Array.from(group.children)
		.filter((item) => item.checkVisibility())
		.map((item) => item.getBoundingClientRect())

const expectListRowGapBetweenEntries = async (canvasElement: HTMLElement) => {
	const listRowGap = Number.parseFloat(
		probedStyleOf(NAVIGATION_ROW_GAP, "rowGap"),
	)
	const groups = slotIn(canvasElement, "app-rail").querySelectorAll("ul")
	for (const group of groups) {
		const boxes = boxesInGroup(group)
		await expect(boxes.length).toBeGreaterThan(0)
		for (const [index, box] of boxes.slice(1).entries()) {
			await expect(box.top - boxes[index].bottom).toBe(listRowGap)
		}
	}
}

const centreOf = (box: DOMRect) => ({
	x: box.left + box.width / 2,
	y: box.top + box.height / 2,
})

const iconOf = (entry: HTMLElement) => {
	const icon = entry.querySelector("svg")
	if (!icon) throw new Error(`No icon in ${entry.getAttribute("aria-label")}`)
	return icon
}

const spaceLogoIn = (canvasElement: HTMLElement) =>
	slotIn(entryNamed(canvasElement, SPACE_SETTINGS), "space-avatar")

const expectSpaceLogoFirstWithoutGear = async (
	canvasElement: HTMLElement,
	entryName: string,
) => {
	const [first] = railEntriesIn(canvasElement)
	await expect(first).toHaveAccessibleName(entryName)
	await expect(first.querySelector(`svg:not(${SPACE_AVATAR} svg)`)).toBeNull()
	const logo = slotIn(first, "space-avatar")
	const box = logo.getBoundingClientRect()
	await expect(box.width).toBe(SPACE_LOGO)
	await expect(box.height).toBe(SPACE_LOGO)
	await expect(logo.dataset.recipe).toBe("glaze")
	await expect(first.querySelector('[data-slot="space-avatar-dot"]')).toBeNull()
	await expect(
		railIn(canvasElement).querySelectorAll(
			`ul:first-of-type svg:not(${SPACE_AVATAR} svg)`,
		),
	).toHaveLength(PANELS.length + 1)
}

const iconColourOf = (entry: HTMLElement) =>
	getComputedStyle(iconOf(entry)).color

type IconStyle = "fill" | "stroke"

const paintedPathsOf = (entry: HTMLElement) =>
	Array.from(iconOf(entry).querySelectorAll("path")).filter(
		(path) => getComputedStyle(path).fill !== "none",
	)

const iconStyleOf = (entry: HTMLElement): IconStyle =>
	paintedPathsOf(entry).length > 0 ? "fill" : "stroke"

const glyphOf = (root: ParentNode) =>
	Array.from(root.querySelectorAll("path"), (path) => path.getAttribute("d"))

const glyphDrawnBy = (Glyph: Icon) => {
	const template = document.createElement("template")
	template.innerHTML = renderToStaticMarkup(<Glyph />)
	return glyphOf(template.content)
}

const expectDrawnWith = async (entry: HTMLElement, Glyph: Icon) =>
	expect(glyphOf(iconOf(entry))).toEqual(glyphDrawnBy(Glyph))

const fillOf = (entry: HTMLElement) => getComputedStyle(entry).backgroundColor

const NO_FILL = "rgba(0, 0, 0, 0)"

const railIn = (canvasElement: HTMLElement) => slotIn(canvasElement, "app-rail")

const railEntriesIn = (canvasElement: HTMLElement) =>
	Array.from(
		railIn(canvasElement).querySelectorAll<HTMLElement>(
			'[data-slot="app-rail-item"]',
		),
	)

const expectOnlySelected = async (
	canvasElement: HTMLElement,
	selected: AppRailPanel,
) => {
	const rail = railIn(canvasElement)
	const selectedFill = tokenStyleIn(
		rail,
		"bg-rail-item-selected",
		"backgroundColor",
	)
	const selectedInk = tokenStyleIn(rail, "text-foreground", "color")
	const idleInk = tokenStyleIn(rail, "text-muted-foreground", "color")
	await expect(topGroupEntriesIn(canvasElement)).toEqual(TOP_GROUP)
	for (const panel of PANELS) {
		const entry = entryNamed(canvasElement, ENTRY_NAMES[panel])
		if (panel === selected) {
			await expect(entry).toHaveAttribute("aria-current", "true")
			await expect(fillOf(entry)).toBe(selectedFill)
			await expect(iconColourOf(entry)).toBe(selectedInk)
			await expect(iconStyleOf(entry)).toBe("fill")
		} else {
			await expect(entry).not.toHaveAttribute("aria-current")
			await expect(fillOf(entry)).toBe(NO_FILL)
			await expect(iconColourOf(entry)).toBe(idleInk)
			await expect(iconStyleOf(entry)).toBe("stroke")
		}
	}
}

const expectFootLikeIdlePanel = async (
	canvasElement: HTMLElement,
	selected: AppRailPanel,
) => {
	const idlePanel = PANELS.find((panel) => panel !== selected)
	if (!idlePanel) throw new Error("No idle panel entry")
	const idle = entryNamed(canvasElement, ENTRY_NAMES[idlePanel])
	const logo = entryNamed(canvasElement, SPACE_SETTINGS)
	for (const entry of [
		logo,
		entryNamed(canvasElement, SEARCH),
		entryNamed(canvasElement, READER.name),
	]) {
		await expect(entry).not.toHaveAttribute("aria-current")
		await expect(getComputedStyle(entry).color).toBe(
			getComputedStyle(idle).color,
		)
		await expect(fillOf(entry)).toBe(NO_FILL)
	}
}

const expectNoEntryInColour = async (canvasElement: HTMLElement) => {
	const rail = railIn(canvasElement)
	const colour = tokenStyleIn(rail, "bg-primary", "backgroundColor")
	for (const entry of railEntriesIn(canvasElement)) {
		await expect(fillOf(entry)).not.toBe(colour)
		await expect(getComputedStyle(entry).color).not.toBe(colour)
	}
}

const expectCurrentBesideIdle = async (canvasElement: HTMLElement) =>
	waitFor(async () => {
		await expectOnlySelected(canvasElement, OPENING_PANEL)
		await expectFootLikeIdlePanel(canvasElement, OPENING_PANEL)
		await expectNoEntryInColour(canvasElement)
	})

const expectHoverBetweenIdleAndCurrent = async (canvasElement: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const rail = railIn(canvasElement)
	const currentFill = tokenStyleIn(
		rail,
		"bg-rail-item-selected",
		"backgroundColor",
	)
	const hoverFill = tokenStyleIn(
		rail,
		"bg-rail-item-selected/50",
		"backgroundColor",
	)
	const idle = entryNamed(canvasElement, ENTRY_NAMES.missions)
	const current = entryNamed(canvasElement, ENTRY_NAMES[OPENING_PANEL])
	const pointer = await realPointer()
	await pointer.hover(idle)
	await waitFor(() => expect(fillOf(idle)).toBe(hoverFill))
	await expect(iconStyleOf(idle)).toBe("stroke")
	await expect(hoverFill).not.toBe(currentFill)
	await pointer.hover(current)
	await waitFor(() => expect(fillOf(current)).toBe(currentFill))
	await pointer.unhover(current)
}

const expectRailGeometry = async (canvasElement: HTMLElement) => {
	const rail = railIn(canvasElement)
	const radius = tokenStyleIn(rail, "rounded-lg", "borderTopLeftRadius")
	await expect(rail.getBoundingClientRect().width).toBe(RAIL_WIDTH)
	for (const entry of railEntriesIn(canvasElement)) {
		const box = entry.getBoundingClientRect()
		await expect(box.width).toBe(RAIL_BUTTON)
		await expect(box.height).toBe(RAIL_BUTTON)
		await expect(getComputedStyle(entry).borderTopLeftRadius).toBe(radius)
	}
}

const expectSettingsOpen = async (
	canvasElement: HTMLElement,
	current: string,
) => {
	const rail = railIn(canvasElement)
	const selectedFill = tokenStyleIn(
		rail,
		"bg-rail-item-selected",
		"backgroundColor",
	)
	await expectRailGeometry(canvasElement)
	await expect(topGroupEntriesIn(canvasElement)).toEqual(TOP_GROUP)
	for (const entry of railEntriesIn(canvasElement)) {
		if (entry.getAttribute("aria-label") === current) {
			await expect(entry).toHaveAttribute("aria-current", "true")
			await expect(fillOf(entry)).toBe(selectedFill)
		} else {
			await expect(entry).not.toHaveAttribute("aria-current")
			await expect(fillOf(entry)).toBe(NO_FILL)
		}
	}
	for (const panel of PANELS) {
		await expect(
			iconStyleOf(entryNamed(canvasElement, ENTRY_NAMES[panel])),
		).toBe("stroke")
	}
	await expect(
		slotIn(
			entryNamed(canvasElement, READER.name),
			"app-rail-avatar",
		).getBoundingClientRect().width,
	).toBe(RAIL_AVATAR)
}

const selecting = (selected: AppRailPanel) => ({
	args: { selected },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectOnlySelected(canvasElement, selected)
	},
})

const meta = preview.meta({
	title: "Navigation/AppRail",
	component: AppRail,
	render: renderRail,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The 60px column of 44px icons down the left edge of the window: the current space's logo first, a 26px square in its colour that opens the space settings, the search that opens the Cmd/Ctrl+K palette right under it, then the three panels a reader moves between, Conversations, Missions then Library, and the reader at the foot. The rail draws and reports; which panel is open and which settings is open over it are props, and each entry reports its own press. An entry is a button named by its panel, the open one marked `aria-current`. While a settings is open, its entry is the current one and no panel entry is. The palette is not a panel: while it is open the search entry wears the selected fill through `aria-expanded`, never `aria-current`, and the open panel keeps its mark.",
			},
		},
	},
	args: {
		selected: OPENING_PANEL,
		user: READER,
		space: CURRENT_SPACE,
		onSelectConversations: fn(),
		onSelectMissions: fn(),
		onSelectLibrary: fn(),
		onOpenSearch: fn(),
		onOpenSpaceSettings: fn(),
		onOpenYou: fn(),
	},
})

export const Conversations = meta.story({
	...selecting("conversations"),
	play: async ({ canvasElement }) => {
		await expectRailGeometry(canvasElement)
		await expectCurrentBesideIdle(canvasElement)
		await expectBareBottomGroup(canvasElement)
		await expectListRowGapBetweenEntries(canvasElement)
	},
	parameters: {
		docs: {
			description: {
				story:
					"E1, Conversations. The rail as the app opens it, the current entry beside idle ones. Check the rail is 60px wide and every entry a 44px square on the `radius-lg` corner, that the conversation bubble sits on the 10% fill in the foreground colour while the Space logo, Search, Missions, Library and the reader sit on no fill with Library last in the top group, after Missions, that the Space logo sits first, then Search, above Conversations, and that the reader's initial alone holds the foot of the rail.",
			},
		},
	},
})

export const SpaceSettingsOverConversations = meta.story({
	args: { selected: "conversations", openSettings: "space" },
	parameters: {
		docs: {
			description: {
				story:
					"E1, Space settings over Conversations. The space settings open while the Conversations panel stays the one underneath. Check the Space logo is the only entry marked `aria-current`, on the selected fill with its square still in the space colour, and that Conversations and Missions sit on no fill with their stroked icons. Pick `UserSettingsOverMissions` for the reader's own settings.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSettingsOpen(canvasElement, SPACE_SETTINGS)
		await expect(spaceLogoIn(canvasElement).dataset.colour).toBe(
			String(BLOT_HUES.blue),
		)
	},
})

export const UserSettingsOverMissions = meta.story({
	args: { selected: "missions", openSettings: "you" },
	parameters: {
		docs: {
			description: {
				story:
					"E1, User settings over Missions. The reader's own settings open while the Missions panel stays the one underneath. Check the reader's 44px button is the only entry marked `aria-current`, on the selected fill, that the 26px avatar inside it is drawn as it always is, and that the Space logo, Conversations and Missions sit on no fill with their stroked icons. Pick `SpaceSettingsOverConversations` for the space settings.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSettingsOpen(canvasElement, READER.name)
	},
})

export const MissionsSelected = meta.story(selecting("missions"))

export const LibrarySelected = meta.story({
	...selecting("library"),
	parameters: {
		docs: {
			description: {
				story:
					"Library open. Check Library, last in the top group after Missions, is the only panel entry marked `aria-current`, on the selected fill with the filled book in the foreground ink, and that Conversations and Missions sit on no fill with their stroked icons.",
			},
		},
	},
})

export const WithoutLibraryHandler = meta.story({
	tags: ["test-only"],
	args: { onSelectLibrary: undefined },
	play: async ({ canvasElement }) => {
		await expect(topGroupEntriesIn(canvasElement)).toEqual([
			SPACE_SETTINGS,
			SEARCH,
			ENTRY_NAMES.conversations,
			ENTRY_NAMES.missions,
		])
		await expect(
			within(slotIn(canvasElement, "app-rail")).queryByRole("button", {
				name: ENTRY_NAMES.library,
			}),
		).toBeNull()
	},
})

const HOME = "Home"

const TOP_GROUP_WITH_HOME = [
	SPACE_SETTINGS,
	SEARCH,
	HOME,
	...PANELS.map((panel) => ENTRY_NAMES[panel]),
]

const expectHomeEntry = async (
	canvasElement: HTMLElement,
	isCurrent: boolean,
) => {
	const rail = railIn(canvasElement)
	const home = entryNamed(canvasElement, HOME)
	await expect(topGroupEntriesIn(canvasElement)).toEqual(TOP_GROUP_WITH_HOME)
	if (isCurrent) {
		await expect(home).toHaveAttribute("aria-current", "true")
		await expect(fillOf(home)).toBe(
			tokenStyleIn(rail, "bg-rail-item-selected", "backgroundColor"),
		)
		await expect(iconColourOf(home)).toBe(
			tokenStyleIn(rail, "text-foreground", "color"),
		)
	} else {
		await expect(home).not.toHaveAttribute("aria-current")
		await expect(fillOf(home)).toBe(NO_FILL)
		await expect(iconColourOf(home)).toBe(
			tokenStyleIn(rail, "text-muted-foreground", "color"),
		)
	}
	await expect(iconStyleOf(home)).toBe("stroke")
	await expectDrawnWith(home, Icons.Add)
}

const expectNoPanelCurrent = async (canvasElement: HTMLElement) => {
	for (const panel of PANELS) {
		const entry = entryNamed(canvasElement, ENTRY_NAMES[panel])
		await expect(entry).not.toHaveAttribute("aria-current")
		await expect(fillOf(entry)).toBe(NO_FILL)
		await expect(iconStyleOf(entry)).toBe("stroke")
	}
}

const expectHomeHoveredLikeIdlePanel = async (canvasElement: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const home = entryNamed(canvasElement, HOME)
	const hoverFill = tokenStyleIn(
		railIn(canvasElement),
		"bg-rail-item-selected/50",
		"backgroundColor",
	)
	const pointer = await realPointer()
	await pointer.hover(home)
	await waitFor(() => expect(fillOf(home)).toBe(hoverFill))
	await expect(iconStyleOf(home)).toBe("stroke")
	const tooltip = await screen.findByRole("tooltip")
	await expect(tooltip).toHaveTextContent(HOME)
	await waitFor(() =>
		expect(tooltip.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			home.getBoundingClientRect().right,
		),
	)
	await pointer.unhover(home)
}

const homeSelected = {
	args: { onSelectHome: fn(), isHomeSelected: true },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectHomeEntry(canvasElement, true)
		await expectNoPanelCurrent(canvasElement)
	},
}

export const HomeUnselected = meta.story({
	args: { onSelectHome: fn(), isHomeSelected: false },
	parameters: {
		docs: {
			description: {
				story:
					"Home beside an open Conversations. Check Home sits third in the top group, after the Space logo and Search and directly above Conversations, in the muted ink on no fill with its stroked plus, that hovering it lays the half fill with its tooltip on the right, as an idle panel does, that Conversations keeps its current mark, and that a press reports once. Pick `HomeSelected` for Home open.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectHomeEntry(canvasElement, false)
		await expect(
			entryNamed(canvasElement, ENTRY_NAMES.conversations),
		).toHaveAttribute("aria-current", "true")
		await expectHomeHoveredLikeIdlePanel(canvasElement)
		await userEvent.click(entryNamed(canvasElement, HOME))
		await expect(args.onSelectHome).toHaveBeenCalledTimes(1)
	},
})

export const HomeSelected = meta.story({
	...homeSelected,
	parameters: {
		docs: {
			description: {
				story:
					"Home open while `selected` still names Conversations. Check Home, directly above Conversations, is the one entry marked `aria-current`, on the selected fill with the stroked plus in the foreground ink, and that Conversations, Missions and Library sit on no fill with their stroked icons. Pick `HomeSelectedDark` for the same state in dark.",
			},
		},
	},
})

export const HomeSelectedDark = meta.story({
	...homeSelected,
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Home open, dark: the stroked plus on the dark selected fill. Pick `HomeSelected` for the light theme.",
			},
		},
	},
})

export const HomeUnderSpaceSettings = meta.story({
	tags: ["test-only"],
	args: { ...homeSelected.args, openSettings: "space" },
	play: async ({ canvasElement }) => {
		await expectHomeEntry(canvasElement, false)
		await expectNoPanelCurrent(canvasElement)
		await expect(entryNamed(canvasElement, SPACE_SETTINGS)).toHaveAttribute(
			"aria-current",
			"true",
		)
	},
})

export const HomeKeyboardReach = meta.story({
	tags: ["test-only"],
	args: { onSelectHome: fn() },
	play: async ({ args, canvasElement, userEvent }) => {
		await userEvent.tab()
		await userEvent.tab()
		await expect(entryNamed(canvasElement, SEARCH)).toHaveFocus()
		await userEvent.tab()
		const home = entryNamed(canvasElement, HOME)
		await expect(home).toHaveFocus()
		await expect(getComputedStyle(home).boxShadow).not.toBe("none")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectHome).toHaveBeenCalledTimes(1)
		await userEvent.tab()
		await expect(
			entryNamed(canvasElement, ENTRY_NAMES.conversations),
		).toHaveFocus()
	},
})

export const HomeSelectedWithoutHandler = meta.story({
	tags: ["test-only"],
	args: { isHomeSelected: true },
	play: async ({ canvasElement }) => {
		await expect(
			within(railIn(canvasElement)).queryByRole("button", { name: HOME }),
		).toBeNull()
		await expectOnlySelected(canvasElement, "conversations")
	},
})

const SelectableRail = (args: AppRailProps) => {
	const [selected, setSelected] = useState(args.selected)
	return renderRail({
		...args,
		selected,
		onSelectConversations: () => setSelected("conversations"),
		onSelectMissions: () => setSelected("missions"),
	})
}

export const SelectionMovesToMissions = meta.story({
	tags: ["test-only"],
	render: (args) => <SelectableRail {...args} />,
	play: async ({ canvasElement, userEvent }) => {
		await expectOnlySelected(canvasElement, "conversations")
		await userEvent.click(entryNamed(canvasElement, ENTRY_NAMES.missions))
		await waitFor(() => expectOnlySelected(canvasElement, "missions"))
	},
})

const renderBothIconStates = (args: AppRailProps) => (
	<div className="flex h-[32rem] gap-8 bg-background">
		{PANELS.map((panel) => (
			<div className="flex" data-selected-panel={panel} key={panel}>
				<AppRail {...args} selected={panel} />
			</div>
		))}
	</div>
)

const railSelecting = (canvasElement: HTMLElement, panel: AppRailPanel) => {
	const column = canvasElement.querySelector<HTMLElement>(
		`[data-selected-panel="${panel}"]`,
	)
	if (!column) throw new Error(`No rail selecting ${panel}`)
	return column
}

const iconOffsetIn = (entry: HTMLElement) => {
	const entryBox = entry.getBoundingClientRect()
	const iconBox = iconOf(entry).getBoundingClientRect()
	return {
		top: iconBox.top - entryBox.top,
		left: iconBox.left - entryBox.left,
		width: iconBox.width,
		height: iconBox.height,
	}
}

const expectSameGlyphInTwoStyles = async (
	canvasElement: HTMLElement,
	panel: AppRailPanel,
) => {
	const idlePanel = PANELS.find((other) => other !== panel)
	if (!idlePanel) throw new Error("No idle panel entry")
	const name = ENTRY_NAMES[panel]
	const current = entryNamed(railSelecting(canvasElement, panel), name)
	const idle = entryNamed(railSelecting(canvasElement, idlePanel), name)
	await expect(current).toHaveAttribute("aria-current", "true")
	await expect(idle).not.toHaveAttribute("aria-current")
	await expect(iconOf(current).outerHTML).not.toBe(iconOf(idle).outerHTML)
	await expect(iconStyleOf(current)).toBe("fill")
	await expect(iconStyleOf(idle)).toBe("stroke")
	await expect(iconOffsetIn(current)).toEqual(iconOffsetIn(idle))
	await expect(getComputedStyle(iconOf(current)).strokeWidth).toBe(
		getComputedStyle(iconOf(idle)).strokeWidth,
	)
	await expect(current.getBoundingClientRect().height).toBe(
		idle.getBoundingClientRect().height,
	)
	for (const path of paintedPathsOf(current)) {
		await expect(getComputedStyle(path).fill).toBe(iconColourOf(current))
	}
}

export const IconStatesSideBySide = meta.story({
	render: renderBothIconStates,
	parameters: {
		a11y: {
			config: { rules: [{ id: "landmark-unique", reviewOnFail: true }] },
		},
		docs: {
			description: {
				story:
					"Each panel icon in both of its states: the rails open Conversations, Missions then Library, left to right. Check the current entry draws the filled glyph and the idle one the stroked glyph, at the same size and in the ink of its entry, and that the flag pole keeps the stroke width of the idle flag.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const panel of PANELS) {
			await expectSameGlyphInTwoStyles(canvasElement, panel)
		}
	},
})

export const IdleEntryHovered = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Missions under the pointer beside the current Conversations entry. Check the hover fill reads at half the current fill, and that the current entry keeps its full fill when the pointer moves onto it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectHoverBetweenIdleAndCurrent(canvasElement)
	},
})

const expectSearchLikeMissions = async (canvasElement: HTMLElement) => {
	const search = entryNamed(canvasElement, SEARCH)
	const missions = entryNamed(canvasElement, ENTRY_NAMES.missions)
	const searchIcon = getComputedStyle(iconOf(search))
	const missionsIcon = getComputedStyle(iconOf(missions))
	await expect(search.getBoundingClientRect().width).toBe(RAIL_BUTTON)
	await expect(search.getBoundingClientRect().height).toBe(RAIL_BUTTON)
	await expect(getComputedStyle(search).borderTopLeftRadius).toBe(
		getComputedStyle(missions).borderTopLeftRadius,
	)
	await expect(searchIcon.strokeWidth).toBe(missionsIcon.strokeWidth)
	await expect(iconOffsetIn(search)).toEqual(iconOffsetIn(missions))
}

const expectSearchTooltipBeside = async (search: HTMLElement) => {
	const tooltip = await screen.findByRole("tooltip")
	await expect(tooltip).toHaveTextContent(SEARCH)
	const chord = tooltip.querySelector('[data-slot="kbd"]')
	await expect(chord).toHaveTextContent(SEARCH_CHORD)
	await waitFor(() =>
		expect(tooltip.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			search.getBoundingClientRect().right,
		),
	)
}

export const SearchEntryAtRest = meta.story({
	args: { isSearchOpen: false },
	parameters: {
		docs: {
			description: {
				story:
					"A1, the search entry at rest, second in the top group, right under the Space logo and above Conversations. Check it is the same 44px square on the `radius-lg` corner as Missions, its magnifier the size of the Missions flag, at the same 1.75 stroke and the same offset, in the muted ink on no fill, named Search, never marked `aria-current` and reporting the palette closed. Pick `SearchEntryHovered` for its hint, `SearchPaletteOpen` for the entry while the palette is up.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(topGroupEntriesIn(canvasElement)).toEqual(TOP_GROUP)
		const search = entryNamed(canvasElement, SEARCH)
		const rail = railIn(canvasElement)
		await expectSearchLikeMissions(canvasElement)
		await expect(search).not.toHaveAttribute("aria-current")
		await expect(search).toHaveAttribute("aria-expanded", "false")
		await expect(search).toHaveAttribute("aria-haspopup", "dialog")
		await expect(fillOf(search)).toBe(NO_FILL)
		await expect(iconColourOf(search)).toBe(
			tokenStyleIn(rail, "text-muted-foreground", "color"),
		)
		await expect(iconStyleOf(search)).toBe("stroke")
	},
})

export const SearchEntryHovered = meta.story({
	args: { isSearchOpen: false },
	parameters: {
		docs: {
			description: {
				story:
					"A2, the search entry under the pointer. Check it takes half the selected fill with the magnifier in the foreground ink, as every idle rail entry does, that its hint opens on its right and reads Search then the Cmd/Ctrl+K chord in a Kbd chip, and that a press asks the host to open the palette once without selecting any panel.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const search = entryNamed(canvasElement, SEARCH)
		const rail = railIn(canvasElement)
		if (isInBrowserRunner()) {
			const hoverFill = tokenStyleIn(
				rail,
				"bg-rail-item-selected/50",
				"backgroundColor",
			)
			const hoverInk = tokenStyleIn(rail, "text-foreground", "color")
			const pointer = await realPointer()
			await pointer.hover(search)
			await waitFor(() => expect(fillOf(search)).toBe(hoverFill))
			await expect(iconColourOf(search)).toBe(hoverInk)
			await pointer.unhover(search)
		}
		await userEvent.hover(search)
		await expectSearchTooltipBeside(search)
		await userEvent.click(search)
		await expect(args.onOpenSearch).toHaveBeenCalledTimes(1)
		await expect(args.onSelectConversations).not.toHaveBeenCalled()
		await expect(args.onSelectMissions).not.toHaveBeenCalled()
		await expect(args.onSelectLibrary).not.toHaveBeenCalled()
	},
})

const playPaletteOpen = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement
}) => {
	const search = entryNamed(canvasElement, SEARCH)
	const conversations = entryNamed(canvasElement, ENTRY_NAMES.conversations)
	const rail = railIn(canvasElement)
	const selectedFill = tokenStyleIn(
		rail,
		"bg-rail-item-selected",
		"backgroundColor",
	)
	const selectedInk = tokenStyleIn(rail, "text-foreground", "color")
	await expect(search).toHaveAttribute("aria-expanded", "true")
	await expect(search).not.toHaveAttribute("aria-current")
	await expect(conversations).toHaveAttribute("aria-current", "true")
	await waitFor(async () => {
		await expect(fillOf(search)).toBe(selectedFill)
		await expect(iconColourOf(search)).toBe(selectedInk)
		await expect(fillOf(conversations)).toBe(selectedFill)
	})
	await expect(iconStyleOf(conversations)).toBe("fill")
	await expect(rail.querySelectorAll('[aria-current="true"]')).toHaveLength(1)
}

export const SearchPaletteOpen = meta.story({
	args: { isSearchOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"A3, the palette open over Conversations. Check the search entry wears the full selected fill with the magnifier in the foreground ink and reports the palette expanded, that it is not marked `aria-current`, and that Conversations keeps its own current mark, its fill and its filled bubble, the one entry `aria-current` in the rail. Pick `SearchPaletteOpenDark` for the same state in dark.",
			},
		},
	},
	play: playPaletteOpen,
})

export const SearchPaletteOpenDark = meta.story({
	args: { isSearchOpen: true },
	globals: { theme: "dark" },
	play: playPaletteOpen,
})

export const WithoutSearchHandler = meta.story({
	tags: ["test-only"],
	args: { onOpenSearch: undefined },
	play: async ({ canvasElement }) => {
		await expect(topGroupEntriesIn(canvasElement)).toEqual(
			TOP_GROUP.filter((name) => name !== SEARCH),
		)
		await expect(
			within(railIn(canvasElement)).queryByRole("button", { name: SEARCH }),
		).toBeNull()
	},
})

export const RemovedPanelFallsBackToConversations = meta.story({
	render: renderInSidebar(REMOVED_PANEL),
	parameters: {
		docs: {
			description: {
				story:
					"A stored panel that the rail no longer offers, the Companions panel a reader may have left open before it was removed. Check the sidebar opens the Conversations panel, marks Conversations current and draws no entry for the removed panel.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			entryNamed(canvasElement, ENTRY_NAMES.conversations),
		).toHaveAttribute("aria-current", "true")
		await expect(
			entryNamed(canvasElement, ENTRY_NAMES.missions),
		).not.toHaveAttribute("aria-current")
		await expect(
			canvas.getByRole("complementary", { name: ENTRY_NAMES.conversations }),
		).toBeVisible()
		await expect(
			within(slotIn(canvasElement, "app-rail")).queryByRole("button", {
				name: "Agents",
			}),
		).toBeNull()
	},
})

export const SpaceLogoHovered = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The current space's logo, first in the rail, under the pointer. Check it is the 26px SpaceAvatar in the space colour, with no icon and no presence dot, that no gear is left in the rail, that the tooltip and the name spoken for it read Space settings alone, and that a press opens the space settings. Pick `SpaceLogoWithoutSpace` for the logo before a space is known.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectSpaceLogoFirstWithoutGear(canvasElement, SPACE_SETTINGS)
		const logo = entryNamed(canvasElement, SPACE_SETTINGS)
		await expect(slotIn(logo, "space-avatar").dataset.colour).toBe(
			String(BLOT_HUES.blue),
		)
		await userEvent.hover(logo)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			SPACE_SETTINGS,
		)
		await userEvent.click(logo)
		await expect(args.onOpenSpaceSettings).toHaveBeenCalledTimes(1)
		await expect(args.onOpenYou).not.toHaveBeenCalled()
	},
})

export const SpaceLogoWithoutSpace = meta.story({
	args: { space: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The rail before the current space is known. Check the logo keeps its 26px SpaceAvatar in the first slot, drawn in the greys of a Space with no colour, and that it still opens the space settings. Pick `SpaceLogoHovered` for the logo in a space colour.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSpaceLogoFirstWithoutGear(canvasElement, SPACE_SETTINGS)
		await expect(spaceLogoIn(canvasElement).dataset.colour).toBeUndefined()
	},
})

export const FirstTabUnderTitleBar = meta.story({
	render: renderInSidebar("conversations"),
	parameters: {
		docs: {
			description: {
				story:
					"The rail beside the panel it opens, under the title bar. Check the first tab starts 7px under the 34px title bar, the rail's own top padding, and that the rail stays 60px wide.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rail = slotIn(canvasElement, "app-rail")
		const [first] = Array.from(
			rail.querySelectorAll<HTMLElement>('[data-slot="app-rail-item"]'),
		).map((entry) => entry.getBoundingClientRect())
		const titleBar = slotIn(
			canvasElement,
			"app-title-bar",
		).getBoundingClientRect()
		await expect(first.top - titleBar.bottom).toBe(RAIL_TOP_INSET)
		await expect(rail.getBoundingClientRect().width).toBe(RAIL_WIDTH)
		await expect(titleBar.height).toBe(SHELL_TITLE_BAR_HEIGHT)
	},
})

const updateWaiting = updateBadgeIn("available")

export const UpdateWaiting = meta.story({
	...updateWaiting,
	parameters: {
		docs: {
			description: {
				story:
					"E1, Update waiting. An update waiting to be downloaded, handed to the rail by the host, Conversations the current entry. Check the badge is the first stop of the foot group, a 44px slot with no fill directly above the reader, its 28px round button centred in it on both axes, and that the rail keeps its 60px width and 44px entries.",
			},
		},
	},
	play: async (context) => {
		await updateWaiting.play(context)
		await expectRailGeometry(context.canvasElement)
		await waitFor(() =>
			expectOnlySelected(context.canvasElement, "conversations"),
		)
	},
})

export const UpdateDownloading = meta.story({
	...updateBadgeIn("downloading"),
	parameters: {
		docs: {
			description: {
				story:
					"The update downloading, its ring filling around the badge. Check the ring stays centred in its 44px slot above the reader and the rail does not shift while it fills.",
			},
		},
	},
})

export const UpdateReady = meta.story({
	...updateBadgeIn("ready"),
	parameters: {
		docs: {
			description: {
				story:
					"The update installed and waiting for a restart, the badge a single restart control with no panel. Check the badge keeps its place above the reader, centred in the same 44px slot.",
			},
		},
	},
})

export const UpdateWaitingDark = meta.story({
	...updateWaiting,
	globals: { theme: "dark" },
})

export const UpdateIdle = meta.story({
	args: { updateBadge: <UpdateBadge status="idle" /> },
	parameters: {
		docs: {
			description: {
				story:
					"The state the app is in nearly all the time: the host hands the rail a badge that has nothing to show. Check the foot of the rail holds the reader only, with no gap held open above it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectBareBottomGroup(canvasElement)
	},
})

export const KeyboardReach = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement, userEvent }) => {
		await userEvent.tab()
		const logo = entryNamed(canvasElement, SPACE_SETTINGS)
		await expect(logo).toHaveFocus()
		await expect(logo).toHaveAttribute("type", "button")
		await expect(getComputedStyle(logo).boxShadow).not.toBe("none")
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			SPACE_SETTINGS,
		)
		await userEvent.tab()
		const search = entryNamed(canvasElement, SEARCH)
		await expect(search).toHaveFocus()
		await expect(getComputedStyle(search).boxShadow).not.toBe("none")
		await expectSearchTooltipBeside(search)
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpenSearch).toHaveBeenCalledTimes(1)
		await userEvent.tab()
		const conversations = entryNamed(canvasElement, "Conversations")
		await expect(conversations).toHaveFocus()
		await expect(getComputedStyle(conversations).boxShadow).not.toBe("none")
		await userEvent.tab()
		const missions = entryNamed(canvasElement, "Missions")
		await expect(missions).toHaveFocus()
		await expect(iconStyleOf(missions)).toBe("stroke")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectMissions).toHaveBeenCalledTimes(1)
		await userEvent.tab()
		const library = entryNamed(canvasElement, "Library")
		await expect(library).toHaveFocus()
		await expect(iconStyleOf(library)).toBe("stroke")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectLibrary).toHaveBeenCalledTimes(1)
		for (const entry of railEntriesIn(canvasElement).slice(PANELS.length + 2)) {
			await userEvent.tab()
			await expect(entry).toHaveFocus()
			await expect(getComputedStyle(entry).boxShadow).not.toBe("none")
		}
		await userEvent.click(entryNamed(canvasElement, READER.name))
		await expect(args.onOpenYou).toHaveBeenCalledTimes(1)
		await userEvent.click(entryNamed(canvasElement, SPACE_SETTINGS))
		await expect(args.onOpenSpaceSettings).toHaveBeenCalledTimes(1)
	},
})

export const Dark = meta.story({
	globals: { theme: "dark" },
	play: async ({ canvasElement }) => {
		await expectListRowGapBetweenEntries(canvasElement)
	},
})

export const CurrentBesideIdleDark = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The rail as the app opens it in dark. Check the conversation bubble sits on the 12% fill in the foreground colour while the Space logo, Missions and the reader sit on no fill, and that hovering Missions draws half the current fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectCurrentBesideIdle(canvasElement)
		await expectHoverBetweenIdleAndCurrent(canvasElement)
	},
})

const SPACES_MENU = "Change space, Vocca open"

const SPACE_LIST: Space[] = [STUDIO, CURRENT_SPACE, ATELIER, GARAGE]

const renderSpacesWindow = (args: AppRailProps) => (
	<div className="surface-shell relative flex h-[32rem] w-320 pt-10">
		<AppTitleBar
			activeTabId={RELEASE_NOTES.id}
			canGoBack
			data-tauri-drag-region="deep"
			insetWindowControls
			tabs={[RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING]}
		/>
		<AppRail {...args} />
	</div>
)

const A7 = {
	spaces: SPACE_LIST,
	onSelectSpace: fn(),
	onCreateSpace: fn(),
} satisfies Partial<AppRailProps>

const playA7 = async ({
	args,
	canvasElement,
	userEvent,
}: {
	args: AppRailProps
	canvasElement: HTMLElement
	userEvent: { click: (element: Element) => Promise<void> }
}) => {
	const logo = entryNamed(canvasElement, SPACES_MENU)
	await expect(logo).not.toHaveAttribute("aria-current")
	await expect(getComputedStyle(logo).backgroundColor).toBe("rgba(0, 0, 0, 0)")
	await userEvent.click(logo)
	const menu = await settled(
		await screen.findByRole("menu", { name: "Spaces" }),
	)
	await expect(logo).toHaveAttribute("aria-expanded", "true")
	await expect(getComputedStyle(logo).backgroundColor).toBe(
		tokenStyleIn(logo, "bg-rail-item-selected", "backgroundColor"),
	)
	await expect(menu.getBoundingClientRect().width).toBe(248)

	const rows = within(menu).getAllByRole("menuitemradio")
	await expect(rows).toHaveLength(SPACE_LIST.length)
	for (const [rank, space] of SPACE_LIST.entries()) {
		await expect(rows[rank]).toHaveAccessibleName(new RegExp(`^${space.name}`))
		await expect(rows[rank]).toHaveTextContent(`⌘${rank + 1}`)
		const row = rows[rank].getBoundingClientRect()
		const avatarSlot = slotIn(rows[rank], "space-avatar")
		const avatar = avatarSlot.getBoundingClientRect()
		const drawing = avatarSlot.querySelector("svg")?.getBoundingClientRect()
		const avatarCentre = centreOf(avatar).y
		await expect(row.height).toBe(40)
		await expect([avatar.width, drawing?.width, drawing?.height]).toEqual([
			26, 26, 26,
		])
		await expect(avatar.top - row.top).toBe(7)
		for (const label of [
			within(rows[rank]).getByText(space.name),
			slotIn(rows[rank], "context-menu-shortcut"),
		])
			await expect(centreOf(label.getBoundingClientRect()).y).toBeCloseTo(
				avatarCentre,
				1,
			)
		await expect(rows[rank]).toHaveAttribute(
			"aria-checked",
			space.id === CURRENT_SPACE.id ? "true" : "false",
		)
	}
	await expect(slotIn(rows[0], "space-avatar").dataset.colour).toBe(
		String(STUDIO.colour),
	)
	await expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent),
	).toEqual(["Space settings", "Create a space"])
	await expect(args.onSelectSpace).not.toHaveBeenCalled()
}

export const A7SpacesMenu = meta.story({
	args: A7,
	render: renderSpacesWindow,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A7, light: the Spaces menu the rail's Space logo opens, in a 1280px window under the tab bar. Check the logo rests on no fill and takes the selected rail fill while its menu is open, that the 248px menu lists the four spaces with their 26px avatar 7px from the top of a 40px row, their name and their shortcut centred on it, the current one checked, then a rule, Space settings and Create a space. Pick `SpaceLogoHovered` for the logo itself.",
			},
		},
	},
	play: playA7,
})

export const A7SpacesMenuDark = meta.story({
	args: A7,
	globals: { theme: "dark" },
	render: renderSpacesWindow,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A7, dark: the Spaces menu on the raised dark menu ground, the open logo on the 12% white fill. Pick `A7SpacesMenu` for the light theme.",
			},
		},
	},
	play: playA7,
})

const A7_BADGE = {
	...A7,
	badgesBySpaceId: {
		[CURRENT_SPACE.id]: "done",
		[STUDIO.id]: "attention",
		[GARAGE.id]: "failed",
	},
} satisfies Partial<AppRailProps>

export const A7SpacesMenuAttentionRow = meta.story({
	args: A7_BADGE,
	render: renderSpacesWindow,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A7, light: Studio waits on the reader and Garage failed while Vocca is open. Check the rail's Space logo stays bare, with no dot at its trailing corner and the plain Change space name, and that the Spaces menu it opens rings Studio's avatar for attention while the rows with no attention carry no ring: the menu is where the reader learns which space needs them. Pick `A7SpacesMenu` for the menu with no news.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const logo = entryNamed(canvasElement, SPACES_MENU)
		await expect(logo).toHaveAccessibleName(SPACES_MENU)
		await userEvent.click(logo)
		const menu = await settled(
			await screen.findByRole("menu", { name: "Spaces" }),
		)
		const rows = within(menu).getAllByRole("menuitemradio")
		await expect(
			rows.map((row) => slotIn(row, "space-avatar").dataset.attention),
		).toEqual(["", undefined, undefined, undefined])
	},
})

export const SpacesMenuGestures = meta.story({
	tags: ["test-only"],
	args: { ...A7, onSpacesMenuOpenChange: fn() },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Each entry of the Spaces menu reports its gesture: choosing a space reports its id, Space settings and Create a space each report once, and the menu reports it opened. Check no row runs a colour transition and the logo changes its fill at once.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const logo = entryNamed(canvasElement, SPACES_MENU)
		await expect(getComputedStyle(logo).transitionDuration).toBe("0s")
		const pick = async (role: "menuitem" | "menuitemradio", name: string) => {
			await userEvent.click(logo)
			const menu = await settled(await screen.findByRole("menu"))
			const row = within(menu).getByRole(role, { name: new RegExp(`^${name}`) })
			await expect(getComputedStyle(row).transitionDuration).toBe("0s")
			await userEvent.click(row)
			await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
		}
		await pick("menuitemradio", ATELIER.name)
		await expect(args.onSelectSpace).toHaveBeenCalledWith(ATELIER.id)
		await expect(args.onSpacesMenuOpenChange).toHaveBeenCalledWith(true)
		await pick("menuitem", "Space settings")
		await expect(args.onOpenSpaceSettings).toHaveBeenCalledTimes(1)
		await pick("menuitem", "Create a space")
		await expect(args.onCreateSpace).toHaveBeenCalledTimes(1)
	},
})
