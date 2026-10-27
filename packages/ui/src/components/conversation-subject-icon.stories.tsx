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
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { hueTone } from "@workspace/ui/components/hue-palette"
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

const resolvedColourOf = (token: string, host: Element) => {
	const probe = document.createElement("span")
	probe.style.color = `var(${token})`
	host.append(probe)
	const colour = getComputedStyle(probe).color
	probe.remove()
	return colour
}

const expectPair = async (canvasElement: HTMLElement, hue?: number) => {
	const icon = slotIn(canvasElement, "conversation-subject-icon")
	const cell = slotIn(icon, "outlined-hexagon-face")
	const token =
		hue === undefined
			? "--conversation-icon"
			: `--hue-${schemeOf(icon)}-conversation-icon`
	await expect(icon).toHaveAttribute("aria-hidden", "true")
	if (hue !== undefined)
		await expect(icon).toHaveAttribute("data-hue", String(hue))
	await expect(getComputedStyle(cell).fill).toBe(resolvedColourOf(token, icon))
	await expect(getComputedStyle(icon).color).toBe(
		resolvedColourOf(`${token}-foreground`, icon),
	)
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

export const NoColour = meta.story({
	play: async ({ canvasElement }) => {
		await expectPair(canvasElement)
		await expect(
			glyphIn(canvasElement, ConversationIcons.MessageSquare),
		).not.toBeNull()
	},
})

export const Red = meta.story({
	args: { color: "red" },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.red),
})

export const Yellow = meta.story({
	args: { color: "yellow" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.yellow),
})

export const Green = meta.story({
	args: { color: "green" },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.green),
})

export const Cyan = meta.story({
	args: { color: "cyan" },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.cyan),
})

export const Blue = meta.story({
	args: { color: "blue" },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.blue),
})

export const Purple = meta.story({
	args: { color: "purple" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.purple),
})

export const Pink = meta.story({
	args: { color: "pink" },
	play: async ({ canvasElement }) => expectPair(canvasElement, BLOT_HUES.pink),
})

export const Orange = meta.story({
	args: { color: "orange" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, BLOT_HUES.orange),
})

export const RedShieldKey = meta.story({
	args: { color: "red", icon: "ShieldKey" },
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

const rgbOf = (hex: string) =>
	`rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`

export const RedShieldKeyDark = meta.story({
	args: { color: "red", icon: "ShieldKey" },
	globals: { theme: "dark" },
	play: async ({ canvasElement }) => {
		const icon = slotIn(canvasElement, "conversation-subject-icon")
		await expect(
			getComputedStyle(slotIn(icon, "outlined-hexagon-face")).fill,
		).toBe(rgbOf(hueTone(BLOT_HUES.red, "dark", "conversation-icon").hex))
		await expect(getComputedStyle(icon).color).toBe(
			rgbOf(hueTone(BLOT_HUES.red, "dark", "conversation-icon-foreground").hex),
		)
	},
})

const BORDER_SIDES = [14, 24, 40, 64]

const BorderSides = () => (
	<Row>
		{BORDER_SIDES.map((side) => (
			<ConversationSubjectIcon
				color="red"
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
