import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { type HueRole, hueTone } from "@workspace/ui/components/hue-palette"
import {
	contrastRatio,
	type HueTheme,
	isInSrgb,
} from "@workspace/ui/components/hue-recipe"
import { HueRecipeBoard } from "@workspace/ui/foundations/hue-recipe-board"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const PRESET_HUES = [42, 82, 186, 257]
const ARBITRARY_HUES = [7, 150, 320]
const HUES = [...PRESET_HUES, ...ARBITRARY_HUES]

const GAMUT_ROLES: HueRole[] = ["bubble", "accent", "avatar-ink"]

const hexOfComputed = (colour: string) => {
	const channels =
		colour
			.match(/\d+(\.\d+)?/g)
			?.slice(0, 3)
			.map(Number) ?? []
	return `#${channels
		.map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
		.join("")}`
}

const backgroundOf = (element: Element) =>
	hexOfComputed(getComputedStyle(element).backgroundColor)

const textOf = (element: Element) =>
	hexOfComputed(getComputedStyle(element).color)

const expectRow = async (row: HTMLElement) => {
	const hue = Number(row.dataset.hue)
	const theme: HueTheme = schemeOf(row)
	const label = `${theme} ${hue}`
	const bubble = slotIn(row, "hue-recipe-bubble")
	const accent = slotIn(row, "hue-recipe-accent")
	const accentFloorAgainst = backgroundOf(accent)

	for (const role of GAMUT_ROLES) {
		const tone = hueTone(hue, theme, role)
		await expect(
			isInSrgb(tone.lightness, tone.chroma, tone.hue),
			`${label} ${role} out of sRGB`,
		).toBe(true)
	}

	await expect(backgroundOf(bubble), `${label} bubble`).toBe(
		hueTone(hue, theme, "bubble").hex,
	)
	await expect(textOf(accent), `${label} accent`).toBe(
		hueTone(hue, theme, "accent").hex,
	)
	await expect(
		backgroundOf(slotIn(row, "hue-recipe-avatar-ink")),
		`${label} avatar ink`,
	).toBe(hueTone(hue, theme, "avatar-ink").hex)
	await expect(
		backgroundOf(slotIn(row, "hue-recipe-new-line")),
		`${label} New line`,
	).toBe(hueTone(hue, theme, "new-line").hex)

	await expect(
		contrastRatio(backgroundOf(bubble), textOf(bubble)),
		`${label} bubble text`,
	).toBeGreaterThanOrEqual(7)
	await expect(
		contrastRatio(textOf(accent), accentFloorAgainst),
		`${label} accent on card`,
	).toBeGreaterThanOrEqual(4.5)
}

const meta = preview.meta({
	title: "Foundations/Hue Recipe",
	component: HueRecipeBoard,
	tags: ["test-only", "!autodocs"],
	globals: { theme_layout: "side-by-side" },
	args: { hues: HUES },
	parameters: {
		docs: {
			description: {
				component:
					"Every colour a Space, a conversation or a companion paints, derived from one hue through the tone table in tokens.json: the bubble and its text, the accent on the card, the New line and the avatar ink on its ground, light and dark.",
			},
		},
	},
})

export const PresetAndArbitraryHues = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Red 42, yellow 82, cyan 186 and blue 257, then 7, 150 and 320, light beside dark. Check that yellow reads as yellow rather than olive, that cyan keeps its hue with less chroma rather than turning grey or green, and that every bubble and accent holds its contrast floor. The play paints each row through the stylesheet and checks it against the recipe: inside sRGB, bubble text at 7:1 or more, accent at 4.5:1 or more on the card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = slotsIn(canvasElement, "hue-recipe-row")
		await expect(rows).toHaveLength(HUES.length * 2)
		await expect(new Set(rows.map(schemeOf))).toEqual(
			new Set(["light", "dark"]),
		)
		for (const row of rows) await expectRow(row)
	},
})
