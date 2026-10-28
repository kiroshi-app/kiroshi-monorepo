import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectGlazeBorders,
	glyphIn,
	Row,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"
import { ConversationIcons } from "@workspace/ui/components/icons"

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

const expectNeutralMessageSquare = async (canvasElement: HTMLElement) => {
	const icon = slotIn(canvasElement, "conversation-subject-icon")
	const cell = slotIn(icon, "outlined-hexagon-face")
	await expect(icon).toHaveAttribute("aria-hidden", "true")
	await expect(icon).not.toHaveAttribute("data-hue")
	await expect(getComputedStyle(cell).fill).toBe(
		resolvedColourOf("--conversation-icon", icon),
	)
	await expect(getComputedStyle(icon).color).toBe(
		resolvedColourOf("--conversation-icon-foreground", icon),
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
	await expect(
		glyphIn(canvasElement, ConversationIcons.MessageSquare),
	).not.toBeNull()
}

export const NoColour = meta.story({
	play: ({ canvasElement }) => expectNeutralMessageSquare(canvasElement),
})

export const NoColourDark = meta.story({
	globals: { theme: "dark" },
	play: ({ canvasElement }) => expectNeutralMessageSquare(canvasElement),
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

const BORDER_SIDES = [14, 24, 40, 64]

const BorderSides = () => (
	<Row>
		{BORDER_SIDES.map((side) => (
			<ConversationSubjectIcon icon="ShieldKey" key={side} side={side} />
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
