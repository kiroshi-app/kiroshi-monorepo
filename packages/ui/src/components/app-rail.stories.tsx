import { type CSSProperties, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	probedStyleOf,
	realPointer,
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
import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { blotTint } from "@workspace/ui/components/companion-colour"
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

const RAIL_WIDTH = 52

const REMOVED_PANEL = "companions"

const PANELS = Object.keys(ENTRY_NAMES) as AppRailPanel[]

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

const panelEntriesIn = (canvasElement: HTMLElement) =>
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
	await expect(items).toHaveLength(2)
	await expect(within(items[0]).getByRole("button")).toBe(
		entryNamed(canvasElement, SPACE_SETTINGS),
	)
}

const updateBadgeIn = (status: UpdateBadgeStatus) => ({
	args: {
		updateBadge: <UpdateBadge progress={42} status={status} version="1.4.0" />,
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const [slot, settingsItem] = bottomGroupItemsIn(canvasElement)
		const gear = entryNamed(canvasElement, SPACE_SETTINGS)
		await expect(slot).toHaveAttribute("data-slot", "app-rail-update")
		await expect(slot.nextElementSibling).toBe(settingsItem)
		await expect(settingsItem.contains(gear)).toBe(true)

		const badge = slot.firstElementChild as HTMLElement
		const badgeBox = badge.getBoundingClientRect()
		const gearBox = gear.getBoundingClientRect()
		await expect(badgeBox.left).toBe(gearBox.left)
		await expect(badgeBox.width).toBe(gearBox.width)
		await expect(badgeBox.height).toBe(gearBox.height)
		await expectListRowGapBetweenEntries(canvasElement)
	},
})

const boxesInGroup = (group: Element) =>
	Array.from(group.children)
		.filter((item) => item.checkVisibility())
		.map((item) =>
			(item.firstElementChild as HTMLElement).getBoundingClientRect(),
		)

const expectListRowGapBetweenEntries = async (canvasElement: HTMLElement) => {
	const listRowGap = Number.parseFloat(
		probedStyleOf(NAVIGATION_ROW_GAP, "rowGap"),
	)
	const groups = slotIn(canvasElement, "app-rail").querySelectorAll("ul")
	for (const group of groups) {
		const boxes = boxesInGroup(group)
		await expect(boxes.length).toBeGreaterThan(1)
		for (const [index, box] of boxes.slice(1).entries()) {
			await expect(box.top - boxes[index].bottom).toBe(listRowGap)
		}
	}
}

const verticalCentreOf = (box: DOMRect) => box.top + box.height / 2

const iconOf = (entry: HTMLElement) => {
	const icon = entry.querySelector("svg")
	if (!icon) throw new Error(`No icon in ${entry.getAttribute("aria-label")}`)
	return icon
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
	await expect(panelEntriesIn(canvasElement)).toEqual(
		PANELS.map((panel) => ENTRY_NAMES[panel]),
	)
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
	const gear = entryNamed(canvasElement, SPACE_SETTINGS)
	await expect(iconColourOf(gear)).toBe(iconColourOf(idle))
	for (const entry of [gear, entryNamed(canvasElement, READER.name)]) {
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
					"The column of icons down the left edge of the window: the two panels a reader moves between, Conversations then Missions, then the space settings gear and the reader at the foot. The rail draws and reports; which panel is open and the dot on each entry are props, and each entry reports its own press. An entry is a button named by its panel, the open one marked `aria-current`, and the news it carries is spoken in its name, so a dot never rides on colour alone.",
			},
		},
	},
	args: {
		selected: OPENING_PANEL,
		user: READER,
		onSelectConversations: fn(),
		onSelectMissions: fn(),
		onOpenSpaceSettings: fn(),
		onOpenYou: fn(),
	},
})

export const ConversationsSelected = meta.story({
	...selecting("conversations"),
	play: async ({ canvasElement }) => {
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
					"The rail as the app opens it, the current entry beside idle ones. Check the conversation bubble sits on the 10% fill in the foreground colour while Missions, the gear and the reader stay muted on no fill, that no other panel entry is drawn, and that the space settings gear and the reader's initial hold the foot of the rail.",
			},
		},
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
		await expectOnlySelected(canvasElement, "conversations")
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

export const SpaceSettingsGearHovered = meta.story({
	args: { dots: { settings: true } },
	parameters: {
		docs: {
			description: {
				story:
					"The gear at the foot of the rail under the pointer, carrying a dot. Check the tooltip reads Space settings, that the name spoken for the gear is Space settings followed by the news it carries, and that a press opens the space settings.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const gear = entryNamed(canvasElement, `${SPACE_SETTINGS}, new activity`)
		await userEvent.hover(gear)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			SPACE_SETTINGS,
		)
		await userEvent.click(gear)
		await expect(args.onOpenSpaceSettings).toHaveBeenCalledTimes(1)
		await expect(args.onOpenYou).not.toHaveBeenCalled()
	},
})

export const FirstTabLevelWithPanelTitle = meta.story({
	render: renderInSidebar("conversations"),
	parameters: {
		docs: {
			description: {
				story:
					"The rail beside the panel it opens, under the title bar. Check the first tab is centred on the panel title row within 1px and that the rail stays 52px wide under a 34px title bar.",
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
		const titleRow = within(slotIn(canvasElement, "sidebar-header"))
			.getByRole("heading", { name: ENTRY_NAMES.conversations })
			.parentElement?.getBoundingClientRect()
		if (!titleRow) throw new Error("No panel title row")
		await expect(
			Math.abs(verticalCentreOf(first) - verticalCentreOf(titleRow)),
		).toBeLessThanOrEqual(1)
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
					"Two entries with something new, the way the reference draws them. Check each dot is 8px, carries no number, flush with the top and trailing corner of its 36px entry and ringed 2px in the window ground, and that the entry's name says there is news.",
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

export const UpdateAvailable = meta.story({
	...updateBadgeIn("available"),
	parameters: {
		docs: {
			description: {
				story:
					"An update waiting to be downloaded, handed to the rail by the host. Check the badge is the first stop of the foot group, directly above the space settings gear, on the same column and in the same 36px square.",
			},
		},
	},
})

export const UpdateDownloading = meta.story({
	...updateBadgeIn("downloading"),
	parameters: {
		docs: {
			description: {
				story:
					"The update downloading, its ring filling around the badge. Check the ring holds the same 36px square as the gear under it and the rail does not shift while it fills.",
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
					"The update installed and waiting for a restart, the badge a single restart control with no panel. Check the badge keeps its place above the gear, on the same column and in the same 36px square.",
			},
		},
	},
})

export const UpdateAvailableDark = meta.story({
	...updateBadgeIn("available"),
	globals: { theme: "dark" },
})

export const UpdateIdle = meta.story({
	args: { updateBadge: <UpdateBadge status="idle" /> },
	parameters: {
		docs: {
			description: {
				story:
					"The state the app is in nearly all the time: the host hands the rail a badge that has nothing to show. Check the foot of the rail holds the gear and the reader only, with no gap held open above the gear.",
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
		const first = entryNamed(canvasElement, "Conversations")
		await expect(first).toHaveFocus()
		await expect(first).toHaveAttribute("type", "button")
		await expect(getComputedStyle(first).boxShadow).not.toBe("none")
		await userEvent.tab()
		const missions = entryNamed(canvasElement, "Missions")
		await expect(missions).toHaveFocus()
		await expect(iconStyleOf(missions)).toBe("stroke")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectMissions).toHaveBeenCalledTimes(1)
		for (const entry of railEntriesIn(canvasElement).slice(PANELS.length)) {
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

type TintedShellStyle = CSSProperties & { "--space-tint": string }

const TINTED_SHELL: TintedShellStyle = { "--space-tint": blotTint("blue") }

export const OnTintedSpace = meta.story({
	args: { dots: { conversations: "done", missions: "attention" } },
	render: (args: AppRailProps) => (
		<div
			className="surface-shell flex h-[32rem]"
			data-space-tint="blue"
			style={TINTED_SHELL}
		>
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
					"The rail as the app opens it in dark. Check the conversation bubble sits on the 12% fill in the foreground colour while Missions, the gear and the reader stay muted on no fill, and that hovering Missions draws half the current fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectCurrentBesideIdle(canvasElement)
		await expectHoverBetweenIdleAndCurrent(canvasElement)
	},
})
