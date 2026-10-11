import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import {
	CATALOGUE_APPLICATIONS,
	DRAWN_MARK,
	HOSTILE_MARK,
	UNREACHABLE_MARK,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationMark",
	component: ApplicationMark,
	parameters: {
		docs: {
			description: {
				component:
					"The slot an application's mark sits in. A picture fills the slot corner to corner, with no surface behind it and no border. A drawing and the generic glyph sit inset on the muted surface inside the border, the drawing in the foreground ink and the glyph in the muted-foreground one.",
			},
		},
	},
	args: { mark: CATALOGUE_APPLICATIONS[0].mark },
})

export const WithMark = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mark handed as a picture. It fills the slot corner to corner: no inset, no surface behind it, no border.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const slot = slotIn(canvasElement, "application-mark")
		const picture = slot.querySelector("img")

		await expect(picture).not.toBeNull()
		await expect(slot).not.toHaveClass("border")
		await expect(slot).not.toHaveClass("bg-muted")
		await expect(
			Math.round((picture as HTMLImageElement).getBoundingClientRect().width),
		).toBe(Math.round(slot.getBoundingClientRect().width))
	},
})

export const WithoutMark = meta.story({
	args: { mark: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"An application with no mark at all. The generic glyph sits inset on the muted surface inside the border, in the muted-foreground ink.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const slot = slotIn(canvasElement, "application-mark")

		await expect(slot.querySelector("img")).toBeNull()
		await expect(slot.querySelector("svg")).not.toBeNull()
		await expect(slot).toHaveClass(
			"border",
			"border-border",
			"bg-muted",
			"text-muted-foreground",
		)
	},
})

export const WithDrawnMark = meta.story({
	args: { mark: DRAWN_MARK },
	parameters: {
		docs: {
			description: {
				story:
					"A mark handed as drawing markup goes inline, inset on the muted surface inside the border, in the foreground ink.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const slot = slotIn(canvasElement, "application-mark")

		await expect(slot.querySelector("img")).toBeNull()
		await expect(slot.querySelector("svg")).not.toBeNull()
		await expect(slot).toHaveClass(
			"border",
			"border-border",
			"bg-muted",
			"text-foreground",
		)
	},
})

export const WithHostileMark = meta.story({
	tags: ["test-only", "!autodocs"],
	args: { mark: HOSTILE_MARK },
	play: async ({ canvasElement }) => {
		const slot = slotIn(canvasElement, "application-mark")

		await expect(slot.querySelector("script")).toBeNull()
		await expect(slot.querySelector("[onload]")).toBeNull()
		await expect(slot.querySelector("svg")).not.toBeNull()
		await expect(slot).toHaveClass(
			"border",
			"border-border",
			"bg-muted",
			"text-muted-foreground",
		)
	},
})

export const WithUnreachableMark = meta.story({
	args: { mark: UNREACHABLE_MARK },
	parameters: {
		docs: {
			description: {
				story:
					"A mark whose address answers nothing. The image is dropped for the server glyph on the muted surface, the same slot an application with no mark at all gets.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const slot = slotIn(canvasElement, "application-mark")

		await waitFor(async () => {
			await expect(slot.querySelector("img")).toBeNull()
		})
		await expect(slot.querySelector("svg")).not.toBeNull()
		await expect(slot).toHaveClass("bg-muted", "text-muted-foreground")
	},
})

const expectSlotWidth = async (canvasElement: HTMLElement, width: number) => {
	await expect(
		slotIn(canvasElement, "application-mark").getBoundingClientRect().width,
	).toBe(width)
}

export const Medium = meta.story({
	args: { size: "md" },
	parameters: {
		docs: {
			description: {
				story:
					"The 36 slot of a settings row. Pick `Card` for the application card in the conversation.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 36),
})

export const Card = meta.story({
	args: { size: "card" },
	parameters: {
		docs: {
			description: {
				story:
					"The 32 slot of the application card, in an install bubble and on the receipt.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 32),
})

export const Small = meta.story({
	args: { size: "sm" },
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 28),
})

export const ExtraSmall = meta.story({
	args: { size: "xsm" },
	parameters: {
		docs: {
			description: {
				story:
					"The 24 slot of the application editor header, beside the name of the application being edited.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 24),
})

export const Inline = meta.story({
	args: { size: "inline" },
	parameters: {
		docs: {
			description: {
				story:
					"The 22 slot that sits on the line of a question, before its text, and the smallest slot the mark takes. Pick `ExtraSmall` for the slot above it.",
			},
		},
	},
	play: ({ canvasElement }) => expectSlotWidth(canvasElement, 22),
})
