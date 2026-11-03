import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	TITLE_BAR_TAB_CHIP_DRAG_SIZE,
	TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH,
	TitleBarTabChip,
} from "@workspace/ui/components/title-bar-tab-chip"

const DARK = { theme: "dark" }

const LONG_TITLE =
	"Quarterly pricing review with the finance team and every regional lead"

const meta = preview.meta({
	title: "Navigation/TitleBarTabChip",
	component: TitleBarTabChip,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component: `One tab lifted out of the title bar, drawn alone: its icon, its title on one line up to ${TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH}px, and a decorative close glyph, on the menu surface with its ring and shadow. The tear-off ghost follows the pointer with it; the strip draws an incoming tab through it too.`,
			},
		},
	},
	args: {
		title: "Pricing",
		icon: <Icons.Conversations />,
	},
})

type ChipPlayContext = { canvasElement: HTMLElement }

const expectChipAnatomy = async (canvasElement: HTMLElement) => {
	const chip = slotIn(canvasElement, "title-bar-tab-chip")
	const title = slotIn(chip, "title-bar-tab-chip-title")
	const close = slotIn(chip, "title-bar-tab-chip-close")
	const style = getComputedStyle(chip)

	await expect(style.backgroundColor).toBe(
		tokenStyleIn(chip, "bg-title-bar-menu", "backgroundColor"),
	)
	await expect(style.backgroundColor).toBe(
		chip.closest(".dark") ? "rgb(24, 24, 26)" : "rgb(255, 255, 255)",
	)
	await expect(style.boxShadow).toBe(
		tokenStyleIn(
			chip,
			"shadow-tab-chip ring-1 ring-title-bar-menu-border",
			"boxShadow",
		),
	)
	await expect(style.borderRadius).toBe("8px")
	await expect([style.paddingInlineStart, style.paddingInlineEnd]).toEqual([
		"7px",
		"4px",
	])
	await expect(style.columnGap).toBe("6px")
	await expect(chip.getBoundingClientRect().height).toBe(
		TITLE_BAR_TAB_CHIP_DRAG_SIZE.height,
	)
	await expect(getComputedStyle(title).whiteSpace).toBe("nowrap")
	await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
	await expect(close).toHaveAttribute("aria-hidden", "true")
	await expect(close.getBoundingClientRect().width).toBe(18)
	await expect(close.querySelector("svg")?.getBoundingClientRect().width).toBe(
		12,
	)
	return { chip, title }
}

const playShortTitle = async ({ canvasElement }: ChipPlayContext) => {
	const { chip, title } = await expectChipAnatomy(canvasElement)
	await expect(chip).toHaveAttribute("data-state", "allowed")
	await expect(title.scrollWidth).toBe(title.clientWidth)
	await expect(chip.getBoundingClientRect().width).toBeLessThan(
		TITLE_BAR_TAB_CHIP_DRAG_SIZE.width,
	)
}

const expectLongTitleChip = async (canvasElement: HTMLElement) => {
	const { chip, title } = await expectChipAnatomy(canvasElement)
	const { width, height } = chip.getBoundingClientRect()
	await expect(title.getBoundingClientRect().width).toBe(
		TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH,
	)
	await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
	await expect({ width, height }).toEqual(TITLE_BAR_TAB_CHIP_DRAG_SIZE)
	return chip
}

const playLongTitle = async ({ canvasElement }: ChipPlayContext) => {
	const chip = await expectLongTitleChip(canvasElement)
	await expect(chip).toHaveAttribute("data-state", "allowed")
	await expect(getComputedStyle(chip).opacity).toBe("1")
	await expect(getComputedStyle(chip).filter).toBe("none")
}

const playNotAllowed = async ({ canvasElement }: ChipPlayContext) => {
	const chip = await expectLongTitleChip(canvasElement)
	await expect(chip).toHaveAttribute("data-state", "not-allowed")
	await expect(getComputedStyle(chip).opacity).toBe("0.75")
	await expect(getComputedStyle(chip).filter).toBe("grayscale(1)")
}

export const ShortTitle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Tear-off 2, light: a short title, the chip hugging it. Check the white menu surface, its ring and soft shadow, and the close glyph at the end.",
			},
		},
	},
	play: playShortTitle,
})

export const ShortTitleDark = meta.story({
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"Tear-off 2, dark: a short title on the #18181A surface. Pick `ShortTitle` for the light theme.",
			},
		},
	},
	play: playShortTitle,
})

export const LongTitle = meta.story({
	args: { title: LONG_TITLE },
	parameters: {
		docs: {
			description: {
				story: `Tear-off 2, light: a title past ${TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH}px, cut with an ellipsis, the chip ${TITLE_BAR_TAB_CHIP_DRAG_SIZE.width}px wide.`,
			},
		},
	},
	play: playLongTitle,
})

export const LongTitleDark = meta.story({
	args: { title: LONG_TITLE },
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story: `Tear-off 2, dark: the chip as the artboard draws it, a title past ${TITLE_BAR_TAB_CHIP_TITLE_MAX_WIDTH}px cut with an ellipsis, ${TITLE_BAR_TAB_CHIP_DRAG_SIZE.width}px wide. Pick \`LongTitle\` for the light theme.`,
			},
		},
	},
	play: playLongTitle,
})

export const NotAllowed = meta.story({
	args: { title: LONG_TITLE, isNotAllowed: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Tear-off 4, light: the chip over a window of another Space, where the drop would be refused. Check it at 75 percent opacity and fully grey, every other property as in `LongTitle`.",
			},
		},
	},
	play: playNotAllowed,
})

export const NotAllowedDark = meta.story({
	args: { title: LONG_TITLE, isNotAllowed: true },
	globals: DARK,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"Tear-off 4, dark: the chip as the artboard draws it over a window of another Space, at 75 percent opacity and fully grey. Pick `NotAllowed` for the light theme.",
			},
		},
	},
	play: playNotAllowed,
})
