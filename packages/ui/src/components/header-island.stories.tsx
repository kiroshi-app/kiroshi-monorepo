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
		pins: buttons.getByRole("button", { name: "Pinned messages" }),
		routines: buttons.getByRole("button", { name: "Routines" }),
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
	const { island, pins, routines } = controlsIn(canvasElement)
	const surface = getComputedStyle(island)
	const isDark = island.closest(".dark") !== null
	const islandBox = island.getBoundingClientRect()
	const pinsBox = pins.getBoundingClientRect()
	const routinesBox = routines.getBoundingClientRect()
	const icon = pins.querySelector("svg")?.getBoundingClientRect()

	await expect([islandBox.width, islandBox.height]).toEqual([76, 40])
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

	await expect(pins.tagName).toBe("BUTTON")
	await expect([pinsBox.width, pinsBox.height]).toEqual([32, 32])
	await expect(getComputedStyle(pins).borderTopLeftRadius).toBe("8px")
	await expect(pinsBox.left - islandBox.left).toBe(5)
	await expect(pinsBox.top - islandBox.top).toBe(4)
	await expect(routinesBox.left - pinsBox.right).toBe(2)
	await expect([icon?.width, icon?.height]).toEqual([16, 16])
	await expect(getComputedStyle(pins).color).toBe(
		tokenStyleIn(pins, "text-soft-foreground", "color"),
	)
	await expect(getComputedStyle(pins).backgroundColor).toBe(TRANSPARENT)
}

const expectHover = async ({ canvasElement }: StatePlayContext) => {
	if (!isInBrowserRunner()) return
	const { pins } = controlsIn(canvasElement)
	const pointer = await realPointer()

	await pointer.hover(pins)
	await expect(pins.matches(":hover")).toBe(true)
	await expectFill(pins, "bg-header-island-control-hover")
	await expectForegroundIcon(pins)
	await expect(getComputedStyle(pins).translate).toBe("none")
	await withMotionAllowed(() => expect(colourTransitionsOf(pins)).toEqual([]))
	await pointer.unhover(pins)
}

const expectPressed = async ({ canvasElement }: StatePlayContext) => {
	if (!isInBrowserRunner()) return
	const { pins } = controlsIn(canvasElement)
	const pointer = await realPointer()

	await pointer.hover(pins)
	pins.focus()
	await pointer.keyboard("{Space>}")
	await expect(pins.matches(":hover:active")).toBe(true)
	await expectFill(pins, "bg-header-island-control-pressed")
	await expectForegroundIcon(pins)
	await expect(getComputedStyle(pins).translate).toBe("0px 1px")
	await pointer.keyboard("{/Space}")
	await pointer.unhover(pins)
}

const expectKeyboardFocus = async ({ canvasElement }: StatePlayContext) => {
	const { pins, routines } = controlsIn(canvasElement)
	if (!isInBrowserRunner()) {
		await userEvent.tab()
		return
	}
	const pointer = await realPointer()

	await pointer.click(pins)
	await expect(pins).toHaveFocus()
	await expect(getComputedStyle(pins).boxShadow).toBe("none")
	await expect(getComputedStyle(pins).outlineStyle).toBe("none")

	await pointer.tab()
	await expect(routines).toHaveFocus()
	await expect(getComputedStyle(routines).boxShadow).toBe(
		tokenStyleIn(routines, "ring-4 ring-ring/30", "boxShadow"),
	)
	const line = getComputedStyle(routines)
	await expect([
		line.outlineStyle,
		line.outlineWidth,
		line.outlineOffset,
	]).toEqual(["solid", "1px", "0px"])
	await expect(line.outlineColor).toBe(
		tokenStyleIn(routines, "border border-ring", "borderTopColor"),
	)
	await expect(routines.getBoundingClientRect().width).toBe(32)
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
		<div className="flex">
			<HeaderIsland>
				<HeaderIslandButton aria-label="Pinned messages" id={STATE_CONTROL_ID}>
					<Icons.Pin />
				</HeaderIslandButton>
				<HeaderIslandButton aria-label="Routines">
					<Icons.SidePanel />
				</HeaderIslandButton>
			</HeaderIsland>
		</div>
	),
})

export const AtRest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read the island geometry with no pointer and no focus on it. Check the 40px island, its 12px corners, the 32px controls 5px from its sides, 4px from its top and 2px apart, and the icons in the soft foreground on no fill.",
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
					"Reach for this when the pointer rests on a control. Check that the pins control wears the hover fill and a full foreground icon, that it stays in place, and that the fill arrives with no colour transition. The play drives the real pointer, in the Vitest browser runner only.",
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
					"Reach for this while a control is held down under the pointer. Check that the pressed fill wins over the hover fill and that the pins control sits 1px lower than its neighbour. The play holds the real press, in the Vitest browser runner only.",
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
					"Reach for this when a control is reached with Tab. In the Vitest browser runner the play clicks the pins control and checks it takes focus with no ring, then tabs to Routines and checks the 1px ring line drawn around the 32px control and its 4px halo, both in the ring colour; here it only tabs to the pins control.",
			},
		},
	},
	play: expectKeyboardFocus,
})

export const KeyboardFocusDark = meta.story({
	...KeyboardFocus.input,
	globals: { theme: "dark" },
})
