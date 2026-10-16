import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { glyphIn, slotIn } from "@workspace/storybook/story-utils"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
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

const expectPair = async (canvasElement: HTMLElement, token: string) => {
	const icon = slotIn(canvasElement, "conversation-subject-icon")
	const cell = slotIn(icon, "outlined-hexagon-face")
	await expect(icon).toHaveAttribute("aria-hidden", "true")
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
		await expectPair(canvasElement, "--conversation-icon")
		await expect(
			glyphIn(canvasElement, ConversationIcons.MessageSquare),
		).not.toBeNull()
	},
})

export const Red = meta.story({
	args: { color: "red" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-red"),
})

export const Yellow = meta.story({
	args: { color: "yellow" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-yellow"),
})

export const Green = meta.story({
	args: { color: "green" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-green"),
})

export const Cyan = meta.story({
	args: { color: "cyan" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-cyan"),
})

export const Blue = meta.story({
	args: { color: "blue" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-blue"),
})

export const Purple = meta.story({
	args: { color: "purple" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-purple"),
})

export const Pink = meta.story({
	args: { color: "pink" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-pink"),
})

export const Orange = meta.story({
	args: { color: "orange" },
	play: async ({ canvasElement }) =>
		expectPair(canvasElement, "--conversation-icon-orange"),
})

export const RedShieldKey = meta.story({
	args: { color: "red", icon: "ShieldKey" },
	play: async ({ canvasElement }) => {
		await expectPair(canvasElement, "--conversation-icon-red")
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
	args: { color: "red", icon: "ShieldKey" },
	globals: { theme: "dark" },
	play: async ({ canvasElement }) => {
		const icon = slotIn(canvasElement, "conversation-subject-icon")
		await expect(
			getComputedStyle(slotIn(icon, "outlined-hexagon-face")).fill,
		).toBe("rgb(86, 61, 51)")
		await expect(getComputedStyle(icon).color).toBe("rgb(226, 177, 158)")
	},
})
