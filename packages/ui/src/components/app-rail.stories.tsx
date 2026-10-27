import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	hueScopeOf,
	isInBrowserRunner,
	probedStyleOf,
	realPointer,
	settled,
	slotIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	AppRail,
	type AppRailDots,
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
import type { BotBadge } from "@workspace/ui/components/bot-badge"
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
}

const SPACE_SETTINGS = "Space settings"

const CURRENT_SPACE: Space = {
	id: "vocca",
	name: "Vocca",
	colour: "blue",
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

const TOP_GROUP = [SPACE_SETTINGS, ...PANELS.map((panel) => ENTRY_NAMES[panel])]

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
	).toHaveLength(PANELS.length)
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
	for (const entry of [logo, entryNamed(canvasElement, READER.name)]) {
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

const DOT_TOKEN: Record<BotBadge, string> = {
	attention: "bg-warning",
	done: "bg-bot-badge-done",
	failed: "bg-bot-badge-failed",
}

const DOT_NEWS: Record<BotBadge, string> = {
	attention: "waiting for you",
	done: "activity finished",
	failed: "activity failed",
}

const isMotionReduced = () =>
	matchMedia("(prefers-reduced-motion: reduce)").matches

const expectDotOfKind = async (
	canvasElement: HTMLElement,
	panel: AppRailPanel,
	badge: BotBadge,
) => {
	const entry = entryNamed(
		canvasElement,
		`${ENTRY_NAMES[panel]}, ${DOT_NEWS[badge]}`,
	)
	const dot = slotIn(entry, "app-rail-dot")
	const { backgroundColor, animationName } = getComputedStyle(dot)
	await expect(backgroundColor).toBe(
		tokenStyleIn(entry, DOT_TOKEN[badge], "backgroundColor"),
	)
	await expect(backgroundColor).not.toBe(
		tokenStyleIn(entry, "bg-primary", "backgroundColor"),
	)
	const isPulsing = badge === "attention" && !isMotionReduced()
	await expect(animationName === "pulse").toBe(isPulsing)
}

const dotsOfKind = (dots: AppRailDots) => ({
	args: { dots },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		for (const panel of PANELS) {
			const badge = dots[panel]
			if (badge) await expectDotOfKind(canvasElement, panel, badge)
		}
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
					"The 60px column of 44px icons down the left edge of the window: the current space's logo first, a 26px square in its colour that opens the space settings, then the two panels a reader moves between, Conversations then Missions, and the reader at the foot. The rail draws and reports; which panel is open, which settings is open over it and the dot on each entry are props, and each entry reports its own press. An entry is a button named by its panel, the open one marked `aria-current`, and the news it carries is spoken in its name, so a dot never rides on colour alone. While a settings is open, its entry is the current one and no panel entry is.",
			},
		},
	},
	args: {
		selected: OPENING_PANEL,
		user: READER,
		space: CURRENT_SPACE,
		onSelectConversations: fn(),
		onSelectMissions: fn(),
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
		await expect(
			canvasElement.querySelector('[data-slot="app-rail-dot"]'),
		).toBeNull()
	},
	parameters: {
		docs: {
			description: {
				story:
					"E1, Conversations. The rail as the app opens it, the current entry beside idle ones. Check the rail is 60px wide and every entry a 44px square on the `radius-lg` corner, that the conversation bubble sits on the 10% fill in the foreground colour while the Space logo, Missions and the reader sit on no fill, that the Space logo sits first, above Conversations, and that the reader's initial alone holds the foot of the rail.",
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
		await expect(spaceLogoIn(canvasElement).dataset.colour).toBe("blue")
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
					"Each panel icon in both of its states: the left rail opens Conversations, the right one Missions. Check the current entry draws the filled glyph and the idle one the stroked glyph, at the same size and in the ink of its entry, and that the flag pole keeps the stroke width of the idle flag.",
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
				name: "Companions",
			}),
		).toBeNull()
	},
})

export const SpaceLogoHovered = meta.story({
	args: { dots: { settings: true } },
	parameters: {
		docs: {
			description: {
				story:
					"The current space's logo, first in the rail, under the pointer, carrying a dot. Check it is the 26px SpaceAvatar in the space colour, with no icon and no presence dot, that no gear is left in the rail, that the tooltip reads Space settings, that the name spoken for it is Space settings followed by the news it carries, and that a press opens the space settings. Pick `SpaceLogoWithoutSpace` for the logo before a space is known.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const name = `${SPACE_SETTINGS}, new activity`
		await expectSpaceLogoFirstWithoutGear(canvasElement, name)
		const logo = entryNamed(canvasElement, name)
		await expect(slotIn(logo, "space-avatar").dataset.colour).toBe("blue")
		await expect(slotIn(logo, "app-rail-dot")).toBeVisible()
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

export const WithDot = meta.story({
	args: { dots: { conversations: "done", missions: "attention" } },
	parameters: {
		docs: {
			description: {
				story:
					"Two entries with something new, the way the reference draws them. Check each dot is 8px, carries no number, flush with the top and trailing corner of its 44px entry and ringed 2px in the window ground, and that the entry's name says there is news.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const entry = entryNamed(canvasElement, "Conversations, activity finished")
		const dot = slotIn(entry, "app-rail-dot").getBoundingClientRect()
		const box = entry.getBoundingClientRect()
		await expect(dot.width).toBe(8)
		await expect(dot.top).toBe(box.top)
		await expect(dot.right).toBe(box.right)
		await expect(slotIn(canvasElement, "app-rail")).not.toHaveTextContent(/\d/)
		await expect(
			slotIn(
				entryNamed(canvasElement, "Missions, waiting for you"),
				"app-rail-dot",
			),
		).toBeVisible()
		await expect(
			entryNamed(canvasElement, SPACE_SETTINGS).querySelector(
				'[data-slot="app-rail-dot"]',
			),
		).toBeNull()
	},
})

export const AttentionDot = meta.story({
	...dotsOfKind({ conversations: "attention", missions: "attention" }),
	parameters: {
		docs: {
			description: {
				story:
					"A conversation of the space waits on the reader and a mission waits on them too. Check both dots wear `--warning`, never the primary blue, that they pulse while motion is allowed and hold still under `prefers-reduced-motion: reduce`, and that each entry is named waiting for you. Pick `DoneDot` for a turn that simply finished.",
			},
		},
	},
})

export const AttentionDotDark = meta.story({
	...dotsOfKind({ conversations: "attention", missions: "attention" }),
	globals: { theme: "dark" },
})

export const DoneDot = meta.story({
	...dotsOfKind({ conversations: "done" }),
	parameters: {
		docs: {
			description: {
				story:
					"The strongest badge among the conversations of the space is a finished turn. Check the Conversations dot is green on `--bot-badge-done`, holds still, and that the entry is named activity finished. Pick `FailedDot` for a turn that failed.",
			},
		},
	},
})

export const DoneDotDark = meta.story({
	...dotsOfKind({ conversations: "done" }),
	globals: { theme: "dark" },
})

export const FailedDot = meta.story({
	...dotsOfKind({ conversations: "failed" }),
	parameters: {
		docs: {
			description: {
				story:
					"A failed turn is the strongest badge among the conversations of the space, over any finished one. Check the Conversations dot is red on `--bot-badge-failed`, holds still, and that the entry is named activity failed. Pick `AttentionDot` for a conversation that waits on the reader.",
			},
		},
	},
})

export const FailedDotDark = meta.story({
	...dotsOfKind({ conversations: "failed" }),
	globals: { theme: "dark" },
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
		const conversations = entryNamed(canvasElement, "Conversations")
		await expect(conversations).toHaveFocus()
		await expect(getComputedStyle(conversations).boxShadow).not.toBe("none")
		await userEvent.tab()
		const missions = entryNamed(canvasElement, "Missions")
		await expect(missions).toHaveFocus()
		await expect(iconStyleOf(missions)).toBe("stroke")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectMissions).toHaveBeenCalledTimes(1)
		for (const entry of railEntriesIn(canvasElement).slice(PANELS.length + 1)) {
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

export const OnTintedSpace = meta.story({
	args: { dots: { conversations: "done", missions: "attention" } },
	render: (args: AppRailProps) => (
		<div className="surface-shell flex h-[32rem]" {...hueScopeOf("blue")}>
			<AppRail {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The rail on a space that carries a colour, which washes the shell surface behind it. Check the ring around each dot is the tinted surface itself, so no dot wears a halo of the uncoloured ground.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const ground = getComputedStyle(
			slotIn(canvasElement, "app-rail").parentElement as HTMLElement,
		).backgroundColor
		const dots = canvasElement.querySelectorAll('[data-slot="app-rail-dot"]')
		await expect(dots).toHaveLength(2)
		for (const dot of dots) {
			await expect(getComputedStyle(dot).boxShadow).toContain(ground)
		}
	},
})

export const Dark = meta.story({
	args: { dots: { conversations: "done", missions: "attention" } },
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
		await expect(rows[rank].getBoundingClientRect().height).toBe(32)
		await expect(rows[rank]).toHaveAttribute(
			"aria-checked",
			space.id === CURRENT_SPACE.id ? "true" : "false",
		)
	}
	const avatar = slotIn(rows[0], "space-avatar")
	await expect(avatar.getBoundingClientRect().width).toBe(14)
	await expect(avatar.dataset.colour).toBe(STUDIO.colour)
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
					"A7, light: the Spaces menu the rail's Space logo opens, in a 1280px window under the tab bar. Check the logo rests on no fill and takes the selected rail fill while its menu is open, that the 248px menu lists the four spaces with their 10px swatch, their name and their shortcut, the current one checked, then a rule, Space settings and Create a space. Pick `SpaceLogoHovered` for the logo itself.",
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
		[CURRENT_SPACE.id]: "attention",
		[STUDIO.id]: "done",
		[GARAGE.id]: "failed",
	},
} satisfies Partial<AppRailProps>

const playA7Badge = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement
}) => {
	const logo = entryNamed(canvasElement, `${SPACES_MENU}, ${DOT_NEWS.failed}`)
	const box = logo.getBoundingClientRect()
	await expect(box.width).toBe(RAIL_BUTTON)
	await expect(slotIn(logo, "space-avatar").getBoundingClientRect().width).toBe(
		SPACE_LOGO,
	)
	const dot = slotIn(logo, "app-rail-dot")
	const dotBox = dot.getBoundingClientRect()
	await expect(dotBox.width).toBe(8)
	await expect(dotBox.top).toBe(box.top)
	await expect(dotBox.right).toBe(box.right)
	await expect(getComputedStyle(dot).backgroundColor).toBe(
		tokenStyleIn(logo, DOT_TOKEN.failed, "backgroundColor"),
	)
}

export const A7SpacesBadge = meta.story({
	args: A7_BADGE,
	render: renderSpacesWindow,
	parameters: {
		docs: {
			description: {
				story:
					"A7, light: the rail's Space logo carrying the strongest badge of the other spaces, the rule the Space switcher uses. The current space waits on the reader, which the logo leaves out, Studio finished and Garage failed. Check the 8px failed dot sits flush with the top and trailing corner of the 44px button, the way the other rail entries carry theirs, and that the button's name ends on activity failed. The artboard draws no badge here. Pick `A7SpacesMenu` for the logo with no news.",
			},
		},
	},
	play: playA7Badge,
})

export const A7SpacesBadgeDark = meta.story({
	args: A7_BADGE,
	globals: { theme: "dark" },
	render: renderSpacesWindow,
	parameters: {
		docs: {
			description: {
				story:
					"A7, dark: the failed dot on the Space logo, ringed in the dark window ground. Pick `A7SpacesBadge` for the light theme.",
			},
		},
	},
	play: playA7Badge,
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
