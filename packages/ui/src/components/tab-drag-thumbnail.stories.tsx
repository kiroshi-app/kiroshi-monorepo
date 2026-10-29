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
	await expect(getComputedStyle(card).boxShadow).toBe(
		tokenStyleIn(card, "shadow-tab-thumbnail", "boxShadow"),
	)
	await expect(getComputedStyle(header).backgroundColor).toBe(
		tokenStyleIn(card, "bg-tab-thumbnail-header", "backgroundColor"),
	)
	await expect(getComputedStyle(header).backgroundColor).toBe(
		card.closest(".dark")
			? "rgb(16, 16, 17)"
			: tokenStyleIn(card, "bg-background", "backgroundColor"),
	)
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

const playNoCompanion = async ({ canvasElement }: ThumbnailPlayContext) => {
	const header = slotIn(thumbnailIn(canvasElement), "tab-drag-thumbnail-header")
	await expect(header.children).toHaveLength(2)
	await expect(header).toHaveTextContent(/^Release notes for 2\.4$/)
}

export const T14NoCompanion = meta.story({
	args: { companionName: "", composerPlaceholder: "Message" },
	parameters: {
		docs: {
			description: {
				story:
					"1.4, light: a tab with no agent behind it. Check the header ends on the title, with no dot and no agent name after it.",
			},
		},
	},
	play: playNoCompanion,
})

export const T14NoCompanionDark = meta.story({
	args: { companionName: "", composerPlaceholder: "Message" },
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"1.4, dark: the header with no agent. Pick `T14NoCompanion` for the light theme.",
			},
		},
	},
	play: playNoCompanion,
})

const UNBREAKABLE_RUN_ID =
	"9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c4e6f8a0b2d4f6a8c0e2a4c6e8f0a2b4d6f89f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c4e6f8"

const LONG_MESSAGES: TabDragThumbnailMessage[] = [
	{
		id: "ask",
		author: "user",
		text: "Can you draft the release notes for 2.4 from the merged pull requests? Group them by area and keep the internal refactors out.",
	},
	{
		id: "draft",
		author: "companion",
		text: "Here's a first pass. Sync: the initial sync of a large Space now finishes in a third of the time, and resuming after sleep no longer replays the whole history. Fixes: the sidebar keeps its width after a restart, pasted images keep their names, and a stalled upload now shows its retry. Settings: a new switch mutes notifications while a call is running.",
	},
	{
		id: "run",
		author: "user",
		text: `The build for the notes failed, run ${UNBREAKABLE_RUN_ID}`,
	},
	{
		id: "reply",
		author: "companion",
		text: "That run stopped on the changelog check: two pull requests had no release label, so the generator refused to place them. I labelled both as fixes and started the run again. It passed, and the notes now list all eleven changes. Want me to tighten the wording before you share it?",
	},
]

const playLongMessage = async ({ canvasElement }: ThumbnailPlayContext) => {
	const card = thumbnailIn(canvasElement)
	const header = slotIn(card, "tab-drag-thumbnail-header")
	const body = slotIn(card, "tab-drag-thumbnail-body")
	const composer = slotIn(card, "tab-drag-thumbnail-composer")
	const messages = slotsIn(card, "tab-drag-thumbnail-message")
	const cardBox = card.getBoundingClientRect()
	const headerBox = header.getBoundingClientRect()
	const bodyBox = body.getBoundingClientRect()
	const composerBox = composer.getBoundingClientRect()
	const firstBox = messages[0].getBoundingClientRect()
	const latest = messages[messages.length - 1]
	const latestBox = latest.getBoundingClientRect()

	await expect(getComputedStyle(body).overflow).toBe("hidden")
	await expect(firstBox.top).toBeLessThan(bodyBox.top)
	await expect(bodyBox.top).toBeGreaterThanOrEqual(headerBox.bottom)
	for (const x of [0.1, 0.5, 0.9]) {
		const hit = document.elementFromPoint(
			headerBox.left + headerBox.width * x,
			headerBox.top + headerBox.height / 2,
		)
		await expect(header.contains(hit)).toBe(true)
	}
	await expect(Math.round(bodyBox.bottom - composerBox.bottom)).toBe(18)
	await expect(latestBox.top).toBeGreaterThanOrEqual(bodyBox.top)
	await expect(latestBox.bottom).toBeLessThanOrEqual(composerBox.top)
	await expect(latest).toHaveTextContent(/tighten the wording/)

	const unbreakable = messages[2]
	await expect(unbreakable).toHaveTextContent(UNBREAKABLE_RUN_ID)
	await expect(unbreakable.getBoundingClientRect().width).toBeLessThanOrEqual(
		290,
	)
	await expect(unbreakable.getBoundingClientRect().height).toBeGreaterThan(
		3 * 14,
	)
	for (const message of messages) {
		const box = message.getBoundingClientRect()
		await expect(message.scrollWidth).toBeLessThanOrEqual(message.clientWidth)
		await expect(box.left).toBeGreaterThanOrEqual(cardBox.left)
		await expect(box.right).toBeLessThanOrEqual(cardBox.right)
	}
}

export const T14LongMessage = meta.story({
	args: { messages: LONG_MESSAGES },
	parameters: {
		docs: {
			description: {
				story:
					"1.4, light: a Conversation taller than the mini window, with a run id that has no break. Check the oldest message cut at the top of the body, the header untouched, the latest reply and the composer anchored at the bottom, and the run id wrapped inside its bubble.",
			},
		},
	},
	play: playLongMessage,
})

export const T14LongMessageDark = meta.story({
	args: { messages: LONG_MESSAGES },
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"1.4, dark: the overflowing Conversation. Pick `T14LongMessage` for the light theme.",
			},
		},
	},
	play: playLongMessage,
})
