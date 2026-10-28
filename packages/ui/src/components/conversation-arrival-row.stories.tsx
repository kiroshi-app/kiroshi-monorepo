import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { botIdentityAvatars, slotIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	type ConversationArrivalInviter,
	ConversationArrivalRow,
} from "@workspace/ui/components/conversation-arrival-row"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import type { RosterBot } from "@workspace/ui/components/roster"

const MARLOW: RosterBot = {
	id: "bot_5d1e92",
	name: "Marlow",
	blot: BLOT_HUES.purple,
}
const HAPPY: RosterBot = {
	id: "bot_3a7c48",
	name: "Happy",
	blot: BLOT_HUES.orange,
}
const LONG_NAMED: RosterBot = {
	id: "bot_6f0b27",
	name: "Lighthousekeeperofthenorthshoreandthesouthernbayharbourwatchtower",
	blot: BLOT_HUES.green,
}
const LONG_NAMED_INVITER: RosterBot = {
	id: "bot_0c9e14",
	name: "Harbourmasterofthewesternquay",
	blot: BLOT_HUES.blue,
}

const INVITED_BY_PERSON: ConversationArrivalInviter = { kind: "person" }

const lineRectsOf = (sentence: HTMLElement, name: string) => {
	const text = sentence.firstChild
	const start = sentence.textContent?.indexOf(name) ?? -1

	if (!text || start < 0) throw new Error(`The sentence does not name ${name}`)

	const range = document.createRange()
	range.setStart(text, start)
	range.setEnd(text, start + name.length)
	return range.getClientRects()
}

const meta = preview.meta({
	title: "Conversation/Message/ConversationArrivalRow",
	component: ConversationArrivalRow,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The transcript line recording that a companion joined the conversation. Whether the person or another companion did the inviting, the fact reads in one single shape: a small face and one muted sentence, centered, never a bubble. A mention inside a message is not this trace. The row draws no gap and no inline padding: the transcript stack around it owns both.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-120">
				<Story />
			</div>
		),
	],
	args: {
		bot: MARLOW,
		inviter: INVITED_BY_PERSON,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the person mentioned a companion and sent: that companion arrived on the person's invitation. Check that the sentence names the arriving companion and you, and that the face beside it stays out of assistive technology. Pick `InvitedByAgent` when a companion did the inviting. `apps/app/src/components/thread-screen.tsx:788` renders it with the person inviter `apps/app/src/components/thread-screen.tsx:770` builds when the arrival carries no inviting companion.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("Marlow joined this conversation, invited by you"),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
		await expect(
			botIdentityAvatars(canvasElement)[0].closest("[aria-hidden]"),
		).not.toBeNull()
	},
})

export const InvitedByAgent = meta.story({
	args: { bot: MARLOW, inviter: { kind: "companion", bot: HAPPY } },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a companion brought another one in. Check that the sentence names the arriving companion and the inviting companion, that only the arriving face is drawn, and that the line is the same size and colour as `Default`. `apps/app/src/components/thread-screen.tsx:788` renders it with the companion inviter `apps/app/src/components/thread-screen.tsx:773` builds.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("Marlow joined this conversation, invited by Happy"),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(1)
	},
})

export const InTranscript = meta.story({
	render: (args) => (
		<div className="flex flex-col gap-4 px-7" data-testid="transcript-stack">
			<MessageBubble align="end" variant="solid">
				<MessageBubbleContent>
					Can someone check the release notes?
				</MessageBubbleContent>
			</MessageBubble>
			<ConversationArrivalRow {...args} />
			<MessageBubble align="start" variant="soft">
				<MessageBubbleContent>On it, reading them now.</MessageBubbleContent>
			</MessageBubble>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see an arrival interleaved with messages in the transcript stack. Check that the line sits between the two bubbles, centered on the transcript width, carries no bubble of its own, and adds no space beyond the stack gap. Pick `Default` for the row alone. `apps/app/src/components/thread-screen.tsx:788` places the row between the runs it landed between.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const stack = canvas.getByTestId("transcript-stack")
		const row = slotIn(canvasElement, "conversation-arrival-row")
		const [before, after] = Array.from(
			stack.querySelectorAll<HTMLElement>('[data-slot="message-bubble"]'),
		)
		const face = row.firstElementChild as HTMLElement
		const sentence = row.lastElementChild as HTMLElement
		const drawnCenter =
			(face.getBoundingClientRect().left +
				sentence.getBoundingClientRect().right) /
			2
		const rowBox = row.getBoundingClientRect()

		await expect(row.querySelector('[data-slot="message-bubble"]')).toBeNull()
		await expect(row.closest('[data-slot="message-bubble"]')).toBeNull()
		await expect(before.getBoundingClientRect().bottom).toBeLessThan(rowBox.top)
		await expect(rowBox.bottom).toBeLessThan(after.getBoundingClientRect().top)
		await expect(
			Math.abs(drawnCenter - (rowBox.left + rowBox.right) / 2),
		).toBeLessThan(1)
		await expect(getComputedStyle(row).marginBlock).toBe("0px")
	},
})

export const LongContent = meta.story({
	args: {
		bot: LONG_NAMED,
		inviter: { kind: "companion", bot: LONG_NAMED_INVITER },
	},
	decorators: [
		(Story) => (
			<div className="w-80" data-testid="narrow-frame">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when both companions carry long unbreakable names in a 320 pixel wide transcript. A name too long for one line is not shortened and not clamped: it breaks wherever the line ends and carries on onto the next one, so the sentence is always read in full. Check that the arriving name runs across more than one line, that no line reaches past the sentence, and that nothing scrolls sideways. Pick `InvitedByAgent` for nominal names. The names come from the store through `apps/app/src/components/thread-screen.tsx:788`, which shortens nothing.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const frame = canvas.getByTestId("narrow-frame")
		const row = slotIn(canvasElement, "conversation-arrival-row")
		const sentence = row.lastElementChild as HTMLElement
		const sentenceBox = sentence.getBoundingClientRect()
		const drawnRow = getComputedStyle(row)
		const lineHeight = Number.parseFloat(getComputedStyle(sentence).lineHeight)

		await expect(sentenceBox.height).toBeGreaterThan(lineHeight)
		await expect(drawnRow.overflowWrap).toBe("anywhere")
		await expect(drawnRow.textOverflow).toBe("clip")
		await expect(drawnRow.webkitLineClamp).toBe("none")
		await expect(lineRectsOf(sentence, LONG_NAMED.name).length).toBeGreaterThan(
			1,
		)
		for (const line of lineRectsOf(sentence, sentence.textContent ?? "")) {
			await expect(line.left).toBeGreaterThanOrEqual(sentenceBox.left)
			await expect(line.right).toBeLessThanOrEqual(sentenceBox.right)
		}
		await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth)
		await expect(sentence.textContent).toContain(LONG_NAMED.name)
		await expect(sentence.textContent).toContain(LONG_NAMED_INVITER.name)
	},
})
