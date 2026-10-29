import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	TabDragThumbnail,
	type TabDragThumbnailMessage,
} from "@workspace/ui/components/tab-drag-thumbnail"

const DARK = { theme: "dark" }

const MESSAGES: TabDragThumbnailMessage[] = [
	{
		id: "ask",
		author: "user",
		text: "Can you draft the release notes for 2.4 from the merged pull requests?",
	},
	{
		id: "reply",
		author: "companion",
		text: "Here's a first pass: the sync speedup up top, then three fixes and the new notification setting. Want me to tighten the wording before you share it?",
	},
]

const meta = preview.meta({
	title: "Navigation/TabDragThumbnail",
	component: TabDragThumbnail,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The tab drawn as a mini window while it is dragged out of the title bar: its header with the tab icon, title and agent name, the last messages anchored to the bottom, and the composer. Size comes from props, half the window it leaves. Not allowed greys it out where the drop would be refused.",
			},
		},
	},
	args: {
		title: "Release notes for 2.4",
		icon: <Icons.Conversations />,
		companionName: "Ada",
		messages: MESSAGES,
		composerPlaceholder: "Message Ada",
		width: 480,
		height: 300,
	},
})

type ThumbnailPlayContext = { canvasElement: HTMLElement }

const thumbnailIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "tab-drag-thumbnail")

const expectThumbnailAnatomy = async (canvasElement: HTMLElement) => {
	const card = thumbnailIn(canvasElement)
	const header = slotIn(card, "tab-drag-thumbnail-header")
	const body = slotIn(card, "tab-drag-thumbnail-body")
	const composer = slotIn(card, "tab-drag-thumbnail-composer")
	const [bubble, reply] = slotsIn(card, "tab-drag-thumbnail-message")
	const box = card.getBoundingClientRect()

	await expect([box.width, box.height]).toEqual([480, 300])
	await expect(getComputedStyle(card).borderRadius).toBe("10px")
	await expect(getComputedStyle(card).overflow).toBe("hidden")
	await expect(header.getBoundingClientRect().height).toBe(32)
	await expect(getComputedStyle(header).borderBottomWidth).toBe("1px")
	await expect(getComputedStyle(body).justifyContent).toBe("flex-end")
	await expect(getComputedStyle(body).rowGap).toBe("9px")
	await expect(
		Math.round(
			body.getBoundingClientRect().bottom -
				composer.getBoundingClientRect().bottom,
		),
	).toBe(18)
	await expect(composer.getBoundingClientRect().height).toBe(30)
	await expect(composer).toHaveTextContent("Message Ada")
	await expect(getComputedStyle(bubble).backgroundColor).toBe(
		tokenStyleIn(card, "bg-user-bubble", "backgroundColor"),
	)
	await expect(getComputedStyle(bubble).borderRadius).toBe("11px")
	await expect(Math.round(bubble.getBoundingClientRect().right)).toBe(
		Math.round(body.getBoundingClientRect().right - 22),
	)
	await expect(bubble.getBoundingClientRect().width).toBeLessThanOrEqual(290)
	await expect(reply.getBoundingClientRect().width).toBeLessThanOrEqual(330)
	for (const element of [card, header, body, bubble, reply, composer])
		await expect(getComputedStyle(element).transitionDuration).toBe("0s")
	return card
}

const playThumbnail = async ({ canvasElement }: ThumbnailPlayContext) => {
	const card = await expectThumbnailAnatomy(canvasElement)
	await expect(card).toHaveAttribute("data-state", "allowed")
	await expect(getComputedStyle(card).opacity).toBe("1")
	await expect(getComputedStyle(card).filter).toBe("none")
}

export const T14Thumbnail = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"1.4, light: the tab dragged past the threshold, drawn as a 480 by 300 mini window. Check the 32px header with the icon, the title, a dot and the agent name, the user bubble in the Space colour against the end, the reply under it, the composer 18px off the bottom, and no colour on a transition.",
			},
		},
	},
	play: playThumbnail,
})

export const T14ThumbnailDark = meta.story({
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"1.4, dark: the mini window on the dark header and body, its ring and shadow. Pick `T14Thumbnail` for the light theme.",
			},
		},
	},
	play: playThumbnail,
})

const playNotAllowed = async ({ canvasElement }: ThumbnailPlayContext) => {
	const card = await expectThumbnailAnatomy(canvasElement)
	await expect(card).toHaveAttribute("data-state", "not-allowed")
	await expect(getComputedStyle(card).opacity).toBe("0.75")
	await expect(getComputedStyle(card).filter).toBe("grayscale(1)")
}

export const T31NotAllowed = meta.story({
	args: { isNotAllowed: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"3.1, light: the mini window over a place that refuses the drop. Check the same card at three quarters opacity, fully greyed, and marked not allowed for the app to set the cursor.",
			},
		},
	},
	play: playNotAllowed,
})

export const T31NotAllowedDark = meta.story({
	args: { isNotAllowed: true },
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"3.1, dark: the greyed mini window. Pick `T31NotAllowed` for the light theme.",
			},
		},
	},
	play: playNotAllowed,
})
