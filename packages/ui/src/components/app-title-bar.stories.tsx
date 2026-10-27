import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	settled,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
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

const barIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "app-title-bar")

const boxOf = (element: Element) => element.getBoundingClientRect()

const unpinnedTabsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "title-bar-tab")

const titleOf = (tab: HTMLElement) =>
	tab.querySelector<HTMLElement>("span:last-child") ?? tab

const openMenu = async () => settled(await screen.findByRole("menu"))

const chipIn = (canvasElement: HTMLElement) =>
	slotIn(barIn(canvasElement), "title-bar-overflow")

const iconSlotOf = (owner: HTMLElement) =>
	owner.querySelector<HTMLElement>('span[aria-hidden="true"]') ?? owner

const expectIconAtItsSize = async (owner: HTMLElement, isAvatar: boolean) => {
	const slot = iconSlotOf(owner)
	await expect(boxOf(slot).width).toBe(ICON_SLOT)
	await expect(boxOf(slot).height).toBe(ICON_SLOT)
	const icon = slot.firstElementChild as Element
	const side = isAvatar ? AVATAR_ICON : GLYPH_ICON
	await expect(boxOf(icon).width).toBe(side)
	await expect(boxOf(icon).height).toBe(side)
}

const isAvatarTab = (tab: TitleBarTab) => tab.id === COMPANION_TAB.id

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
		await expectIconAtItsSize(rows[rank], isAvatarTab(tab))
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
	const close = bar.getByRole("button", { name: "Close tab" })
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

const playA1 = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
	await expectBarAnatomy(canvasElement)
	await expectOneCloseOnTheActiveTab(canvasElement)
	await expectEqualTabs(canvasElement, TAB_WIDTH)
	const [active, inactive] = unpinnedTabsIn(canvasElement)
	await expect(getComputedStyle(active).backgroundColor).toBe(
		tokenStyleIn(active, "bg-title-bar-tab-selected", "backgroundColor"),
	)
	await expect(getComputedStyle(inactive).backgroundColor).toBe(
		tokenStyleIn(inactive, "bg-title-bar-tab", "backgroundColor"),
	)
}

export const A1Tabs = meta.story({
	args: A1,
	parameters: {
		docs: {
			description: {
				story:
					"A1, light: three tabs on macOS, the first one open, Back available and Forward not. Check the bar is 40px with 14px and 8px of inline padding, the 57px slot the traffic lights take, Back and Forward 28px squares 2px apart, then the tab row and New tab, every tab 176px by 28px, the open one on the selected fill with the only Close tab button 5px off its end. Pick `A1TabsDark` for the dark theme.",
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
					"A1, dark: the same three tabs on the dark ground. Check the inactive tabs sit on a 4% white fill in the muted grey and the open one on the 12% fill in the foreground colour. Pick `A1Tabs` for the light theme.",
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
		await expectIconAtItsSize(tabs[rank], isAvatarTab(tab))
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
	await expect(boxOf(menu).width).toBe(220)
	await expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent),
	).toEqual(["Unpin tab", "Close other tabs"])
}

export const A4PinnedTab = meta.story({
	args: A4,
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A4, light: a pinned tab at the start of the row, its menu open. Check the pinned tab is a 28px icon-only square named by its title, followed by the 1px by 16px divider, that the unpinned tabs follow, and that its menu, 220px wide, offers exactly Unpin tab then Close other tabs. Pick `A1Tabs` for a row with nothing pinned.",
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
					"A4, dark: the pinned tab on its 5% white fill and the 12% white divider. Pick `A4PinnedTab` for the light theme.",
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

export const TabGestures = meta.story({
	tags: ["test-only"],
	args: {
		tabs: [PINNED_INBOX, ...TWELVE_TABS],
		activeTabId: RELEASE_NOTES.id,
		canGoForward: true,
	},
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Every gesture the bar reports, on a row with a pinned tab and an overflow. Check a press on a tab selects it, a press on Close tab closes the open tab without selecting it, each menu entry reports its tab, Back, Forward and New tab each report once, focus shows on every control, and no colour on a tab, a chip, a button or a menu row runs a transition.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const bar = within(barIn(canvasElement))
		await userEvent.click(bar.getByRole("tab", { name: LOGIN_REDIRECT.title }))
		await expect(args.onSelectTab).toHaveBeenCalledWith(LOGIN_REDIRECT.id)

		await userEvent.click(bar.getByRole("button", { name: "Close tab" }))
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
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Pin tab" }),
		)
		await expect(args.onPinTab).toHaveBeenCalledWith(WEEKLY_PLANNING.id)

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
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Close other tabs" }),
		)
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
			bar.getByRole("button", { name: "Close tab" }),
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
		const close = bar.getByRole("button", { name: "Close tab" })
		await expect(close).toHaveFocus()
		await expect(getComputedStyle(close).outlineStyle).not.toBe("none")
		await userEvent.tab()
		await expect(chip).toHaveFocus()
		await userEvent.tab()
		const newTab = bar.getByRole("button", { name: "New tab" })
		await expect(newTab).toHaveFocus()
		await expect(getComputedStyle(newTab).outlineStyle).not.toBe("none")
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
