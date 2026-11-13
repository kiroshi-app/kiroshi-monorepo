import { expect, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	HeaderIsland,
	HeaderIslandButton,
} from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"

const STATE_CONTROL_ID = "header-island-state-control"
const STATE_CONTROL = `#${STATE_CONTROL_ID}`

const TRANSPARENT = "rgba(0, 0, 0, 0)"

type StatePlayContext = {
	canvasElement: HTMLElement
}

const controlsIn = (canvasElement: HTMLElement) => {
	const island = slotIn(canvasElement, "header-island")
	const buttons = within(island)

	return {
		island,
		search: buttons.getByRole("button", { name: "Search" }),
		history: buttons.getByRole("button", { name: "History" }),
	}
}

const expectFill = (control: HTMLElement, fill: string) =>
	expect(getComputedStyle(control).backgroundColor).toBe(
		tokenStyleIn(control, fill, "backgroundColor"),
	)

const expectForegroundIcon = (control: HTMLElement) =>
	expect(getComputedStyle(control).color).toBe(
		tokenStyleIn(control, "text-foreground", "color"),
	)

const expectAtRest = async ({ canvasElement }: StatePlayContext) => {
	const { island, search, history } = controlsIn(canvasElement)
	const surface = getComputedStyle(island)
	const isDark = island.closest(".dark") !== null
	const islandBox = island.getBoundingClientRect()
	const searchBox = search.getBoundingClientRect()
	const historyBox = history.getBoundingClientRect()
	const icon = search.querySelector("svg")?.getBoundingClientRect()

	await expect(islandBox.height).toBe(40)
	await expect(surface.borderTopLeftRadius).toBe("12px")
	await expect(surface.borderTopWidth).toBe("1px")
	await expect(surface.borderTopColor).toBe(
		tokenStyleIn(
			island,
			"border border-selection-toolbar-border",
			"borderTopColor",
		),
	)
	await expect(surface.boxShadow).toBe(
		tokenStyleIn(island, "shadow-selection-toolbar", "boxShadow"),
	)
	await expect(surface.backgroundColor).toBe(
		tokenStyleIn(
			island,
			isDark ? "bg-card-raised" : "bg-card",
			"backgroundColor",
		),
	)

	await expect(search.tagName).toBe("BUTTON")
	await expect([searchBox.width, searchBox.height]).toEqual([32, 32])
	await expect(getComputedStyle(search).borderTopLeftRadius).toBe("8px")
	await expect(searchBox.left - islandBox.left).toBe(4)
	await expect(searchBox.top - islandBox.top).toBe(4)
	await expect(historyBox.left - searchBox.right).toBe(2)
	await expect([icon?.width, icon?.height]).toEqual([16, 16])
	await expect(getComputedStyle(search).color).toBe(
		tokenStyleIn(search, "text-soft-foreground", "color"),
	)
	await expect(getComputedStyle(search).backgroundColor).toBe(TRANSPARENT)
}

const expectHover = async ({ canvasElement }: StatePlayContext) => {
	if (!isInBrowserRunner()) return
	const { search } = controlsIn(canvasElement)
	const pointer = await realPointer()

	await pointer.hover(search)
	await expect(search.matches(":hover")).toBe(true)
	await expectFill(search, "bg-header-island-control-hover")
	await expectForegroundIcon(search)
	await expect(getComputedStyle(search).translate).toBe("none")
	await withMotionAllowed(() => expect(colourTransitionsOf(search)).toEqual([]))
	await pointer.unhover(search)
}

const expectPressed = async ({ canvasElement }: StatePlayContext) => {
	if (!isInBrowserRunner()) return
	const { search } = controlsIn(canvasElement)
	const pointer = await realPointer()

	await pointer.hover(search)
	search.focus()
	await pointer.keyboard("{Space>}")
	await expect(search.matches(":hover:active")).toBe(true)
	await expectFill(search, "bg-header-island-control-pressed")
	await expectForegroundIcon(search)
	await expect(getComputedStyle(search).translate).toBe("0px 1px")
	await pointer.keyboard("{/Space}")
	await pointer.unhover(search)
}

const expectKeyboardFocus = async ({ canvasElement }: StatePlayContext) => {
	const { search, history } = controlsIn(canvasElement)
	if (!isInBrowserRunner()) {
		await userEvent.tab()
		return
	}
	const pointer = await realPointer()

	await pointer.click(search)
	await expect(search).toHaveFocus()
	await expect(getComputedStyle(search).boxShadow).toBe("none")
	await expect(getComputedStyle(search).borderTopColor).toBe(TRANSPARENT)

	await pointer.tab()
	await expect(history).toHaveFocus()
	await expect(getComputedStyle(history).boxShadow).toBe(
		tokenStyleIn(history, "ring-4 ring-ring/30", "boxShadow"),
	)
	await expect(getComputedStyle(history).boxShadow).toMatch(/\b4px\b/)
	await expect(getComputedStyle(history).borderTopWidth).toBe("1px")
	await expect(getComputedStyle(history).borderTopColor).toBe(
		tokenStyleIn(history, "border border-ring", "borderTopColor"),
	)
}

const meta = preview.meta({
	title: "Navigation/HeaderIsland",
	component: HeaderIsland,
	parameters: {
		docs: {
			description: {
				component:
					"The raised surface a floating content header is made of: a 40px island holding `HeaderIslandButton` controls, one island on each side of the content area. It wears the selection toolbar border and shadow, the card fill in light and the raised card fill in dark. A control is a native button named by `aria-label`.",
			},
		},
	},
	render: () => (
		<HeaderIsland>
			<HeaderIslandButton aria-label="Search" id={STATE_CONTROL_ID}>
				<Icons.Search />
			</HeaderIslandButton>
			<HeaderIslandButton aria-label="History">
				<Icons.History />
			</HeaderIslandButton>
			<HeaderIslandButton aria-label="More">
				<Icons.More />
			</HeaderIslandButton>
		</HeaderIsland>
	),
})

export const AtRest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read the island geometry with no pointer and no focus on it. Check the 40px island, its 12px corners, the 32px controls 4px inside it and 2px apart, and the icons in the soft foreground on no fill.",
			},
		},
	},
	play: expectAtRest,
})

export const AtRestDark = meta.story({
	...AtRest.input,
	globals: { theme: "dark" },
})

export const Hover = meta.story({
	parameters: {
		pseudo: { hover: STATE_CONTROL },
		docs: {
			description: {
				story:
					"Reach for this when the pointer rests on a control. Check that Search wears the hover fill and a full foreground icon, that it stays in place, and that the fill arrives with no colour transition. The play drives the real pointer, in the Vitest browser runner only.",
			},
		},
	},
	play: expectHover,
})

export const HoverDark = meta.story({
	...Hover.input,
	globals: { theme: "dark" },
})

export const Pressed = meta.story({
	parameters: {
		pseudo: { hover: STATE_CONTROL, active: STATE_CONTROL },
		docs: {
			description: {
				story:
					"Reach for this while a control is held down under the pointer. Check that the pressed fill wins over the hover fill and that Search sits 1px lower than its neighbours. The play holds the real press, in the Vitest browser runner only.",
			},
		},
	},
	play: expectPressed,
})

export const PressedDark = meta.story({
	...Pressed.input,
	globals: { theme: "dark" },
})

export const KeyboardFocus = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a control is reached with Tab. In the Vitest browser runner the play clicks Search and checks it takes focus with no ring, then tabs to History and checks the 1px ring line and its 4px halo, both in the ring colour; here it only tabs to Search.",
			},
		},
	},
	play: expectKeyboardFocus,
})

export const KeyboardFocusDark = meta.story({
	...KeyboardFocus.input,
	globals: { theme: "dark" },
})
