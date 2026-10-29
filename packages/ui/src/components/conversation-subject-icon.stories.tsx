import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectGlazeBorders,
	glyphIn,
	Row,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { hueStyle, hueTone } from "@workspace/ui/components/hue-palette"
import { ConversationIcons } from "@workspace/ui/components/icons"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const meta = preview.meta({
	title: "Navigation/ConversationSubjectIcon",
	component: ConversationSubjectIcon,
	parameters: {
		docs: {
			description: {
				component:
					"The 40px rounded hexagon on the left of a conversation row: a fill pictogram from the curated list centred on a muted cell. The cell is decorative, the row's name carries the conversation.",
			},
		},
	},
})

const rgbOf = (hex: string) =>
	`rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`

const NEUTRAL_PAIR = {
	light: { ground: "#e5e5e5", glyph: "#525252" },
	dark: { ground: "#303030", glyph: "#d4d4d4" },
} as const

const expectedPairOf = (icon: HTMLElement, hue: number | undefined) => {
	const scheme = schemeOf(icon)
	if (hue === undefined) return NEUTRAL_PAIR[scheme]
	return {
		ground: hueTone(hue, scheme, "conversation-icon").hex,
		glyph: hueTone(hue, scheme, "conversation-icon-foreground").hex,
	}
}

const expectPair = async (canvasElement: HTMLElement, hue?: number) => {
	const icon = slotIn(canvasElement, "conversation-subject-icon")
	const cell = slotIn(icon, "outlined-hexagon-face")
	const expected = expectedPairOf(icon, hue)
	await expect(icon).toHaveAttribute("aria-hidden", "true")
	await expect(icon).toHaveAttribute(
		"data-hue",
		hue === undefined ? "" : String(hue),
	)
	await expect(getComputedStyle(cell).fill).toBe(rgbOf(expected.ground))
	await expect(getComputedStyle(icon).color).toBe(rgbOf(expected.glyph))
	const box = icon.getBoundingClientRect()
	await expect([box.width, box.height]).toEqual([40, 40])
	const pictogram = slotIn(
		icon,
		"conversation-subject-icon-pictogram",
	).getBoundingClientRect()
	await expect([pictogram.width, pictogram.height]).toEqual([20, 20])
	await expect(pictogram.left - box.left).toBe(10)
	await expect(pictogram.top - box.top).toBe(10)
}

const SPACE_HUE = BLOT_HUES.blue

const InsideSpaceHue = (props: ConversationSubjectIconProps) => (
	<span data-hue={SPACE_HUE} style={hueStyle(SPACE_HUE)}>
		<ConversationSubjectIcon {...props} />
	</span>
)

export const NoColour = meta.story({
	play: async ({ canvasElement }) => {
		await expectPair(canvasElement)
		await expect(
			glyphIn(canvasElement, ConversationIcons.MessageSquare),
		).not.toBeNull()
	},
})

export const NoColourDark = meta.story({
	globals: { theme: "dark" },
	play: ({ canvasElement }) => expectPair(canvasElement),
})

export const NoColourInsideSpaceHue = meta.story({
	render: (args) => <InsideSpaceHue {...args} />,
	play: ({ canvasElement }) => expectPair(canvasElement),
})

export const NoColourInsideSpaceHueDark = meta.story({
	globals: { theme: "dark" },
	render: (args) => <InsideSpaceHue {...args} />,
	play: ({ canvasElement }) => expectPair(canvasElement),
})

export const RedInsideSpaceHue = meta.story({
	args: { hue: BLOT_HUES.red },
	render: (args) => <InsideSpaceHue {...args} />,
	play: ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.red),
})

export const RedInsideSpaceHueDark = meta.story({
	args: { hue: BLOT_HUES.red },
	globals: { theme: "dark" },
	render: (args) => <InsideSpaceHue {...args} />,
	play: ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.red),
})

export const Red = meta.story({
	args: { hue: BLOT_HUES.red },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.red),
})

export const Yellow = meta.story({
	args: { hue: BLOT_HUES.yellow },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.yellow),
})

export const Green = meta.story({
	args: { hue: BLOT_HUES.green },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.green),
})

export const Cyan = meta.story({
	args: { hue: BLOT_HUES.cyan },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.cyan),
})

export const Blue = meta.story({
	args: { hue: BLOT_HUES.blue },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.blue),
})

export const Purple = meta.story({
	args: { hue: BLOT_HUES.purple },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.purple),
})

export const Pink = meta.story({
	args: { hue: BLOT_HUES.pink },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.pink),
})

export const Orange = meta.story({
	args: { hue: BLOT_HUES.orange },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.orange),
})

export const FreeHue = meta.story({
	args: { hue: 210 },
	play: async ({ canvasElement }) => expectPair(canvasElement, 210),
})

export const FreeHueDark = meta.story({
	args: { hue: 210 },
	globals: { theme: "dark" },
	play: async ({ canvasElement }) => expectPair(canvasElement, 210),
})

export const RedShieldKey = meta.story({
	args: { hue: BLOT_HUES.red, icon: "ShieldKey" },
	play: async ({ canvasElement }) => {
		await expectPair(canvasElement, BLOT_HUES.red)
		await expect(
			glyphIn(canvasElement, ConversationIcons.ShieldKey),
		).not.toBeNull()
	},
})

export const UnknownIconFallsBackToMessageSquare = meta.story({
	tags: ["test-only"],
	args: { icon: "Shield" },
	play: async ({ canvasElement }) => {
		await expect(
			glyphIn(canvasElement, ConversationIcons.MessageSquare),
		).not.toBeNull()
	},
})

export const RedShieldKeyDark = meta.story({
	args: { hue: BLOT_HUES.red, icon: "ShieldKey" },
	globals: { theme: "dark" },
	play: async ({ canvasElement }) => {
		await expectPair(canvasElement, BLOT_HUES.red)
		await expect(
			glyphIn(canvasElement, ConversationIcons.ShieldKey),
		).not.toBeNull()
	},
})

const BORDER_SIDES = [14, 24, 40, 64]

const BorderSides = () => (
	<Row>
		{BORDER_SIDES.map((side) => (
			<ConversationSubjectIcon
				hue={BLOT_HUES.red}
				icon="ShieldKey"
				key={side}
				side={side}
			/>
		))}
	</Row>
)

const expectBorderAtEverySize = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	const icons = slotsIn(canvasElement, "conversation-subject-icon")
	await expect(icons.map((icon) => icon.getBoundingClientRect().width)).toEqual(
		BORDER_SIDES,
	)
	for (const icon of icons)
		await expect(slotIn(icon, "outlined-hexagon-face").style.stroke).toBe("")
	await expectGlazeBorders(canvasElement, theme)
}

export const BorderAtEverySize = meta.story({
	render: () => <BorderSides />,
	parameters: {
		docs: {
			description: {
				story:
					"The C border at 14, 24, 40 and 64 over the flat pair of the cell: a translucent edge inside the outline and a white lip along the top from 20px up, the edge alone below. The image hairline is gone. Pick `BorderAtEverySizeDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectBorderAtEverySize(canvasElement, "light"),
})

export const BorderAtEverySizeDark = meta.story({
	globals: { theme: "dark" },
	render: () => <BorderSides />,
	parameters: {
		docs: {
			description: {
				story:
					"The same four sizes in the dark theme: a white edge and a dimmer lip over the dark pair.",
			},
		},
	},
	play: ({ canvasElement }) => expectBorderAtEverySize(canvasElement, "dark"),
})
