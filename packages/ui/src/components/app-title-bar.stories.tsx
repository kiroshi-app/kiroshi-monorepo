import { type PointerEvent, Profiler, useRef, useState } from "react"
import {
	expect,
	fireEvent,
	fn,
	screen,
	spyOn,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	isInBrowserRunner,
	middleClick,
	realPointer,
	rightClick,
	settled,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	barIn,
	boxOf,
	isLifted,
	liftTo,
	middleOf,
	POINTER,
	pointAt,
	pointerAt,
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
	MIGRATION_QUESTION,
	NEW_TAB,
	ONBOARDING_COPY,
	PINNED_INBOX,
	PRICING_PAGE,
	RELEASE_NOTES,
	ROADMAP,
	STANDUP,
	SUPPORT_TRIAGE,
	WEEKLY_PLANNING,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationIcons, Icons } from "@workspace/ui/components/icons"
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"
import { WindowControls } from "@workspace/ui/components/window-controls"
import { SHELL_TITLE_BAR_HEIGHT } from "@workspace/ui/components/workspace-shell"

const TRAFFIC_LIGHTS_SLOT = 57

const BAR_START_PADDING = 14

const TAB_HEIGHT = 28

const TAB_WIDTH = 176

const TAB_FLOOR_WIDTH = 104

const ICON_SLOT = 16

const AVATAR_ICON = 16

const GLYPH_ICON = 15

const DARK = { theme: "dark" }

const meta = preview.meta({
	title: "Navigation/AppTitleBar",
	component: AppTitleBar,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The 40px strip across the top of the window shell: the window controls slot, Back and Forward, the tab row and the New tab button, the rest of the strip left to drag the window. Every tab comes from props and every gesture leaves through a callback, so the app owns the tab model, the history and the shortcuts. The Space switcher left the bar: the rail's Space logo opens the Spaces menu.",
			},
		},
	},
	args: {
		"data-tauri-drag-region": "deep",
		insetWindowControls: true,
		canGoBack: true,
		canGoForward: false,
		onSelectTab: fn(),
		onCloseTab: fn(),
		onPinTab: fn(),
		onUnpinTab: fn(),
		onCloseOtherTabs: fn(),
		onDuplicateTab: fn(),
		onReopenClosedTab: fn(),
		onMoveTabToNewWindow: fn(),
		onReorderTabs: fn(),
		onTearOffTab: fn(),
		onTearOffStart: fn(),
		onTearOffMove: fn(),
		onTearOffCancel: fn(),
		onIncomingTabIndexChange: fn(),
		onNewTab: fn(),
		onGoBack: fn(),
		onGoForward: fn(),
	},
	render: (args) => (
		<div className="surface-shell relative h-10 w-320">
			<AppTitleBar {...args} />
		</div>
	),
})

const titleOf = (tab: HTMLElement) =>
	tab.querySelector<HTMLElement>("span:last-child") ?? tab

const closeButtonsIn = (canvasElement: HTMLElement) =>
	within(barIn(canvasElement))
		.queryAllByRole("button")
		.filter((button) => button.dataset.slot === "title-bar-tab-close")

const openMenu = async () => settled(await screen.findByRole("menu"))

const dropAt = (handle: HTMLElement, clientX: number) => {
	fireEvent.pointerUp(handle, pointAt(clientX, handle))
	fireEvent.click(handle)
}

const shiftsIn = (root: HTMLElement) => [
	...root.querySelectorAll<HTMLElement>('[role="tab"][data-shift]'),
]

const nextFrames = async () => {
	await new Promise(requestAnimationFrame)
	await new Promise(requestAnimationFrame)
}

const rowGapIn = (bar: HTMLElement) =>
	Number.parseFloat(
		getComputedStyle(within(bar).getByRole("tablist")).columnGap,
	)

const offsetsOf = (tabs: HTMLElement[], resting: DOMRect[]) =>
	tabs.map((tab, rank) => Math.round(boxOf(tab).left - resting[rank].left))

const neighbourOffsetsOf = (
	zone: HTMLElement[],
	resting: DOMRect[],
	lifted: HTMLElement,
) => offsetsOf(zone, resting).filter((_, rank) => zone[rank] !== lifted)

const spaceBetween = (before: Element, after: Element) =>
	Math.round(boxOf(after).left - boxOf(before).right)

const chipIn = (canvasElement: HTMLElement) =>
	slotIn(barIn(canvasElement), "title-bar-overflow")

const iconSlotOf = (owner: HTMLElement) =>
	owner.querySelector<HTMLElement>('span[aria-hidden="true"]') ?? owner

const expectIconAtItsSize = async (owner: HTMLElement, tab: TitleBarTab) => {
	const slot = iconSlotOf(owner)
	await expect(boxOf(slot).width).toBe(ICON_SLOT)
	await expect(boxOf(slot).height).toBe(ICON_SLOT)
	const icon = slot.firstElementChild as Element
	const side = tab.id === COMPANION_TAB.id ? AVATAR_ICON : GLYPH_ICON
	await expect(boxOf(icon).width).toBe(side)
	await expect(boxOf(icon).height).toBe(side)
}

const tabsOutOfStrip = (canvasElement: HTMLElement, tabs: TitleBarTab[]) => {
	const inStrip = new Set(
		within(barIn(canvasElement))
			.getAllByRole("tab")
			.map((tab) => tab.getAttribute("aria-label") ?? tab.textContent),
	)
	return tabs.filter((tab) => !inStrip.has(tab.title))
}

const expectMenuUnderChip = async (menu: HTMLElement, chip: HTMLElement) => {
	await expect(boxOf(menu).width).toBe(290)
	await expect(boxOf(menu).right).toBeCloseTo(boxOf(chip).right, 0)
	await expect(boxOf(menu).top).toBeCloseTo(boxOf(chip).bottom + 4, 0)
}

const expectOverflowRows = async (menu: HTMLElement, tabs: TitleBarTab[]) => {
	const rows = within(menu).getAllByRole("menuitem")
	await expect(rows.map((row) => row.textContent)).toEqual(
		tabs.map((tab) => tab.title),
	)
	for (const [rank, tab] of tabs.entries()) {
		await expect(boxOf(rows[rank]).height).toBe(32)
		await expectIconAtItsSize(rows[rank], tab)
	}
}

const expectBarAnatomy = async (canvasElement: HTMLElement) => {
	const bar = barIn(canvasElement)
	const canvas = within(bar)
	const style = getComputedStyle(bar)
	await expect(boxOf(bar).height).toBe(SHELL_TITLE_BAR_HEIGHT)
	await expect(style.paddingInlineStart).toBe(`${BAR_START_PADDING}px`)
	await expect(style.paddingInlineEnd).toBe("8px")
	await expect(style.columnGap).toBe("8px")
	await expect(bar).toHaveAttribute("data-tauri-drag-region", "deep")

	const trafficLights = slotIn(bar, "app-title-bar-traffic-lights")
	const back = canvas.getByRole("button", { name: "Back" })
	const forward = canvas.getByRole("button", { name: "Forward" })
	const tablist = canvas.getByRole("tablist", { name: "Tabs" })
	const newTab = canvas.getByRole("button", { name: "New tab" })
	await expect(boxOf(trafficLights).width).toBe(TRAFFIC_LIGHTS_SLOT)
	await expect(boxOf(back).left).toBe(boxOf(trafficLights).right + 8)
	await expect(boxOf(forward).left).toBe(boxOf(back).right + 2)
	await expect(boxOf(tablist).left).toBe(boxOf(forward).right + 8)
	await expect(boxOf(newTab).left).toBeGreaterThan(boxOf(tablist).right)
	for (const control of [back, forward, newTab]) {
		await expect(boxOf(control).width).toBe(TAB_HEIGHT)
		await expect(boxOf(control).height).toBe(TAB_HEIGHT)
	}
	await expect(back).toBeEnabled()
	await expect(forward).toBeDisabled()
	await expect(
		boxOf(slotIn(bar, "title-bar-drag-region")).width,
	).toBeGreaterThanOrEqual(24)
}

const expectOneCloseOnTheActiveTab = async (canvasElement: HTMLElement) => {
	const bar = within(barIn(canvasElement))
	const selected = bar
		.getAllByRole("tab")
		.filter((tab) => tab.getAttribute("aria-selected") === "true")
	await expect(selected).toHaveLength(1)
	await expect(closeButtonsIn(canvasElement)).toHaveLength(1)
	const close = bar.getByRole("button", {
		name: `Close ${titleOf(selected[0]).textContent}`,
	})
	const tab = boxOf(selected[0])
	await expect(boxOf(close).width).toBe(18)
	await expect(boxOf(close).right).toBe(tab.right - 5)
	await expect(boxOf(close).left).toBeGreaterThan(tab.left)
}

const expectEqualTabs = async (canvasElement: HTMLElement, width: number) => {
	for (const tab of unpinnedTabsIn(canvasElement)) {
		await expect(boxOf(tab).width).toBe(width)
		await expect(boxOf(tab).height).toBe(TAB_HEIGHT)
	}
}

const A1 = {
	tabs: [RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const alphaOf = (color: string) => {
	const alpha = color.match(/\/\s*([\d.]+)(%?)\)$/)
	if (!alpha) throw new Error(`No alpha channel in ${color}`)
	return Number(alpha[1]) / (alpha[2] ? 100 : 1)
}

type TabLadderPlayContext = Pick<
	HoverPlayContext,
	"canvasElement" | "userEvent"
>

const playA1 = async ({ canvasElement, userEvent }: TabLadderPlayContext) => {
	await expectBarAnatomy(canvasElement)
	await expectOneCloseOnTheActiveTab(canvasElement)
	await expectEqualTabs(canvasElement, TAB_WIDTH)
	const [active, inactive] = unpinnedTabsIn(canvasElement)
	const selected = getComputedStyle(active).backgroundColor
	await expect(selected).toBe(
		tokenStyleIn(active, "bg-title-bar-tab-selected", "backgroundColor"),
	)
	const rest = skinOf(inactive)
	await expect(rest.backgroundColor).toBe(
		tokenStyleIn(inactive, "bg-title-bar-tab", "backgroundColor"),
	)
	await expect(rest.color).toBe(
		tokenStyleIn(inactive, "text-foreground", "color"),
	)

	await userEvent.hover(inactive)
	const hovered = skinOf(inactive)
	await expect(hovered.backgroundColor).toBe(
		tokenStyleIn(inactive, "bg-title-bar-tab-hover", "backgroundColor"),
	)
	await expect(hovered.color).toBe(rest.color)
	await userEvent.hover(active)
	await expect(getComputedStyle(active).backgroundColor).toBe(selected)
	await userEvent.unhover(active)

	const ladder = [rest.backgroundColor, hovered.backgroundColor, selected]
	await expect(new Set(ladder).size).toBe(ladder.length)
	const [restAlpha, hoverAlpha, selectedAlpha] = ladder.map(alphaOf)
	await expect(hoverAlpha).toBeGreaterThan(restAlpha)
	await expect(selectedAlpha).toBeGreaterThan(hoverAlpha)
}

export const A1Tabs = meta.story({
	args: A1,
	parameters: {
		docs: {
			description: {
				story:
					"A1, light: three tabs on macOS, the first one open, Back available and Forward not. Check the bar is 40px with 14px and 8px of inline padding, the 57px slot the traffic lights take, Back and Forward 28px squares 2px apart, then the tab row and New tab, every tab 176px by 28px, the open one on the selected fill with the only Close tab button 5px off its end. Check the fills climb from an 8% black at rest to 12% under the pointer and 16% on the open tab, hovered or not, every tab in the foreground colour. Pick `A1TabsDark` for the dark theme.",
			},
		},
	},
	play: playA1,
})

export const A1TabsDark = meta.story({
	args: A1,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A1, dark: the same three tabs on the dark ground. Check the inactive tabs sit on an 8% white fill, 12% under the pointer, and the open one on the 16% fill, every tab in the foreground colour. Pick `A1Tabs` for the light theme.",
			},
		},
	},
	play: playA1,
})

const A2 = {
	tabs: [
		RELEASE_NOTES,
		ONBOARDING_COPY,
		LOGIN_REDIRECT,
		WEEKLY_PLANNING,
		INVOICE_EXPORT,
	],
	activeTabId: LOGIN_REDIRECT.id,
} satisfies Partial<AppTitleBarProps>

const playA2 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const widths = unpinnedTabsIn(canvasElement).map((tab) => boxOf(tab).width)
	await expect(new Set(widths).size).toBe(1)
	await expectEqualTabs(canvasElement, TAB_WIDTH)
	const longTitle = titleOf(unpinnedTabsIn(canvasElement)[1])
	await expect(getComputedStyle(longTitle).textOverflow).toBe("ellipsis")
	await expect(getComputedStyle(longTitle).whiteSpace).toBe("nowrap")
	await expect(longTitle.scrollWidth).toBeGreaterThan(longTitle.clientWidth)
	await expectOneCloseOnTheActiveTab(canvasElement)
}

export const A2EqualWidthTabs = meta.story({
	args: A2,
	parameters: {
		docs: {
			description: {
				story:
					"A2, light: five tabs at 1280px, one title far longer than the others, the third tab open. Check every tab is the same 176px whatever its title, that the long title stops on an ellipsis on one line, and that the open tab in the middle still carries the only close. Pick `A3Overflow` for more tabs than the row holds.",
			},
		},
	},
	play: playA2,
})

export const A2EqualWidthTabsDark = meta.story({
	args: A2,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A2, dark: the five equal tabs on the dark ground. Pick `A2EqualWidthTabs` for the light theme.",
			},
		},
	},
	play: playA2,
})

const COMPANION_TAB: TitleBarTab = {
	id: "companion-ada",
	title: "Ada",
	icon: <BotIdentityAvatar name="Ada" seed="ada" size={AVATAR_ICON} />,
}

const ROCKET_TAB: TitleBarTab = {
	id: "launch-plan",
	title: "Launch plan",
	icon: <ConversationIcons.Rocket />,
}

const MISSION_TAB: TitleBarTab = {
	id: "mission-checkout",
	title: "Checkout flow",
	icon: <Icons.Missions />,
}

const SETTINGS_TAB: TitleBarTab = {
	id: "settings-general",
	title: "General",
	icon: <Icons.Settings />,
}

const ICON_KINDS = [COMPANION_TAB, ROCKET_TAB, MISSION_TAB, SETTINGS_TAB]

const A2_ICONS = {
	tabs: ICON_KINDS,
	activeTabId: COMPANION_TAB.id,
} satisfies Partial<AppTitleBarProps>

const playA2Icons = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement
}) => {
	const tabs = unpinnedTabsIn(canvasElement)
	await expect(tabs.map((tab) => tab.textContent)).toEqual(
		ICON_KINDS.map((tab) => tab.title),
	)
	for (const [rank, tab] of ICON_KINDS.entries()) {
		await expectIconAtItsSize(tabs[rank], tab)
	}
}

export const A2TabIconKinds = meta.story({
	args: A2_ICONS,
	parameters: {
		docs: {
			description: {
				story:
					"A2, light: one tab per icon kind, a companion, a conversation, a mission and Settings. Check each icon sits in a 16px slot, the companion's hexagon avatar at its full 16px and the Rocket, Flag and Settings glyphs at 15px. Pick `A2EqualWidthTabs` for tabs of one kind.",
			},
		},
	},
	play: playA2Icons,
})

export const A2TabIconKindsDark = meta.story({
	args: A2_ICONS,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A2, dark: the four icon kinds on the dark ground. Pick `A2TabIconKinds` for the light theme.",
			},
		},
	},
	play: playA2Icons,
})

const TWELVE_TABS = [
	RELEASE_NOTES,
	ONBOARDING_COPY,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	PRICING_PAGE,
	SUPPORT_TRIAGE,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
	ROADMAP,
	STANDUP,
]

const A3 = {
	tabs: TWELVE_TABS,
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const playA3 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	await expectEqualTabs(canvasElement, TAB_FLOOR_WIDTH)
	const overflowing = tabsOutOfStrip(canvasElement, TWELVE_TABS)
	await expect(overflowing.length).toBeGreaterThan(0)
	await expect(overflowing).toEqual(TWELVE_TABS.slice(-overflowing.length))
	const chip = chipIn(canvasElement)
	await expect(chip).toHaveAccessibleName(`${overflowing.length} more`)
	await expect(boxOf(chip).height).toBe(TAB_HEIGHT)
	const lastTab = unpinnedTabsIn(canvasElement).at(-1) as HTMLElement
	await expect(boxOf(chip).left).toBe(boxOf(lastTab).right + 4)
	await expect(
		boxOf(within(barIn(canvasElement)).getByRole("button", { name: "New tab" }))
			.left,
	).toBe(boxOf(chip).right + 4)

	chip.click()
	const menu = await openMenu()
	await expectMenuUnderChip(menu, chip)
	await expectOverflowRows(menu, overflowing)
}

export const A3Overflow = meta.story({
	args: A3,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A3, light: twelve tabs at 1280px, the strip keeping the tabs that fit at their 104px floor and moving the last ones to the overflow, the overflow list open. Check the kept tabs are all equal, that the chip after the last one counts the moved tabs, that New tab follows it, and that the 290px list, its end on the chip's end and 4px under it, names the moved tabs in tab order with their 15px icon and title on 32px rows. Pick `A2EqualWidthTabs` for a row that holds every tab.",
			},
		},
	},
	play: playA3,
})

export const A3OverflowDark = meta.story({
	args: A3,
	globals: DARK,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A3, dark: the overflow chip on a 10% white fill and its list on the raised dark menu. Pick `A3Overflow` for the light theme.",
			},
		},
	},
	play: playA3,
})

const A4 = {
	tabs: [PINNED_INBOX, RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const tabMenuRowsFor = (pinRow: string) => [
	pinRow,
	"New tab⌘T",
	"Duplicate tab",
	"Reopen last closed tab⌘⇧T",
	"Close tab⌘W",
	"Close other tabs⌘⌥W",
	"Move to new window",
]

const UNHINTED_TAB_MENU_ROWS = ["Duplicate tab", "Move to new window"]

const TAB_MENU_KEYSHORTCUTS = [
	"Control+Shift+P",
	"Meta+T",
	null,
	"Meta+Shift+T",
	"Meta+W",
	"Meta+Alt+W",
	null,
]

const expectTabMenu = async (menu: HTMLElement, pinRow: string) => {
	const rows = within(menu).getAllByRole("menuitem")
	await expect(rows.map((row) => row.textContent)).toEqual(
		tabMenuRowsFor(pinRow),
	)
	for (const row of rows) {
		await expect(
			row.querySelector('[data-slot="context-menu-shortcut"]') === null,
		).toBe(UNHINTED_TAB_MENU_ROWS.includes(row.textContent ?? ""))
		await expect(row.scrollWidth).toBe(row.clientWidth)
		await expect(row.firstElementChild?.tagName).toBe("svg")
		await expect(row.firstElementChild).toHaveAttribute("aria-hidden", "true")
	}
	await expect(
		new Set(rows.map((row) => row.firstElementChild?.innerHTML)).size,
	).toBe(rows.length)
	await expect(
		rows.map((row) => row.getAttribute("aria-keyshortcuts")),
	).toEqual(TAB_MENU_KEYSHORTCUTS)
	const [, , duplicate, reopen] = rows
	const [afterDuplicate, afterReopen] = within(menu).getAllByRole("separator")
	await expect(duplicate.nextElementSibling).toBe(afterDuplicate)
	await expect(reopen.nextElementSibling).toBe(afterReopen)
	await expect(reopen).toHaveAttribute("aria-disabled", "true")
}

const tabMenuRow = (menu: HTMLElement, label: string) =>
	within(menu).getByRole("menuitem", { name: label })

const playUnpinnedTabMenu = async ({
	canvasElement,
}: {
	canvasElement: HTMLElement
}) => {
	fireEvent.contextMenu(
		within(barIn(canvasElement)).getByRole("tab", {
			name: LOGIN_REDIRECT.title,
		}),
	)
	const menu = await openMenu()
	await expect(boxOf(menu).width).toBeGreaterThanOrEqual(220)
	await expectTabMenu(menu, "Pin tabCtrl⇧P")
	await expect(tabMenuRow(menu, "Close tab")).not.toHaveAttribute(
		"aria-disabled",
	)
}

export const UnpinnedTabMenu = meta.story({
	args: A4,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Light: the menu of an unpinned tab, opened with a right click, with no closed tab to bring back. Check it reads Pin tab, New tab, Duplicate tab, a separator, Reopen last closed tab, a separator, then Close tab, Close other tabs and Move to new window, that every row but Duplicate tab and Move to new window ends on its shortcut hint, and that Reopen last closed tab is greyed out while Close tab is live. Pick `UnpinnedTabMenuDark` for the dark theme, `A4PinnedTab` for the menu of a pinned tab.",
			},
		},
	},
	play: playUnpinnedTabMenu,
})

export const UnpinnedTabMenuDark = meta.story({
	args: A4,
	globals: DARK,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Dark: the menu of an unpinned tab on the raised dark menu, its hints in the muted grey. Pick `UnpinnedTabMenu` for the light theme.",
			},
		},
	},
	play: playUnpinnedTabMenu,
})

const expectRealHoverOnThePinnedTab = async (pinned: HTMLElement) => {
	const pointer = await realPointer()
	try {
		await pointer.hover(pinned)
		await waitFor(() => expect(pinned.matches(":hover")).toBe(true))
		await expect(getComputedStyle(pinned).backgroundColor).toBe(
			tokenStyleIn(pinned, "bg-title-bar-tab-hover", "backgroundColor"),
		)
	} finally {
		await pointer.unhover(pinned)
	}
}

const playA4 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const bar = barIn(canvasElement)
	const tablist = within(bar).getByRole("tablist")
	const pinned = slotIn(bar, "title-bar-pinned-tab")
	await expect(within(bar).getAllByRole("tab")[0]).toBe(pinned)
	await expect(pinned).toHaveAccessibleName(PINNED_INBOX.title)
	await expect(pinned).not.toHaveTextContent(PINNED_INBOX.title)
	await expect(boxOf(pinned).width).toBe(TAB_HEIGHT)
	await expect(boxOf(pinned).height).toBe(TAB_HEIGHT)
	await expect(boxOf(pinned).left).toBe(boxOf(tablist).left)
	await expect(getComputedStyle(pinned).backgroundColor).toBe(
		tokenStyleIn(pinned, "bg-title-bar-tab", "backgroundColor"),
	)
	await expect(getComputedStyle(pinned).color).toBe(
		tokenStyleIn(pinned, "text-foreground", "color"),
	)
	if (isInBrowserRunner()) await expectRealHoverOnThePinnedTab(pinned)
	const divider = slotIn(bar, "title-bar-pinned-divider")
	await expect(boxOf(divider).width).toBe(1)
	await expect(boxOf(divider).height).toBe(16)
	await expect(boxOf(divider).left).toBe(boxOf(pinned).right + 4)
	await expect(boxOf(unpinnedTabsIn(canvasElement)[0]).left).toBe(
		boxOf(divider).right + 4,
	)
	await expectOneCloseOnTheActiveTab(canvasElement)

	fireEvent.contextMenu(pinned)
	const menu = await openMenu()
	await expect(boxOf(menu).width).toBeGreaterThanOrEqual(220)
	await expectTabMenu(menu, "Unpin tabCtrl⇧P")
	await expect(tabMenuRow(menu, "Close tab")).toHaveAttribute(
		"aria-disabled",
		"true",
	)
}

export const A4PinnedTab = meta.story({
	args: A4,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A4, light: a pinned tab at the start of the row, its menu open. Check the pinned tab is a 28px icon-only square named by its title, on the 8% black rest fill and the 12% fill under the pointer, its icon in the foreground colour, followed by the 1px by 16px divider, that the unpinned tabs follow, and that its menu, at least 220px wide and wider when a row needs it, offers Unpin tab in place of Pin tab with Close tab greyed out, since a pinned tab does not close. Pick `A1Tabs` for a row with nothing pinned.",
			},
		},
	},
	play: playA4,
})

export const A4PinnedTabDark = meta.story({
	args: A4,
	globals: DARK,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A4, dark: the pinned tab on its 8% white fill in the foreground colour and the 12% white divider. Pick `A4PinnedTab` for the light theme.",
			},
		},
	},
	play: playA4,
})

const A5 = {
	tabs: [RELEASE_NOTES, MIGRATION_QUESTION, WEEKLY_PLANNING],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const playA5 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const bar = barIn(canvasElement)
	const tab = within(bar).getByRole("tab", { name: /^Database migration/ })
	await expect(tab).toHaveAccessibleName("Database migration, needs you")
	await expect(tab).toHaveAttribute("aria-selected", "false")
	const badge = slotIn(tab, "title-bar-tab-needs-you")
	await expect(boxOf(badge).width).toBe(13)
	await expect(boxOf(badge).height).toBe(13)
	await expect(getComputedStyle(badge).backgroundColor).toBe(
		tokenStyleIn(tab, "bg-warning", "backgroundColor"),
	)
	await expect(getComputedStyle(titleOf(tab)).color).toBe(
		tokenStyleIn(tab, "text-warning", "color"),
	)
	await expect(slotsIn(bar, "title-bar-tab-needs-you")).toHaveLength(1)
}

export const A5NeedsYou = meta.story({
	args: A5,
	parameters: {
		docs: {
			description: {
				story:
					"A5, light: an inactive tab whose companion asked a question. Check the 13px warning badge with its question mark sits after the icon, that the title takes the warning colour, that the name spoken for the tab ends on needs you, and that no other tab carries the badge. Pick `A1Tabs` for tabs nobody waits on.",
			},
		},
	},
	play: playA5,
})

export const A5NeedsYouDark = meta.story({
	args: A5,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A5, dark: the Needs you tab in the dark warning amber. Pick `A5NeedsYou` for the light theme.",
			},
		},
	},
	play: playA5,
})

const A6 = {
	tabs: [RELEASE_NOTES, LOGIN_REDIRECT, NEW_TAB],
	activeTabId: NEW_TAB.id,
} satisfies Partial<AppTitleBarProps>

const playA6 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	const bar = within(barIn(canvasElement))
	const active = bar.getByRole("tab", { selected: true })
	await expect(active).toHaveAccessibleName("New tab")
	await expect(active.querySelector("svg")).not.toBeNull()
	await expectOneCloseOnTheActiveTab(canvasElement)
}

export const A6EmptyTab = meta.story({
	args: A6,
	parameters: {
		docs: {
			description: {
				story:
					"A6, light: a tab just opened and still empty, open at the end of the row. Check it is titled New tab with the conversation icon, open, and the only one carrying Close tab. What fills the window under it is out of the bar. Pick `A1Tabs` for tabs holding a conversation.",
			},
		},
	},
	play: playA6,
})

export const A6EmptyTabDark = meta.story({
	args: A6,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A6, dark: the empty New tab on the dark ground. Pick `A6EmptyTab` for the light theme.",
			},
		},
	},
	play: playA6,
})

const PINNED_ROADMAP: TitleBarTab = { ...ROADMAP, isPinned: true }

const PINNED_STANDUP: TitleBarTab = { ...STANDUP, isPinned: true }

const LIFT_ROW = {
	tabs: [
		PINNED_INBOX,
		PINNED_ROADMAP,
		RELEASE_NOTES,
		LOGIN_REDIRECT,
		WEEKLY_PLANNING,
		INVOICE_EXPORT,
	],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

type DragPlayContext = {
	args: Partial<AppTitleBarProps>
	canvasElement: HTMLElement
}

const A7 = {
	...LIFT_ROW,
	activeTabId: WEEKLY_PLANNING.id,
} satisfies Partial<AppTitleBarProps>

const expectLiftedOnItsRow = async (
	bar: HTMLElement,
	lifted: HTMLElement,
	resting: DOMRect,
) => {
	await expect(isLifted(lifted)).toBe(true)
	await expect(boxOf(lifted).top).toBe(resting.top)
	await expect(getComputedStyle(lifted).backgroundColor).toBe(
		tokenStyleIn(bar, "bg-title-bar-menu", "backgroundColor"),
	)
}

const playA7DragWithinTabs = async ({
	args,
	canvasElement,
}: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const resting = [release, login, weekly, invoice].map(boxOf)
	const gap = rowGapIn(bar)
	const step = resting[1].width + gap
	const weeklyClose = within(bar).getByRole("button", {
		name: `Close ${WEEKLY_PLANNING.title}`,
	})
	const closeInset = boxOf(weekly).right - boxOf(weeklyClose).right
	const carriedTo = middleOf(login) + step

	liftTo(login, carriedTo)
	fireEvent.pointerMove(
		document.body,
		pointerAt(carriedTo, resting[1].bottom + 10),
	)

	await waitFor(() =>
		expect(
			neighbourOffsetsOf([release, login, weekly, invoice], resting, login),
		).toEqual([0, -step, 0]),
	)
	await expect(spaceBetween(weekly, invoice)).toBe(resting[1].width + 2 * gap)
	await expect(Math.round(boxOf(login).left - resting[1].left)).toBe(step)
	await expectLiftedOnItsRow(bar, login, resting[1])
	await expect(Math.round(boxOf(weekly).right - boxOf(weeklyClose).right)).toBe(
		Math.round(closeInset),
	)
	await expect(getComputedStyle(weekly).transitionProperty).toBe(
		matchMedia("(prefers-reduced-motion: reduce)").matches
			? "none"
			: "translate",
	)
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
}

export const A7DragWithinTabs = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"A7, light: Fix the login redirect lifted one slot right and held, the pointer drifted below the tab. Check the lifted tab rides the pointer on the row only, on the solid menu fill with a shadow under it, that Weekly planning slid one tab plus one gap toward the start with its close button, that Release notes and Invoice export kept their place, and that the empty gap left between Weekly planning and Invoice export is one tab plus two gaps wide. Pick `DragTabTwoRight` for the drop and the order it reports.",
			},
		},
	},
	play: playA7DragWithinTabs,
})

export const A7DragWithinTabsDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A7, dark: the lifted tab on the raised dark menu fill, Weekly planning slid aside. Pick `A7DragWithinTabs` for the light theme.",
			},
		},
	},
	play: playA7DragWithinTabs,
})

const A7_PINNED = {
	tabs: [
		PINNED_INBOX,
		PINNED_ROADMAP,
		PINNED_STANDUP,
		RELEASE_NOTES,
		LOGIN_REDIRECT,
		WEEKLY_PLANNING,
	],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const playA7DragWithinPinnedTabs = async ({
	args,
	canvasElement,
}: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const [inbox, roadmap, standup] = slotsIn(bar, "title-bar-pinned-tab")
	const unpinned = unpinnedTabsIn(canvasElement)
	const resting = [inbox, roadmap, standup].map(boxOf)
	const unpinnedResting = unpinned.map(boxOf)
	const gap = rowGapIn(bar)
	const step = resting[0].width + gap

	liftTo(inbox, middleOf(inbox) + step)

	await waitFor(() =>
		expect(
			neighbourOffsetsOf([inbox, roadmap, standup], resting, inbox),
		).toEqual([-step, 0]),
	)
	await expect(spaceBetween(roadmap, standup)).toBe(resting[0].width + 2 * gap)
	await expect(offsetsOf(unpinned, unpinnedResting)).toEqual(
		unpinned.map(() => 0),
	)
	await expectLiftedOnItsRow(bar, inbox, resting[0])
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
}

export const A7DragWithinPinnedTabs = meta.story({
	args: A7_PINNED,
	parameters: {
		docs: {
			description: {
				story:
					"A7, light: the pinned Inbox lifted one slot right and held. Check Roadmap slid one pinned tab plus one gap toward the start, Standup and every unpinned tab kept their place, and the empty gap between Roadmap and Standup is one pinned tab plus two gaps wide.",
			},
		},
	},
	play: playA7DragWithinPinnedTabs,
})

export const A7DragWithinPinnedTabsDark = meta.story({
	args: A7_PINNED,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A7, dark: a pinned tab lifted inside the pinned zone. Pick `A7DragWithinPinnedTabs` for the light theme.",
			},
		},
	},
	play: playA7DragWithinPinnedTabs,
})

const playA7DragAtTheDivider = async ({
	args,
	canvasElement,
}: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const divider = slotIn(bar, "title-bar-pinned-divider")
	const pinned = slotsIn(bar, "title-bar-pinned-tab")
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const resting = [release, login, weekly, invoice].map(boxOf)
	const pinnedResting = pinned.map(boxOf)
	const gap = rowGapIn(bar)
	const step = resting[1].width + gap

	liftTo(login, middleOf(pinned[0]))

	await waitFor(() =>
		expect(
			neighbourOffsetsOf([release, login, weekly, invoice], resting, login),
		).toEqual([step, 0, 0]),
	)
	await expect(spaceBetween(divider, release)).toBe(resting[1].width + 2 * gap)
	await expect(Math.round(boxOf(login).left)).toBe(Math.round(resting[0].left))
	await expect(boxOf(login).left).toBeGreaterThan(boxOf(divider).right)
	await expect(offsetsOf(pinned, pinnedResting)).toEqual(pinned.map(() => 0))
	await expectLiftedOnItsRow(bar, login, resting[1])
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
}

export const A7DragAtTheDivider = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"A7, light: Fix the login redirect carried over the pinned tabs and held. Check it stops at the first unpinned slot, after the divider, that Release notes slid one tab plus one gap toward the end, that the pinned tabs and the other unpinned tabs kept their place, and that the empty gap between the divider and Release notes is one tab plus two gaps wide.",
			},
		},
	},
	play: playA7DragAtTheDivider,
})

export const A7DragAtTheDividerDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A7, dark: an unpinned tab held against the divider. Pick `A7DragAtTheDivider` for the light theme.",
			},
		},
	},
	play: playA7DragAtTheDivider,
})

const playA7TornOffTab = async ({ args, canvasElement }: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const resting = [release, login, weekly, invoice].map(boxOf)
	const gap = rowGapIn(bar)
	const step = resting[1].width + gap
	const carriedTo = middleOf(login) + step

	liftTo(login, carriedTo)
	await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly]))
	fireEvent.pointerMove(
		document.body,
		pointerAt(carriedTo, boxOf(bar).bottom + 60),
	)

	await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
	await waitFor(() =>
		expect(
			neighbourOffsetsOf([release, login, weekly, invoice], resting, login),
		).toEqual([0, -step, -step]),
	)
	await expect(spaceBetween(release, weekly)).toBe(gap)
	await expect(isLifted(login)).toBe(true)
	await expect(login).toHaveAttribute("data-torn-off")
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
	await expect(args.onTearOffTab).not.toHaveBeenCalled()
}

export const A7TornOffTab = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"A7, light: Fix the login redirect lifted one slot right, then carried well below the bar and held. Check it left the row and Weekly planning and Invoice export slid one tab plus one gap toward the start, so no empty slot is left. Pick `TearOffReportsTheTab` for the release.",
			},
		},
	},
	play: playA7TornOffTab,
})

export const A7TornOffTabDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A7, dark: a tab torn off the strip, the gap it left closed. Pick `A7TornOffTab` for the light theme.",
			},
		},
	},
	play: playA7TornOffTab,
})

const screenPointerAt = (
	clientX: number,
	clientY: number,
	screenX: number,
	screenY: number,
) => ({ ...pointerAt(clientX, clientY), screenX, screenY })

const isStillUnderReducedMotion = () =>
	matchMedia("(prefers-reduced-motion: reduce)").matches

const expectSlideWithoutColour = async (tabs: HTMLElement[]) => {
	for (const tab of tabs) {
		const style = getComputedStyle(tab)
		const isInstant = style.transitionDuration
			.split(", ")
			.every((duration) => duration === "0s")
		await expect(
			isInstant || ["none", "translate"].includes(style.transitionProperty),
		).toBe(true)
	}
}

const expectSlidingUnlessReduced = async (tab: HTMLElement) =>
	expect(getComputedStyle(tab).transitionProperty).toBe(
		isStillUnderReducedMotion() ? "none" : "translate",
	)

const carryOffTheBar = (
	bar: HTMLElement,
	tab: HTMLElement,
	screenX: number,
	screenY: number,
) => {
	liftTo(tab, middleOf(tab))
	fireEvent.pointerMove(
		document.body,
		screenPointerAt(middleOf(tab), boxOf(bar).bottom + 60, screenX, screenY),
	)
}

const playT13GapClosed = async ({ args, canvasElement }: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const zone = [release, login, weekly, invoice]
	const resting = zone.map(boxOf)
	const gap = rowGapIn(bar)
	const step = resting[1].width + gap

	carryOffTheBar(bar, login, 640, 420)

	await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
	await waitFor(() =>
		expect(neighbourOffsetsOf(zone, resting, login)).toEqual([0, -step, -step]),
	)
	await expect(gap).toBe(4)
	await expect(spaceBetween(release, weekly)).toBe(gap)
	await expect(spaceBetween(weekly, invoice)).toBe(gap)
	await expect(login).toHaveAttribute("data-torn-off")
	await expect(getComputedStyle(login).opacity).toBe("0")
	await expectSlidingUnlessReduced(weekly)
	await expectSlideWithoutColour(zone)
	await expect(args.onTearOffStart).toHaveBeenCalledOnce()
	await expect(args.onTearOffStart).toHaveBeenCalledWith({
		tabId: LOGIN_REDIRECT.id,
		screenX: 640,
		screenY: 420,
	})

	fireEvent.pointerMove(
		document.body,
		screenPointerAt(middleOf(release), boxOf(bar).bottom + 90, 520, 450),
	)
	fireEvent.pointerMove(
		document.body,
		screenPointerAt(middleOf(invoice), boxOf(bar).bottom + 120, 700, 480),
	)
	await expect(args.onTearOffMove).toHaveBeenCalledTimes(2)
	await expect(args.onTearOffMove).toHaveBeenNthCalledWith(1, {
		tabId: LOGIN_REDIRECT.id,
		screenX: 520,
		screenY: 450,
	})
	await expect(args.onTearOffMove).toHaveBeenLastCalledWith({
		tabId: LOGIN_REDIRECT.id,
		screenX: 700,
		screenY: 480,
	})
	await expect(args.onTearOffStart).toHaveBeenCalledOnce()
	await expect(shiftsIn(bar)).toEqual([weekly, invoice])
	await expect(args.onTearOffCancel).not.toHaveBeenCalled()
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
	await expect(args.onTearOffTab).not.toHaveBeenCalled()
}

export const T13GapClosed = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"1.3, light: Fix the login redirect carried past the tear-off threshold and held. Check it left the row, Weekly planning and Invoice export closed its gap at the 4px rest gap with no empty slot, the tear-off start reported once with the tab and the screen point, and every move after it reported with its screen point. The app shows the thumbnail from this step on.",
			},
		},
	},
	play: playT13GapClosed,
})

export const T13GapClosedDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"1.3, dark: a tab past the threshold, its gap closed. Pick `T13GapClosed` for the light theme.",
			},
		},
	},
	play: playT13GapClosed,
})

const expectRowAtRest = async (
	canvasElement: HTMLElement,
	zone: HTMLElement[],
	resting: DOMRect[],
) => {
	await waitFor(() => expect(shiftsIn(barIn(canvasElement))).toEqual([]))
	await waitFor(() =>
		expect(offsetsOf(zone, resting)).toEqual(zone.map(() => 0)),
	)
	await expect(unpinnedTabsIn(canvasElement)).toEqual(zone)
}

const playT16BackInTheRow = async ({
	args,
	canvasElement,
	userEvent,
}: KeyboardPlayContext) => {
	const bar = barIn(canvasElement)
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const zone = [release, login, weekly, invoice]
	const resting = zone.map(boxOf)

	carryOffTheBar(bar, login, 640, 420)
	await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
	fireEvent.pointerMove(
		document.body,
		pointerAt(middleOf(login), resting[1].top + 14),
	)

	await expectRowAtRest(canvasElement, zone, resting)
	await expect(isLifted(login)).toBe(true)
	await expect(login).not.toHaveAttribute("data-torn-off")
	await expect(getComputedStyle(login).opacity).toBe("1")
	await expect(args.onTearOffCancel).toHaveBeenCalledOnce()
	await expect(args.onTearOffCancel).toHaveBeenCalledWith(LOGIN_REDIRECT.id)

	fireEvent.pointerMove(
		document.body,
		screenPointerAt(middleOf(login), boxOf(bar).bottom + 60, 640, 420),
	)
	await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
	await userEvent.keyboard("{Escape}")

	await expectRowAtRest(canvasElement, zone, resting)
	await expect(isLifted(login)).toBe(false)
	await expect(login).not.toHaveAttribute("data-torn-off")
	await expect(args.onTearOffStart).toHaveBeenCalledTimes(2)
	await expect(args.onTearOffCancel).toHaveBeenCalledTimes(2)
	await expect(args.onTearOffCancel).toHaveBeenLastCalledWith(LOGIN_REDIRECT.id)
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
	await expect(args.onTearOffTab).not.toHaveBeenCalled()
}

export const T16BackInTheRow = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"1.6, light: Fix the login redirect torn off, carried back over the strip, torn off again, then Escape. Check that back inside the threshold it is in its slot again with the row at rest and the cancel reported with the tab, and that Escape drops the lift, leaves it at its origin index with the row at rest and reports the cancel again, with no order and no tear-off.",
			},
		},
	},
	play: playT16BackInTheRow,
})

export const T16BackInTheRowDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"1.6, dark: a torn-off tab back in its slot. Pick `T16BackInTheRow` for the light theme.",
			},
		},
	},
	play: playT16BackInTheRow,
})

const playRefusedTearOff = async ({ args, canvasElement }: DragPlayContext) => {
	const bar = barIn(canvasElement)
	const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
	const zone = [release, login, weekly, invoice]
	const resting = zone.map(boxOf)
	const step = resting[1].width + rowGapIn(bar)
	const offBar = boxOf(bar).bottom + 60

	carryOffTheBar(bar, login, 640, 420)
	await waitFor(() =>
		expect(neighbourOffsetsOf(zone, resting, login)).toEqual([0, -step, -step]),
	)
	fireEvent.pointerUp(
		document.body,
		screenPointerAt(middleOf(login), offBar, 640, 420),
	)

	await expect(args.onTearOffTab).toHaveBeenCalledOnce()
	await waitFor(() => expect(isLifted(login)).toBe(false))
	const snap = getComputedStyle(login)
	for (const tab of [release, weekly, invoice]) {
		const settle = getComputedStyle(tab)
		await expect(settle.transitionProperty).toBe(snap.transitionProperty)
		await expect(settle.transitionDuration).toBe(snap.transitionDuration)
		await expect(settle.transitionTimingFunction).toBe(
			snap.transitionTimingFunction,
		)
	}
	await expectSlidingUnlessReduced(weekly)
	await expectSlideWithoutColour(zone)
	await expectRowAtRest(canvasElement, zone, resting)
	await expect(Math.round(boxOf(login).left)).toBe(Math.round(resting[1].left))
	await expect(login).not.toHaveAttribute("data-torn-off")
	await expect(getComputedStyle(login).opacity).toBe("1")
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
	await expect(args.onTearOffCancel).not.toHaveBeenCalled()
}

export const RefusedTearOffBackAtRest = meta.story({
	args: A7,
	parameters: {
		docs: {
			description: {
				story:
					"A tear-off drop the app refuses, light: Fix the login redirect carried past the threshold, its gap closed, then released off the bar while the handler does not take it. Check every tab slides back to rest with the same settle as the dropped tab, Fix the login redirect back in its slot, and no order or cancel reported.",
			},
		},
	},
	play: playRefusedTearOff,
})

export const RefusedTearOffBackAtRestDark = meta.story({
	args: A7,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A refused tear-off drop, dark: every tab back at rest. Pick `RefusedTearOffBackAtRest` for the light theme.",
			},
		},
	},
	play: playRefusedTearOff,
})

type ReceivingTitleBarProps = AppTitleBarProps & {
	incoming: TitleBarTab
}

const isOverTheStrip = (event: PointerEvent<HTMLElement>) =>
	event.clientY <= event.currentTarget.getBoundingClientRect().bottom

const ReceivingTitleBar = ({ incoming, ...args }: ReceivingTitleBarProps) => {
	const [tabs, setTabs] = useState(args.tabs ?? [])
	const [activeTabId, setActiveTabId] = useState(args.activeTabId)
	const [hoverX, setHoverX] = useState<number | null>(null)
	const insertionIndex = useRef(0)
	return (
		<div
			className="surface-shell relative h-10 w-320"
			data-slot="receiving-window"
			onPointerMove={(event) =>
				setHoverX(isOverTheStrip(event) ? event.clientX : null)
			}
			onPointerUp={() => {
				if (hoverX === null) return
				setTabs(tabs.toSpliced(insertionIndex.current, 0, incoming))
				setActiveTabId(incoming.id)
				setHoverX(null)
			}}
		>
			<AppTitleBar
				{...args}
				activeTabId={activeTabId}
				incomingTab={
					hoverX === null ? undefined : { tab: incoming, clientX: hoverX }
				}
				onCloseTab={(id) => {
					args.onCloseTab?.(id)
					setTabs(tabs.filter((tab) => tab.id !== id))
				}}
				onIncomingTabIndexChange={(index) => {
					insertionIndex.current = index
					args.onIncomingTabIndexChange?.(index)
				}}
				tabs={tabs}
			/>
		</div>
	)
}

const RECEIVING = {
	tabs: [
		PINNED_INBOX,
		RELEASE_NOTES,
		LOGIN_REDIRECT,
		WEEKLY_PLANNING,
		INVOICE_EXPORT,
	],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

const RECEIVING_THE_LAST_TAB = {
	tabs: [WEEKLY_PLANNING, INVOICE_EXPORT, SUPPORT_TRIAGE],
	activeTabId: WEEKLY_PLANNING.id,
} satisfies Partial<AppTitleBarProps>

type ReceivingPlayContext = {
	args: Partial<ReceivingTitleBarProps>
	canvasElement: HTMLElement
}

const hoverTheStrip = (canvasElement: HTMLElement, clientX: number) => {
	const receiving = slotIn(canvasElement, "receiving-window")
	fireEvent.pointerMove(
		receiving,
		pointerAt(clientX, boxOf(receiving).top + 20),
	)
	return receiving
}

const incomingTabIn = (canvasElement: HTMLElement) =>
	barIn(canvasElement).querySelector<HTMLElement>(
		'[data-slot="title-bar-incoming-tab"]',
	)

const expectPartedAt = async (
	canvasElement: HTMLElement,
	zone: HTMLElement[],
	resting: DOMRect[],
	at: number,
) => {
	const bar = barIn(canvasElement)
	const step = TAB_WIDTH + rowGapIn(bar)
	await expect(step).toBe(180)
	await waitFor(() =>
		expect(offsetsOf(zone, resting)).toEqual(
			zone.map((_, rank) => (rank >= at ? step : 0)),
		),
	)
	await expect(shiftsIn(bar)).toEqual(zone.slice(at))
	const incoming = incomingTabIn(canvasElement)
	await expect(incoming).not.toBeNull()
	const box = boxOf(incoming as HTMLElement)
	await expect([box.width, box.height]).toEqual([TAB_WIDTH, TAB_HEIGHT])
	await expect(Math.round(box.left)).toBe(Math.round(resting[at].left))
	await expect(box.top).toBe(resting[0].top)
	await expect(getComputedStyle(incoming as HTMLElement).backgroundColor).toBe(
		tokenStyleIn(bar, "bg-title-bar-menu", "backgroundColor"),
	)
	await expect(incoming?.querySelectorAll("svg")).toHaveLength(2)
	if (zone[at]) await expectSlidingUnlessReduced(zone[at])
	await expectSlideWithoutColour(zone)
}

const playTabsPartedAt =
	(at: number, inTabs: number) =>
	async ({ args, canvasElement }: ReceivingPlayContext) => {
		const zone = unpinnedTabsIn(canvasElement)
		const resting = zone.map(boxOf)

		hoverTheStrip(canvasElement, resting[at].left + 20)

		await expectPartedAt(canvasElement, zone, resting, at)
		await expect(args.onIncomingTabIndexChange).toHaveBeenLastCalledWith(inTabs)
	}

export const T22TabsParted = meta.story({
	args: RECEIVING,
	render: (args) => <ReceivingTitleBar {...args} incoming={PRICING_PAGE} />,
	parameters: {
		docs: {
			description: {
				story:
					"2.2, light: Pricing page dragged in from another window, held over the strip at Fix the login redirect. Check every tab from Fix the login redirect on sits one tab plus one gap further, 180px, Pricing page drawn in the gap as the lifted tab, 176 by 28 with its close glyph, and the insertion index reported in the full tab order.",
			},
		},
	},
	play: playTabsPartedAt(1, 2),
})

export const T22TabsPartedDark = meta.story({
	args: RECEIVING,
	globals: DARK,
	render: (args) => <ReceivingTitleBar {...args} incoming={PRICING_PAGE} />,
	parameters: {
		docs: {
			description: {
				story:
					"2.2, dark: the strip parted for an incoming tab. Pick `T22TabsParted` for the light theme.",
			},
		},
	},
	play: playTabsPartedAt(1, 2),
})

const playT23Inserted = async ({
	args,
	canvasElement,
}: ReceivingPlayContext) => {
	const bar = barIn(canvasElement)
	const zone = unpinnedTabsIn(canvasElement)
	const resting = zone.map(boxOf)

	hoverTheStrip(canvasElement, resting[1].left + 20)
	await expectPartedAt(canvasElement, zone, resting, 1)
	fireEvent.pointerMove(
		slotIn(canvasElement, "receiving-window"),
		pointerAt(resting[1].left + 20, boxOf(bar).bottom + 40),
	)
	await waitFor(() => expect(incomingTabIn(canvasElement)).toBeNull())
	await expect(shiftsIn(bar)).toEqual([])
	await expect(offsetsOf(zone, resting)).toEqual(zone.map(() => 0))

	const receiving = hoverTheStrip(canvasElement, resting[1].left + 20)
	await expectPartedAt(canvasElement, zone, resting, 1)
	fireEvent.pointerUp(
		receiving,
		pointerAt(resting[1].left + 20, resting[0].top),
	)

	const inserted = await waitFor(() =>
		within(bar).getByRole("tab", { name: PRICING_PAGE.title }),
	)
	const after = unpinnedTabsIn(canvasElement)
	await expect(after).toEqual([zone[0], inserted, ...zone.slice(1)])
	await expect(inserted).toHaveAttribute("aria-selected", "true")
	await expect(incomingTabIn(canvasElement)).toBeNull()
	await expect(shiftsIn(bar)).toEqual([])
	for (const tab of after)
		await expect(getComputedStyle(tab).translate).toBe("none")
	await expect(Math.round(boxOf(inserted).left)).toBe(
		Math.round(resting[1].left),
	)
	await expect(offsetsOf(zone.slice(1), resting.slice(1))).toEqual(
		zone.slice(1).map(() => 180),
	)
	await expect(args.onIncomingTabIndexChange).toHaveBeenLastCalledWith(2)
}

export const T23Inserted = meta.story({
	args: RECEIVING,
	render: (args) => <ReceivingTitleBar {...args} incoming={PRICING_PAGE} />,
	parameters: {
		docs: {
			description: {
				story:
					"2.3, light: Pricing page held over the strip, carried off it, held again, then dropped. Check the tabs return to rest when the hover clears, and that the drop leaves Pricing page at the index it parted, selected, every tab in place with no offset.",
			},
		},
	},
	play: playT23Inserted,
})

export const T23InsertedDark = meta.story({
	args: RECEIVING,
	globals: DARK,
	render: (args) => <ReceivingTitleBar {...args} incoming={PRICING_PAGE} />,
	parameters: {
		docs: {
			description: {
				story:
					"2.3, dark: an incoming tab committed at its index. Pick `T23Inserted` for the light theme.",
			},
		},
	},
	play: playT23Inserted,
})

export const T43LastTabParted = meta.story({
	args: RECEIVING_THE_LAST_TAB,
	render: (args) => <ReceivingTitleBar {...args} incoming={DESIGN_REVIEW} />,
	parameters: {
		docs: {
			description: {
				story:
					"4.3, light: the last tab of another window, Design review, held over the start of this strip. Check every tab sits 180px further, Design review drawn as the lifted tab in the gap at the first slot, and index 0 reported.",
			},
		},
	},
	play: playTabsPartedAt(0, 0),
})

export const T43LastTabPartedDark = meta.story({
	args: RECEIVING_THE_LAST_TAB,
	globals: DARK,
	render: (args) => <ReceivingTitleBar {...args} incoming={DESIGN_REVIEW} />,
	parameters: {
		docs: {
			description: {
				story:
					"4.3, dark: the strip parted at its start for another window's last tab. Pick `T43LastTabParted` for the light theme.",
			},
		},
	},
	play: playTabsPartedAt(0, 0),
})

const SHRUNK_TABS = [
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	SUPPORT_TRIAGE,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
]

const expectGapUnder = async (canvasElement: HTMLElement, x: number) => {
	const bar = barIn(canvasElement)
	const gap = rowGapIn(bar)
	await waitFor(() => {
		const incoming = incomingTabIn(canvasElement)
		expect(incoming).not.toBeNull()
		const box = boxOf(incoming as HTMLElement)
		const tabs = unpinnedTabsIn(canvasElement)
		const [first] = shiftsIn(bar)
		const previous = tabs[tabs.indexOf(first) - 1]
		expect(Math.abs(box.width - boxOf(tabs[0]).width)).toBeLessThan(1)
		expect(Math.abs(boxOf(first).left - box.right - gap)).toBeLessThanOrEqual(1)
		if (previous)
			expect(
				Math.abs(box.left - boxOf(previous).right - gap),
			).toBeLessThanOrEqual(1)
		expect(x).toBeGreaterThanOrEqual(box.left - (box.width + gap) / 2)
		expect(x).toBeLessThanOrEqual(box.right)
	})
}

export const IncomingTabFollowsTheStrip = meta.story({
	tags: ["test-only"],
	args: { tabs: SHRUNK_TABS, activeTabId: RELEASE_NOTES.id },
	render: (args) => <ReceivingTitleBar {...args} incoming={ROADMAP} />,
	parameters: {
		docs: {
			description: {
				story:
					"An incoming tab held over a strip of shrunk tabs while one of them closes. Check the gap opens under the pointer at the width of the tabs, and that once the tabs widen it is measured again, still under the pointer and as wide as the tabs.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = barIn(canvasElement)
		const resting = unpinnedTabsIn(canvasElement).map(boxOf)
		const x = resting[3].left + 10
		await expect(resting[0].width).toBeLessThan(TAB_WIDTH)

		hoverTheStrip(canvasElement, x)
		await expectGapUnder(canvasElement, x)

		fireEvent.click(
			within(bar).getByRole("button", {
				name: `Close ${RELEASE_NOTES.title}`,
			}),
		)
		await waitFor(() => expect(unpinnedTabsIn(canvasElement)).toHaveLength(7))
		await expect(boxOf(unpinnedTabsIn(canvasElement)[0]).width).toBeGreaterThan(
			resting[0].width,
		)
		await expectGapUnder(canvasElement, x)
	},
})

export const WithWindowControls = meta.story({
	args: {
		...A1,
		insetWindowControls: false,
		windowControls: (
			<WindowControls
				maximized={false}
				onClose={fn()}
				onMinimize={fn()}
				onToggleMaximize={fn()}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Windows, where the app draws its own caption buttons. Check they sit flush with the trailing end of the bar and as tall as it, that no traffic lights slot is held, and that Back takes the 14px leading padding. Pick `A1Tabs` for macOS.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = barIn(canvasElement)
		const controls = boxOf(slotIn(bar, "app-title-bar-window-controls"))
		await expect(controls.right).toBe(boxOf(bar).right)
		await expect(controls.height).toBe(SHELL_TITLE_BAR_HEIGHT)
		await expect(
			bar.querySelector('[data-slot="app-title-bar-traffic-lights"]'),
		).toBeNull()
		await expect(
			boxOf(within(bar).getByRole("button", { name: "Back" })).left,
		).toBe(boxOf(bar).left + BAR_START_PADDING)
	},
})

const INACTIVE_TAB_HOVER = {
	tabs: [PINNED_INBOX, RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING],
	activeTabId: RELEASE_NOTES.id,
} satisfies Partial<AppTitleBarProps>

type HoverPlayContext = {
	args: Partial<AppTitleBarProps>
	canvasElement: HTMLElement
	userEvent: {
		click: (element: Element) => Promise<void>
		hover: (element: Element) => Promise<void>
		unhover: (element: Element) => Promise<void>
		keyboard: (text: string) => Promise<void>
		tab: (options?: { shift?: boolean }) => Promise<void>
	}
}

const skinOf = (element: Element) => {
	const { backgroundColor, color } = getComputedStyle(element)
	return { backgroundColor, color }
}

const paintedOver = (ground: string, ...fills: string[]) => {
	const context = document.createElement("canvas").getContext("2d")
	if (!context) throw new Error("No 2D canvas to composite the fills")
	for (const fill of [ground, ...fills]) {
		context.fillStyle = fill
		context.fillRect(0, 0, 1, 1)
	}
	return context.getImageData(0, 0, 1, 1).data.join()
}

const expectRealHoverOnTheCross = async (
	canvasElement: HTMLElement,
	tab: HTMLElement,
	close: HTMLElement,
) => {
	const pointer = await realPointer()
	try {
		await pointer.hover(tab)
		await waitFor(() => expect(tab.matches(":hover")).toBe(true))
		const onTab = skinOf(tab)
		await pointer.hover(close)
		await waitFor(() => expect(close.matches(":hover")).toBe(true))
		await expect(tab.matches(":hover")).toBe(false)
		await expect(skinOf(tab)).toEqual(onTab)
		const square = getComputedStyle(close).backgroundColor
		await expect(square).toBe(
			tokenStyleIn(close, "bg-title-bar-highlight", "backgroundColor"),
		)
		const ground = getComputedStyle(
			barIn(canvasElement).parentElement ?? canvasElement,
		).backgroundColor
		await expect(paintedOver(ground, onTab.backgroundColor, square)).not.toBe(
			paintedOver(ground, onTab.backgroundColor),
		)
	} finally {
		await pointer.unhover(close)
	}
}

const playInactiveTabHover = async ({
	args,
	canvasElement,
	userEvent,
}: HoverPlayContext) => {
	const bar = within(barIn(canvasElement))
	const active = bar.getByRole("tab", { name: RELEASE_NOTES.title })
	const login = bar.getByRole("tab", { name: LOGIN_REDIRECT.title })
	const restingTab = boxOf(login)
	const restingTitle = boxOf(titleOf(login))
	const [activeClose, close] = slotsIn(
		barIn(canvasElement),
		"title-bar-tab-close",
	)
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose])

	await userEvent.hover(bar.getByRole("tab", { name: PINNED_INBOX.title }))
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose])

	active.focus()
	await userEvent.tab()
	await expect(activeClose).toHaveFocus()
	await userEvent.tab({ shift: true })
	await expect(active).toHaveFocus()
	await userEvent.keyboard("{ArrowRight}")
	await expect(login).toHaveFocus()
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])

	const weekly = bar.getByRole("tab", { name: WEEKLY_PLANNING.title })
	await userEvent.hover(weekly)
	const revealed = closeButtonsIn(canvasElement)
	await expect(revealed).toHaveLength(3)
	const ownNames = [RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING].map(
		({ title }) => `Close ${title}`,
	)
	await expect(
		ownNames.map((name) => bar.getByRole("button", { name })),
	).toEqual(revealed)
	await expect(
		new Set(revealed.map((cross) => cross.getAttribute("aria-label"))).size,
	).toBe(3)
	await userEvent.unhover(weekly)
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])
	await userEvent.tab()
	await expect(close).toHaveFocus()
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])
	await userEvent.tab({ shift: true })
	await expect(login).toHaveFocus()
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])
	login.blur()
	await waitFor(() =>
		expect(closeButtonsIn(canvasElement)).toEqual([activeClose]),
	)

	const resting = skinOf(login)
	await userEvent.hover(login)
	const pointerOnTab = skinOf(login)
	await expect(pointerOnTab.backgroundColor).toBe(
		tokenStyleIn(login, "bg-title-bar-tab-hover", "backgroundColor"),
	)
	await expect(pointerOnTab.color).toBe(
		tokenStyleIn(login, "text-foreground", "color"),
	)
	await expect(pointerOnTab).not.toEqual(resting)
	await expect(getComputedStyle(login).transitionDuration).toBe("0s")
	await expect(close).toBeVisible()
	await expect(boxOf(close).width).toBe(boxOf(activeClose).width)
	await expect(boxOf(close).height).toBe(boxOf(activeClose).height)
	await expect(boxOf(close).top).toBe(boxOf(activeClose).top)
	await expect(boxOf(close).right).toBe(boxOf(login).right - 5)
	await expect(close.className).toBe(activeClose.className)
	await expect(close.innerHTML).toBe(activeClose.innerHTML)
	await expect(getComputedStyle(close).color).toBe(
		getComputedStyle(activeClose).color,
	)
	await expect(getComputedStyle(close).transitionDuration).toBe("0s")
	await expect(boxOf(login).width).toBe(restingTab.width)
	await expect(boxOf(login).left).toBe(restingTab.left)
	await expect(boxOf(titleOf(login)).left).toBe(restingTitle.left)
	await expect(boxOf(titleOf(login)).width).toBe(restingTitle.width)

	liftTo(login, middleOf(login) + 40)
	await waitFor(() =>
		expect(getComputedStyle(login).pointerEvents).toBe("none"),
	)
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose])
	await userEvent.keyboard("{Escape}")
	dropAt(login, middleOf(login))

	await userEvent.unhover(login)
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose])
	await expect(skinOf(login)).toEqual(resting)

	if (isInBrowserRunner())
		await expectRealHoverOnTheCross(canvasElement, login, close)

	await userEvent.hover(login)
	await userEvent.hover(close)
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])
	await expect(skinOf(login)).toEqual(pointerOnTab)
	await userEvent.click(close)
	await expect(args.onCloseTab).toHaveBeenCalledTimes(1)
	await expect(args.onCloseTab).toHaveBeenCalledWith(LOGIN_REDIRECT.id)
	await expect(args.onSelectTab).not.toHaveBeenCalled()
	await expect(closeButtonsIn(canvasElement)).toEqual([activeClose, close])
}

export const InactiveTabHover = meta.story({
	args: INACTIVE_TAB_HOVER,
	parameters: {
		docs: {
			description: {
				story:
					"Light: the pointer on Fix the login redirect, an inactive tab, and then on its own cross. Check its cross shows 5px off its end at the size, glyph and colours of the open tab's cross, with no transition, that the tab keeps its width and its title stays where it was, that the cross stays while the pointer rides onto it, that pressing it closes that tab and selects nothing, that keyboard focus on the tab shows the cross too, that the crosses of the open, the focused and a hovered tab each read Close followed by their own tab's title, and that the pinned tab and a lifted tab show none. Pick `InactiveTabHoverDark` for the dark theme, `A1Tabs` for the row at rest.",
			},
		},
	},
	play: playInactiveTabHover,
})

export const InactiveTabHoverDark = meta.story({
	args: INACTIVE_TAB_HOVER,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"Dark: the same hovered inactive tab and its cross on the dark ground. Pick `InactiveTabHover` for the light theme.",
			},
		},
	},
	play: playInactiveTabHover,
})

export const TabGestures = meta.story({
	tags: ["test-only"],
	args: {
		tabs: [PINNED_INBOX, ...TWELVE_TABS],
		activeTabId: RELEASE_NOTES.id,
		canGoForward: true,
		hasClosedTab: true,
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Every gesture the bar reports, on a row with a pinned tab and an overflow. Check a press on a tab selects it, a press on Close tab closes the open tab without selecting it, each menu entry reports its tab or, for New tab and Reopen last closed tab, reports once, Back, Forward and New tab each report once, focus shows on every control, and no colour on a tab, a chip, a button or a menu row runs a transition.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = within(barIn(canvasElement))
		const login = bar.getByRole("tab", { name: LOGIN_REDIRECT.title })
		await userEvent.click(login)
		await expect(args.onSelectTab).toHaveBeenCalledWith(LOGIN_REDIRECT.id)
		login.blur()
		await userEvent.unhover(login)

		await userEvent.click(
			bar.getByRole("button", { name: `Close ${RELEASE_NOTES.title}` }),
		)
		await expect(args.onCloseTab).toHaveBeenCalledWith(RELEASE_NOTES.id)
		await expect(args.onSelectTab).toHaveBeenCalledTimes(1)

		for (const [name, callback] of [
			["Back", args.onGoBack],
			["Forward", args.onGoForward],
			["New tab", args.onNewTab],
		] as const) {
			await userEvent.click(bar.getByRole("button", { name }))
			await expect(callback).toHaveBeenCalledTimes(1)
		}

		fireEvent.contextMenu(bar.getByRole("tab", { name: WEEKLY_PLANNING.title }))
		let menu = await openMenu()
		await userEvent.click(tabMenuRow(menu, "Pin tab"))
		await expect(args.onPinTab).toHaveBeenCalledWith(WEEKLY_PLANNING.id)

		for (const [label, callback, ...expected] of [
			["New tab", args.onNewTab],
			["Duplicate tab", args.onDuplicateTab, WEEKLY_PLANNING.id],
			["Reopen last closed tab", args.onReopenClosedTab],
			["Close tab", args.onCloseTab, WEEKLY_PLANNING.id],
			["Move to new window", args.onMoveTabToNewWindow, WEEKLY_PLANNING.id],
		] as const) {
			fireEvent.contextMenu(
				bar.getByRole("tab", { name: WEEKLY_PLANNING.title }),
			)
			menu = await openMenu()
			await userEvent.click(tabMenuRow(menu, label))
			await expect(callback).toHaveBeenLastCalledWith(...expected)
		}
		await expect(args.onNewTab).toHaveBeenCalledTimes(2)
		await expect(args.onCloseTab).toHaveBeenCalledTimes(2)

		fireEvent.contextMenu(bar.getByRole("tab", { name: PINNED_INBOX.title }))
		menu = await openMenu()
		const rows = within(menu).getAllByRole("menuitem")
		for (const row of rows) {
			await expect(getComputedStyle(row).transitionDuration).toBe("0s")
		}
		await userEvent.click(rows[0])
		await expect(args.onUnpinTab).toHaveBeenCalledWith(PINNED_INBOX.id)
		fireEvent.contextMenu(bar.getByRole("tab", { name: PINNED_INBOX.title }))
		menu = await openMenu()
		await userEvent.click(tabMenuRow(menu, "Close other tabs"))
		await expect(args.onCloseOtherTabs).toHaveBeenCalledWith(PINNED_INBOX.id)

		const chip = chipIn(canvasElement)
		await userEvent.click(chip)
		menu = await openMenu()
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: ROADMAP.title }),
		)
		await expect(args.onSelectTab).toHaveBeenLastCalledWith(ROADMAP.id)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		const controls = [
			bar.getByRole("button", { name: "Back" }),
			bar.getByRole("button", { name: "Forward" }),
			...bar.getAllByRole("tab"),
			bar.getByRole("button", { name: `Close ${RELEASE_NOTES.title}` }),
			chip,
			bar.getByRole("button", { name: "New tab" }),
		]
		for (const control of controls) {
			await expect(getComputedStyle(control).transitionDuration).toBe("0s")
		}
		;(document.activeElement as HTMLElement | null)?.blur()
		const foreground = tokenStyleIn(
			barIn(canvasElement),
			"text-foreground",
			"color",
		)
		await userEvent.tab()
		await expect(controls[0]).toHaveFocus()
		await expect(getComputedStyle(controls[0]).outlineStyle).not.toBe("none")
		await expect(getComputedStyle(controls[0]).outlineColor).toBe(foreground)
		await userEvent.tab()
		await expect(controls[1]).toHaveFocus()
		await userEvent.tab()
		const rovingTab = document.activeElement as HTMLElement
		await expect(rovingTab).toHaveAttribute("role", "tab")
		await expect(getComputedStyle(rovingTab).outlineStyle).not.toBe("none")
		await expect(getComputedStyle(rovingTab).outlineColor).toBe(foreground)
		await userEvent.tab()
		const close = document.activeElement as HTMLElement
		await expect(close).toHaveAccessibleName(
			`Close ${titleOf(rovingTab).textContent}`,
		)
		await expect(close).toHaveAttribute(
			"data-close-pair",
			rovingTab.getAttribute("data-close-pair"),
		)
		await expect(getComputedStyle(close).outlineStyle).not.toBe("none")
		await userEvent.tab()
		await expect(chip).toHaveFocus()
		await userEvent.tab()
		const newTab = bar.getByRole("button", { name: "New tab" })
		await expect(newTab).toHaveFocus()
		await expect(getComputedStyle(newTab).outlineStyle).not.toBe("none")
	},
})

export const MiddleClickClosesTab = meta.story({
	tags: ["test-only"],
	args: {
		tabs: [PINNED_INBOX, LOGIN_REDIRECT, RELEASE_NOTES, WEEKLY_PLANNING],
		activeTabId: RELEASE_NOTES.id,
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A middle click on a tab closes it, as a browser does. Check that a middle press and drag lifts nothing, that a middle click reports that tab to close once, keeps the browser from starting its autoscroll and selects nothing, that the open tab stays the open one, that a pinned tab stays open as its menu keeps Close tab off, and that a right-click opens the tab menu and reports nothing.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const bar = within(barIn(canvasElement))
		const login = bar.getByRole("tab", { name: LOGIN_REDIRECT.title })
		const middlePress = { ...pointAt(middleOf(login), login), button: 1 }

		fireEvent.pointerDown(login, middlePress)
		fireEvent.pointerMove(login, {
			...middlePress,
			clientX: middlePress.clientX + 40,
		})
		await expect(isLifted(login)).toBe(false)
		await expect(shiftsIn(canvasElement)).toEqual([])
		fireEvent.pointerUp(login, middlePress)
		await expect(args.onReorderTabs).not.toHaveBeenCalled()

		await expect(middleClick(login)).toBe(false)
		await expect(args.onCloseTab).toHaveBeenCalledOnce()
		await expect(args.onCloseTab).toHaveBeenCalledWith(LOGIN_REDIRECT.id)
		await expect(args.onSelectTab).not.toHaveBeenCalled()
		await expect(
			bar.getByRole("tab", { name: RELEASE_NOTES.title }),
		).toHaveAttribute("aria-selected", "true")

		await expect(
			middleClick(bar.getByRole("tab", { name: PINNED_INBOX.title })),
		).toBe(false)
		await expect(args.onCloseTab).toHaveBeenCalledOnce()

		rightClick(login)
		await openMenu()
		await expect(args.onCloseTab).toHaveBeenCalledOnce()
		await expect(args.onSelectTab).not.toHaveBeenCalled()
	},
})

const STRIP_TABS = [
	PINNED_INBOX,
	...TWELVE_TABS.slice(0, 9),
	COMPANION_TAB,
	ROCKET_TAB,
	STANDUP,
]

export const OverflowFollowsTheStrip = meta.story({
	tags: ["test-only"],
	args: { tabs: STRIP_TABS, activeTabId: STANDUP.id },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The strip decides the overflow from its own width. Check the pinned tab and the open last tab stay in the row, that the menu lists every other tab that does not fit in tab order, a companion row at 16px and a glyph at 15px, that choosing a row reports its tab, and that widening the bar drops the chip once every tab fits and narrowing it brings it back.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = within(barIn(canvasElement))
		await expect(bar.getByRole("tab", { name: PINNED_INBOX.title })).toBe(
			slotIn(barIn(canvasElement), "title-bar-pinned-tab"),
		)
		await expect(bar.getByRole("tab", { name: STANDUP.title })).toHaveAttribute(
			"aria-selected",
			"true",
		)
		await expectEqualTabs(canvasElement, TAB_FLOOR_WIDTH)
		const overflowing = tabsOutOfStrip(canvasElement, STRIP_TABS)
		await expect(overflowing.map((tab) => tab.id)).not.toContain(STANDUP.id)
		await expect(overflowing.map((tab) => tab.id)).toContain(COMPANION_TAB.id)
		const chip = chipIn(canvasElement)
		await expect(chip).toHaveAccessibleName(`${overflowing.length} more`)

		await userEvent.click(chip)
		const menu = await openMenu()
		await expectMenuUnderChip(menu, chip)
		await expectOverflowRows(menu, overflowing)
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: COMPANION_TAB.title }),
		)
		await expect(args.onSelectTab).toHaveBeenCalledWith(COMPANION_TAB.id)
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		const frame = barIn(canvasElement).parentElement as HTMLElement
		frame.style.width = "2560px"
		await waitFor(() =>
			expect(
				barIn(canvasElement).querySelector('[data-slot="title-bar-overflow"]'),
			).toBeNull(),
		)
		await expect(tabsOutOfStrip(canvasElement, STRIP_TABS)).toEqual([])

		frame.style.width = ""
		await waitFor(() =>
			expect(tabsOutOfStrip(canvasElement, STRIP_TABS)).toEqual(overflowing),
		)
		await expect(chipIn(canvasElement)).toBeVisible()
	},
})

export const DragTabTwoRight = meta.story({
	tags: ["test-only"],
	args: { tabs: TWELVE_TABS, activeTabId: RELEASE_NOTES.id },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Placing a tab by hand on a row with an overflow. Check a press released in place selects the tab and reports no order, a tab held over its own place opens no gap and dropped there reports nothing, a drop two places right reports every tab id once, the overflowed ones at their place, and swallows the click it would fire, that an overflow row never lifts, and that the keyboard still selects and closes a tab.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = within(barIn(canvasElement))
		const [first, second, third] = unpinnedTabsIn(canvasElement)
		await expect(
			tabsOutOfStrip(canvasElement, TWELVE_TABS).length,
		).toBeGreaterThan(0)

		fireEvent.pointerDown(second, pointAt(middleOf(second), second))
		dropAt(second, middleOf(second))
		await expect(args.onSelectTab).toHaveBeenCalledWith(ONBOARDING_COPY.id)
		await expect(args.onReorderTabs).not.toHaveBeenCalled()

		const ownPlace = boxOf(first).right - 2
		liftTo(first, ownPlace)
		await waitFor(() =>
			expect(getComputedStyle(first).pointerEvents).toBe("none"),
		)
		await expect(shiftsIn(canvasElement)).toEqual([])
		dropAt(first, ownPlace)
		await waitFor(() => expect(isLifted(first)).toBe(false))
		await expect(args.onReorderTabs).not.toHaveBeenCalled()

		const pastThird = boxOf(third).right
		liftTo(first, pastThird)
		await waitFor(() =>
			expect(shiftsIn(canvasElement)).toEqual([second, third]),
		)
		dropAt(first, pastThird)
		await expect(args.onReorderTabs).toHaveBeenCalledTimes(1)
		await expect(args.onReorderTabs).toHaveBeenCalledWith([
			ONBOARDING_COPY.id,
			LOGIN_REDIRECT.id,
			RELEASE_NOTES.id,
			...TWELVE_TABS.slice(3).map((tab) => tab.id),
		])
		await expect(args.onSelectTab).toHaveBeenCalledTimes(1)

		await userEvent.click(chipIn(canvasElement))
		const menu = await openMenu()
		const row = within(menu).getByRole("menuitem", { name: STANDUP.title })
		fireEvent.pointerDown(row, pointAt(middleOf(row), row))
		fireEvent.pointerMove(row, pointAt(middleOf(row) - 40, row))
		await expect(shiftsIn(document.body)).toEqual([])
		await userEvent.keyboard("{Escape}")
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())

		bar.getByRole("tab", { name: WEEKLY_PLANNING.title }).focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelectTab).toHaveBeenLastCalledWith(WEEKLY_PLANNING.id)
		const activeClose = bar.getByRole("button", {
			name: `Close ${RELEASE_NOTES.title}`,
		})
		activeClose.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onCloseTab).toHaveBeenCalledWith(RELEASE_NOTES.id)
		await expect(args.onReorderTabs).toHaveBeenCalledTimes(1)
	},
})

export const DragAcrossTheDivider = meta.story({
	tags: ["test-only"],
	args: {
		tabs: [
			PINNED_INBOX,
			PINNED_ROADMAP,
			RELEASE_NOTES,
			LOGIN_REDIRECT,
			WEEKLY_PLANNING,
		],
		activeTabId: RELEASE_NOTES.id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Each zone keeps its tabs. Check a pinned tab carried past the divider stops before the divider and lands last of the pinned zone, and an unpinned tab carried over the pinned tabs stops after the divider and lands first of the unpinned zone.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const bar = barIn(canvasElement)
		const divider = slotIn(bar, "title-bar-pinned-divider")
		const [inbox, roadmap] = slotsIn(bar, "title-bar-pinned-tab")
		const [release, login, weekly] = unpinnedTabsIn(canvasElement)

		liftTo(inbox, middleOf(weekly))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([roadmap]))
		await expect(boxOf(inbox).right).toBeLessThan(boxOf(divider).left)
		dropAt(inbox, middleOf(weekly))
		await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
			ROADMAP.id,
			PINNED_INBOX.id,
			RELEASE_NOTES.id,
			LOGIN_REDIRECT.id,
			WEEKLY_PLANNING.id,
		])

		liftTo(login, middleOf(inbox))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([release]))
		await expect(boxOf(login).left).toBeGreaterThan(boxOf(divider).right)
		dropAt(login, middleOf(inbox))
		await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
			PINNED_INBOX.id,
			ROADMAP.id,
			LOGIN_REDIRECT.id,
			RELEASE_NOTES.id,
			WEEKLY_PLANNING.id,
		])
		await expect(args.onReorderTabs).toHaveBeenCalledTimes(2)
	},
})

export const DragDiagonallyOffTheBar = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	parameters: {
		docs: {
			description: {
				story:
					"Pressing anywhere on a tab and drifting off its row. Check 3px of diagonal travel still selects, 4px diagonally out of the tab lifts it, the lifted tab rides the pointer on the row only, on top of the tab under it, that a release just under the bar drops at the slot shown, and a release far beside the bar at tab height drops last of the zone.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const [release, login, weekly] = unpinnedTabsIn(canvasElement)
		const middle = { x: middleOf(login), y: boxOf(login).top + 14 }
		const corner = { x: boxOf(login).right - 1, y: boxOf(login).bottom - 1 }
		const resting = boxOf(login)
		const overWeekly = { x: middleOf(weekly), y: resting.bottom + 12 }
		const underBar = { x: boxOf(weekly).right, y: resting.bottom + 16 }

		fireEvent.pointerDown(login, pointerAt(middle.x, middle.y))
		fireEvent.pointerMove(login, pointerAt(middle.x + 2, middle.y + 2))
		fireEvent.pointerUp(login, pointerAt(middle.x + 2, middle.y + 2))
		fireEvent.click(login)
		await expect(args.onSelectTab).toHaveBeenCalledWith(LOGIN_REDIRECT.id)

		fireEvent.pointerDown(login, pointerAt(corner.x, corner.y))
		fireEvent.pointerMove(document.body, pointerAt(corner.x + 3, corner.y + 3))
		await waitFor(() => expect(isLifted(login)).toBe(true))

		fireEvent.pointerMove(document.body, pointerAt(overWeekly.x, overWeekly.y))
		await waitFor(() =>
			expect(boxOf(login).left - resting.left).toBeCloseTo(
				Math.round(overWeekly.x) - Math.round(corner.x),
				0,
			),
		)
		await expect(boxOf(login).top).toBe(resting.top)
		const carried = boxOf(login)
		login.style.pointerEvents = "auto"
		const onTop = document.elementFromPoint(
			carried.left + carried.width / 2,
			carried.top + carried.height / 2,
		)
		login.style.pointerEvents = ""
		await expect(login.contains(onTop)).toBe(true)

		fireEvent.pointerMove(document.body, pointerAt(underBar.x, underBar.y))
		await waitFor(() => expect(shiftsIn(canvasElement)).toEqual([weekly]))
		fireEvent.pointerUp(document.body, pointerAt(underBar.x, underBar.y))
		await waitFor(() => expect(isLifted(login)).toBe(false))
		await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
			PINNED_INBOX.id,
			ROADMAP.id,
			RELEASE_NOTES.id,
			WEEKLY_PLANNING.id,
			LOGIN_REDIRECT.id,
			INVOICE_EXPORT.id,
		])

		const beside = { x: boxOf(barIn(canvasElement)).right + 40, y: middle.y }
		fireEvent.pointerDown(release, pointerAt(middleOf(release), middle.y))
		fireEvent.pointerMove(document.body, pointerAt(beside.x, beside.y))
		await waitFor(() => expect(isLifted(release)).toBe(true))
		fireEvent.pointerUp(document.body, pointerAt(beside.x, beside.y))
		await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
			PINNED_INBOX.id,
			ROADMAP.id,
			LOGIN_REDIRECT.id,
			WEEKLY_PLANNING.id,
			INVOICE_EXPORT.id,
			RELEASE_NOTES.id,
		])
		await expect(args.onReorderTabs).toHaveBeenCalledTimes(2)
		await expect(args.onSelectTab).toHaveBeenCalledTimes(1)
		await expect(args.onTearOffTab).not.toHaveBeenCalled()
	},
})

export const TearOffReportsTheTab = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	parameters: {
		docs: {
			description: {
				story:
					"A tab carried off the strip and released. Check the release reports the tab and the screen point once and no order, that the tab snaps back to its slot when the handler does not take it, and that a tab carried off then back onto the strip opens its gap again and drops there as a reorder.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const bar = barIn(canvasElement)
		const [, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
		const resting = boxOf(login)
		const step = boxOf(weekly).left - resting.left
		const y = resting.top + 14
		const carriedTo = middleOf(login) + step
		const offBar = boxOf(bar).bottom + 60

		liftTo(login, carriedTo)
		fireEvent.pointerMove(document.body, pointerAt(carriedTo, offBar))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
		fireEvent.pointerUp(document.body, {
			...pointerAt(carriedTo, offBar),
			screenX: 900,
			screenY: 700,
		})
		await expect(args.onTearOffTab).toHaveBeenCalledOnce()
		await expect(args.onTearOffTab).toHaveBeenCalledWith({
			tabId: LOGIN_REDIRECT.id,
			screenX: 900,
			screenY: 700,
		})
		await expect(args.onReorderTabs).not.toHaveBeenCalled()
		await waitFor(() => expect(isLifted(login)).toBe(false))
		await waitFor(() =>
			expect(Math.round(boxOf(login).left)).toBe(Math.round(resting.left)),
		)

		liftTo(login, carriedTo)
		fireEvent.pointerMove(document.body, pointerAt(carriedTo, offBar))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
		fireEvent.pointerMove(document.body, pointerAt(carriedTo, y))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly]))
		fireEvent.pointerUp(document.body, pointerAt(carriedTo, y))
		await expect(args.onReorderTabs).toHaveBeenCalledOnce()
		await expect(args.onReorderTabs).toHaveBeenCalledWith([
			PINNED_INBOX.id,
			ROADMAP.id,
			RELEASE_NOTES.id,
			WEEKLY_PLANNING.id,
			LOGIN_REDIRECT.id,
			INVOICE_EXPORT.id,
		])
		await expect(args.onTearOffTab).toHaveBeenCalledOnce()
	},
})

export const DragMeasuresOnlyAtLift = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	parameters: {
		docs: {
			description: {
				story:
					"A drag across four slots. Check the tab slots are measured when the tab lifts and never again while it moves, a gap opened only where the drop would change the order, and the drop landing at the last gap shown.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const bar = barIn(canvasElement)
		const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
		const y = boxOf(login).top + 14
		const pressedAt = middleOf(login)
		const step = boxOf(weekly).left - boxOf(login).left
		await nextFrames()

		fireEvent.pointerDown(login, pointerAt(pressedAt, y))
		fireEvent.pointerMove(login, pointerAt(pressedAt + 8, y))
		await waitFor(() => expect(isLifted(login)).toBe(true))

		const measures = spyOn(Element.prototype, "getBoundingClientRect")
		try {
			fireEvent.pointerMove(document.body, pointerAt(pressedAt + step, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly]))
			fireEvent.pointerMove(document.body, pointerAt(pressedAt + 10, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([]))
			fireEvent.pointerMove(
				document.body,
				pointerAt(pressedAt + 2 * step + 20, y),
			)
			await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
			fireEvent.pointerMove(document.body, pointerAt(pressedAt - step, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([release]))
			await expect(measures).not.toHaveBeenCalled()
		} finally {
			measures.mockRestore()
		}

		fireEvent.pointerUp(document.body, pointerAt(pressedAt - step, y))
		await expect(args.onReorderTabs).toHaveBeenCalledWith([
			PINNED_INBOX.id,
			ROADMAP.id,
			LOGIN_REDIRECT.id,
			RELEASE_NOTES.id,
			WEEKLY_PLANNING.id,
			INVOICE_EXPORT.id,
		])
	},
})

const barCommits = { count: 0 }

const tabsCommitsOf = (measures: { mock: { calls: unknown[][] } }) =>
	measures.mock.calls.filter(([selector]) => selector === '[role="tablist"]')
		.length

export const DragCommitsTheStripTwice = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	render: (args) => (
		<div className="surface-shell relative h-10 w-320">
			<Profiler
				id="title-bar"
				onRender={() => {
					barCommits.count += 1
				}}
			>
				<AppTitleBar {...args} />
			</Profiler>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A drag carried across three slots. Check the bar commits once per slot change while the tab strip itself commits once when the tab lifts and once when it drops, the strip counted through the fit measure it runs on each of its commits.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = barIn(canvasElement)
		const strip = slotIn(bar, "title-bar-tabs")
		const [release, login, weekly, invoice] = unpinnedTabsIn(canvasElement)
		const y = boxOf(login).top + 14
		const pressedAt = middleOf(login)
		const step = boxOf(weekly).left - boxOf(login).left
		const pastWeekly = pressedAt + step
		const pastInvoice = pressedAt + 2 * step + 20
		const beforeRelease = pressedAt - step
		await nextFrames()

		const measures = spyOn(strip, "querySelector")
		try {
			fireEvent.pointerDown(login, pointerAt(pressedAt, y))
			fireEvent.pointerMove(login, pointerAt(pressedAt + 8, y))
			await waitFor(() => expect(isLifted(login)).toBe(true))
			await nextFrames()
			await expect(tabsCommitsOf(measures)).toBe(1)
			const atLift = barCommits.count

			fireEvent.pointerMove(document.body, pointerAt(pastWeekly, y))
			fireEvent.pointerMove(document.body, pointerAt(pastWeekly + 6, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly]))
			fireEvent.pointerMove(document.body, pointerAt(beforeRelease, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([release]))
			fireEvent.pointerMove(document.body, pointerAt(pastInvoice, y))
			fireEvent.pointerMove(document.body, pointerAt(pastInvoice + 6, y))
			await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly, invoice]))
			await nextFrames()
			await expect(barCommits.count - atLift).toBe(3)
			await expect(tabsCommitsOf(measures)).toBe(1)

			fireEvent.pointerUp(document.body, pointerAt(pastInvoice, y))
			await waitFor(() => expect(isLifted(login)).toBe(false))
			await nextFrames()
			await expect(tabsCommitsOf(measures)).toBe(2)
		} finally {
			measures.mockRestore()
		}
	},
})

export const ReleaseOutsideThenHover = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	parameters: {
		docs: {
			description: {
				story:
					"A press that ends away from its tab. Check a press released just outside the tab, then a hover back across the strip with the button up, lifts nothing, and that a lift whose pointer capture is lost closes its gap and reports no order.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const bar = barIn(canvasElement)
		const [, login, weekly] = unpinnedTabsIn(canvasElement)
		const y = boxOf(login).top + 14
		const edge = { x: middleOf(login), y: boxOf(login).bottom - 1 }
		const pastWeekly = boxOf(weekly).right

		fireEvent.pointerDown(login, pointerAt(edge.x, edge.y))
		fireEvent.pointerMove(document.body, pointerAt(edge.x, edge.y + 2))
		fireEvent.pointerUp(document.body, pointerAt(edge.x, edge.y + 2))
		fireEvent.pointerMove(login, pointerAt(edge.x, y))
		fireEvent.pointerMove(login, pointerAt(pastWeekly, y))
		await nextFrames()
		await expect(isLifted(login)).toBe(false)
		await expect(shiftsIn(bar)).toEqual([])

		fireEvent.pointerDown(login, pointerAt(edge.x, y))
		fireEvent.pointerMove(login, pointerAt(pastWeekly, y))
		await waitFor(() => expect(shiftsIn(bar)).toEqual([weekly]))
		fireEvent.lostPointerCapture(login, POINTER)
		await waitFor(() => expect(shiftsIn(bar)).toEqual([]))
		await expect(isLifted(login)).toBe(false)
		fireEvent.pointerMove(login, pointerAt(edge.x, y))
		fireEvent.pointerUp(login, pointerAt(pastWeekly, y))
		await nextFrames()
		await expect(shiftsIn(bar)).toEqual([])
		await expect(args.onReorderTabs).not.toHaveBeenCalled()
	},
})

const REORDER_TABS = [
	PINNED_INBOX,
	PINNED_ROADMAP,
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
]

const ReorderingTitleBar = (args: AppTitleBarProps) => {
	const [tabs, setTabs] = useState(args.tabs ?? [])
	return (
		<div className="surface-shell relative h-10 w-320">
			<AppTitleBar
				{...args}
				onReorderTabs={(ids) => {
					args.onReorderTabs?.(ids)
					setTabs(ids.flatMap((id) => tabs.filter((tab) => tab.id === id)))
				}}
				tabs={tabs}
			/>
		</div>
	)
}

type KeyboardPlayContext = {
	args: Partial<AppTitleBarProps>
	canvasElement: HTMLElement
	userEvent: { keyboard: (text: string) => Promise<void> }
}

const moveAnnouncement = () =>
	slotIn(document.body, "title-bar-tab-move-announcement")

const playKeyboardReorder = async ({
	args,
	canvasElement,
	userEvent,
}: KeyboardPlayContext) => {
	const bar = within(barIn(canvasElement))
	const login = bar.getByRole("tab", { name: LOGIN_REDIRECT.title })
	const roadmap = bar.getByRole("tab", { name: ROADMAP.title })

	login.focus()
	await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(1)
	await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
		PINNED_INBOX.id,
		ROADMAP.id,
		RELEASE_NOTES.id,
		WEEKLY_PLANNING.id,
		LOGIN_REDIRECT.id,
	])
	await waitFor(() => expect(unpinnedTabsIn(canvasElement)[2]).toBe(login))
	await expect(login).toHaveFocus()
	await expect(moveAnnouncement()).toHaveAttribute("aria-live", "polite")
	await expect(moveAnnouncement()).toHaveTextContent(
		`${LOGIN_REDIRECT.title} moved to position 5 of 5`,
	)

	await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(1)

	await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(2)
	await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
		PINNED_INBOX.id,
		ROADMAP.id,
		RELEASE_NOTES.id,
		LOGIN_REDIRECT.id,
		WEEKLY_PLANNING.id,
	])
	await expect(login).toHaveFocus()
	await expect(moveAnnouncement()).toHaveTextContent(
		`${LOGIN_REDIRECT.title} moved to position 4 of 5`,
	)

	await userEvent.keyboard("{ArrowLeft}")
	await expect(
		bar.getByRole("tab", { name: RELEASE_NOTES.title }),
	).toHaveFocus()
	await userEvent.keyboard("{ArrowRight}")
	await expect(login).toHaveFocus()
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(2)

	roadmap.focus()
	await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(2)
	await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(3)
	await expect(args.onReorderTabs).toHaveBeenLastCalledWith([
		ROADMAP.id,
		PINNED_INBOX.id,
		RELEASE_NOTES.id,
		LOGIN_REDIRECT.id,
		WEEKLY_PLANNING.id,
	])
	await expect(roadmap).toHaveFocus()
	await expect(moveAnnouncement()).toHaveTextContent(
		`${ROADMAP.title} moved to position 1 of 5`,
	)
	await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}")
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(3)
}

export const KeyboardReorder = meta.story({
	tags: ["test-only"],
	args: { tabs: REORDER_TABS, activeTabId: RELEASE_NOTES.id },
	render: (args) => <ReorderingTitleBar {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Moving a tab from the keyboard, light. Check Option+Right on the focused Fix the login redirect swaps it with Weekly planning, keeps the focus on it and announces its new place, that it stops at the end of its zone, that Option+Left brings it back, that plain arrows still walk the tabs without moving one, and that a pinned tab never crosses the divider.",
			},
		},
	},
	play: playKeyboardReorder,
})

export const KeyboardReorderDark = meta.story({
	tags: ["test-only"],
	args: { tabs: REORDER_TABS, activeTabId: RELEASE_NOTES.id },
	globals: DARK,
	render: (args) => <ReorderingTitleBar {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Moving a tab from the keyboard, dark. Pick `KeyboardReorder` for the light theme.",
			},
		},
	},
	play: playKeyboardReorder,
})

export const KeyboardReorderWithoutHandler = meta.story({
	tags: ["test-only"],
	args: {
		tabs: REORDER_TABS,
		activeTabId: RELEASE_NOTES.id,
		onReorderTabs: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A strip with no reorder handler. Check Option+Right and Option+Left on a focused tab leave the order, the focus and the announcement untouched.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const login = within(barIn(canvasElement)).getByRole("tab", {
			name: LOGIN_REDIRECT.title,
		})
		login.focus()
		await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}")
		await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}")
		await expect(unpinnedTabsIn(canvasElement)[1]).toBe(login)
		await expect(login).toHaveFocus()
		await expect(moveAnnouncement()).toHaveTextContent("")
	},
})

const playEscapeCancelsDrag = async ({
	args,
	canvasElement,
	userEvent,
}: KeyboardPlayContext) => {
	const bar = barIn(canvasElement)
	const [, lifted, passed] = unpinnedTabsIn(canvasElement)
	const restingLeft = boxOf(lifted).left
	const passedLeft = boxOf(passed).left
	const target = boxOf(passed).right

	liftTo(lifted, target)
	await waitFor(() => expect(shiftsIn(bar)).toEqual([passed]))
	await userEvent.keyboard("{Escape}")
	await waitFor(() => expect(shiftsIn(bar)).toEqual([]))
	await expect(isLifted(lifted)).toBe(false)
	await expect(boxOf(lifted).left).toBeCloseTo(restingLeft, 0)
	await expect(boxOf(passed).left).toBeCloseTo(passedLeft, 0)

	fireEvent.pointerMove(lifted, pointAt(target + 20, lifted))
	await expect(shiftsIn(bar)).toEqual([])
	dropAt(lifted, target)
	await expect(args.onReorderTabs).not.toHaveBeenCalled()
	await expect(args.onTearOffTab).not.toHaveBeenCalled()
	await expect(args.onSelectTab).not.toHaveBeenCalled()

	liftTo(lifted, target)
	dropAt(lifted, target)
	await expect(args.onReorderTabs).toHaveBeenCalledTimes(1)
}

export const EscapeCancelsDrag = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	parameters: {
		docs: {
			description: {
				story:
					"Escape during a drag, light. Check Escape drops the lift, puts Fix the login redirect and Weekly planning back in their slots, that the release after it reports no order and selects nothing, and that the next drag still lands.",
			},
		},
	},
	play: playEscapeCancelsDrag,
})

export const EscapeCancelsDragDark = meta.story({
	tags: ["test-only"],
	args: LIFT_ROW,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"Escape during a drag, dark. Pick `EscapeCancelsDrag` for the light theme.",
			},
		},
	},
	play: playEscapeCancelsDrag,
})
