import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	BOARD_SECTION_TINTS,
	BOARD_STICKY_COLOURS,
	BoardPalette,
	type BoardSectionTint,
	type BoardStickyColour,
} from "@workspace/ui/foundations/board-palette"
import {
	type ColorScheme,
	schemeOf,
} from "@workspace/ui/hooks/use-color-scheme"
import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"

const AA_TEXT_RATIO = 4.5
const STICKY_FOREGROUND = "#1a1a1a"

const STICKY_FILL: Record<BoardStickyColour, string> = {
	yellow: "#ffe58f",
	green: "#c2ebb4",
	pink: "#ffc9de",
	blue: "#bcd8ff",
	orange: "#ffd3a8",
}

type SectionPaint = {
	surface: string
	border: string
	titleChip: string
	titleForeground: string
}

const SECTION_PAINT: Record<
	ColorScheme,
	Record<BoardSectionTint, SectionPaint>
> = {
	light: {
		blue: {
			surface: "#eff4fb",
			border: "#d5e2f3",
			titleChip: "#dae6f6",
			titleForeground: "#1f3f6e",
		},
		purple: {
			surface: "#f3f0fa",
			border: "#e0d8f2",
			titleChip: "#e6dff6",
			titleForeground: "#45307a",
		},
	},
	dark: {
		blue: {
			surface: "#18202d",
			border: "#2a3a55",
			titleChip: "#24344f",
			titleForeground: "#b4ccf2",
		},
		purple: {
			surface: "#1f1b29",
			border: "#352d48",
			titleChip: "#2f2843",
			titleForeground: "#cdbdf5",
		},
	},
}

const channelsOf = (colour: string) =>
	(colour.match(/\d+(\.\d+)?/g) ?? []).map(Number)

const rgbOf = (colour: string): Rgb => {
	const [red, green, blue] = channelsOf(colour)
	return [red, green, blue]
}

const hexOf = (colour: string) =>
	`#${rgbOf(colour)
		.map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
		.join("")}`

const paintOf = (element: Element) => {
	const style = getComputedStyle(element)
	return {
		background: style.backgroundColor,
		border: style.borderTopColor,
		text: style.color,
		shadow: style.boxShadow,
	}
}

const compositeOver = (colour: string, ground: Rgb): Rgb => {
	const [red, green, blue, alpha = 1] = channelsOf(colour)
	return [red, green, blue].map(
		(channel, index) => alpha * channel + (1 - alpha) * ground[index],
	) as Rgb
}

const ratioOf = (element: Element, ground: Element = element) => {
	const background = rgbOf(paintOf(ground).background)
	const text = compositeOver(paintOf(element).text, background)
	return contrastRatio(background, text)
}

const expectSticky = async (sticky: HTMLElement) => {
	const colour = sticky.dataset.colour as BoardStickyColour
	const label = `${schemeOf(sticky)} ${colour} sticky`
	const { background, text, shadow } = paintOf(sticky)
	await expect(hexOf(background), `${label} fill`).toBe(STICKY_FILL[colour])
	await expect(shadow, `${label} shadow`).not.toBe("none")
	await expect(hexOf(text), `${label} text`).toBe(STICKY_FOREGROUND)
	await expect(
		ratioOf(sticky),
		`${label} text contrast`,
	).toBeGreaterThanOrEqual(AA_TEXT_RATIO)
	await expect(
		ratioOf(slotIn(sticky, "board-sticky-author"), sticky),
		`${label} author label contrast`,
	).toBeGreaterThanOrEqual(AA_TEXT_RATIO)
}

const expectSection = async (section: HTMLElement) => {
	const scheme = schemeOf(section)
	const tint = section.dataset.tint as BoardSectionTint
	const label = `${scheme} ${tint} section`
	const expected = SECTION_PAINT[scheme][tint]
	const title = slotIn(section, "board-section-title")
	const { background, border } = paintOf(section)
	const titlePaint = paintOf(title)
	await expect(hexOf(background), `${label} surface`).toBe(expected.surface)
	await expect(hexOf(border), `${label} border`).toBe(expected.border)
	await expect(hexOf(titlePaint.background), `${label} title chip`).toBe(
		expected.titleChip,
	)
	await expect(hexOf(titlePaint.text), `${label} title text`).toBe(
		expected.titleForeground,
	)
	await expect(
		ratioOf(title),
		`${label} title contrast`,
	).toBeGreaterThanOrEqual(AA_TEXT_RATIO)
}

const meta = preview.meta({
	title: "Foundations/Board Palette",
	component: BoardPalette,
	tags: ["test-only", "!autodocs"],
	globals: { theme_layout: "side-by-side" },
})

export const StickiesAndSectionsInBothThemes = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The five sticky colours and the two section tints of a board, light beside dark. A sticky paints the same in both themes, a section takes its dark tint. The play reads every fill, text and border through the stylesheet against the measured values, and holds sticky text and section titles at 4.5:1 or more.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const stickies = slotsIn(canvasElement, "board-sticky")
		const sections = slotsIn(canvasElement, "board-section")
		await expect(stickies).toHaveLength(BOARD_STICKY_COLOURS.length * 2)
		await expect(sections).toHaveLength(BOARD_SECTION_TINTS.length * 2)
		await expect(new Set(stickies.map(schemeOf))).toEqual(
			new Set(["light", "dark"]),
		)

		for (const sticky of stickies) await expectSticky(sticky)
		for (const section of sections) await expectSection(section)

		const inScheme = (scheme: ColorScheme) =>
			stickies.filter((sticky) => schemeOf(sticky) === scheme)
		const stickyPaintOf = (stickies: HTMLElement[]) =>
			stickies.map((sticky) => {
				const { background, text, shadow } = paintOf(sticky)
				const author = paintOf(slotIn(sticky, "board-sticky-author")).text
				return { background, text, shadow, author }
			})
		await expect(
			stickyPaintOf(inScheme("dark")),
			"Stickies paint the same in both themes",
		).toEqual(stickyPaintOf(inScheme("light")))
	},
})
