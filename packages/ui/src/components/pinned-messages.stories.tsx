import { useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	opaque,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
	type PinnedMessagesProps,
} from "@workspace/ui/components/pinned-messages"

const TITLE = "Pinned messages"

const TRIGGER = /^Pinned messages/

const BOT = <BotIdentityAvatar name="Skippy" size={PINNED_AVATAR_SIZE} />

const READER = <InitialsAvatar name="You" size={PINNED_AVATAR_SIZE} />

const MESSAGES: PinnedMessage[] = [
	{
		id: "m-1",
		author: "Skippy",
		avatar: BOT,
		timestamp: "06/12/2025, 13:58",
		excerpt:
			"The migration runs inside one transaction, so a failure rolls back every statement.",
	},
	{
		id: "m-2",
		author: "You",
		avatar: READER,
		timestamp: "18/12/2025, 10:33",
		excerpt: "Then what happens to the invites table?",
	},
]

const OVERFLOWING: PinnedMessage[] = [
	{
		id: "m-long",
		author: "Skippy",
		avatar: BOT,
		timestamp: "18/12/2025, 10:41",
		excerpt:
			"The transcript keeps every turn of the run, so replaying it costs nothing beyond the read. Each turn carries the prompt that opened it, the tools it called and the answer it settled on, and the reader can walk back through any of them without asking the runtime for anything. Pinning one is a bookmark over that record and never a copy of it, which is why unpinning takes nothing away from the conversation itself.",
	},
]

const isReachable = (element: Element) => {
	const { left, top, width, height } = element.getBoundingClientRect()
	const hit = document.elementFromPoint(left + width / 2, top + height / 2)
	return Boolean(hit && element.contains(hit))
}

const expectHeaderRestColour = async (
	canvasElement: HTMLElement,
	trigger: HTMLElement,
) => {
	const header = canvasElement.querySelector("[data-slot='app-header']")
	const icon = trigger.querySelector("svg")
	const restColour = header ? getComputedStyle(header).color : null

	await expect(icon).not.toBeNull()
	await expect(restColour).not.toBeNull()
	await expect(getComputedStyle(trigger).color).toBe(restColour)
	await expect(icon && getComputedStyle(icon).color).toBe(restColour)
	await expect(getComputedStyle(trigger).opacity).toBe("1")
	await expect(icon && getComputedStyle(icon).opacity).toBe("1")
}

const ChatHeader = (props: PinnedMessagesProps) => (
	<AppHeader leading="Skippy" trailing={<PinnedMessages {...props} />} />
)

const PinnedHeader = ({ initial }: { initial: PinnedMessage[] }) => {
	const [messages, setMessages] = useState(initial)

	return (
		<ChatHeader
			messages={messages}
			onJump={fn()}
			onUnpin={(messageId) =>
				setMessages(messages.filter((message) => message.id !== messageId))
			}
		/>
	)
}

const meta = preview.meta({
	title: "Conversation/Message/PinnedMessages",
	component: PinnedMessages,
	render: (args) => <ChatHeader {...args} />,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The reader's bookmarks over a conversation, reached from a pin button in the chat header. The button wears a dot while anything is pinned and says how many it holds to a screen reader, and pressing it drops a plain panel under it holding one row per pinned message: the author's avatar, their name, when they wrote it, the first three lines of what they said, a jump control and an unpin control. A rule separates one row from the next, and the avatar arrives as a node the host draws — `BotIdentityAvatar` for a companion, `Avatar` for the reader — so the face here is the same face the transcript shows. Jumping closes the panel because the reader is leaving for the transcript; unpinning leaves it open because the reader is still tidying. Nothing here animates. It draws only — the host holds the list, moves the transcript on a jump and drops the pin on an unpin. `AI/Turn` carries the pin action that fills this list.",
			},
		},
	},
	args: {
		messages: MESSAGES,
		onJump: fn(),
		onUnpin: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The nominal panel. Check that the button names its count, that the panel is headed by the pinned-messages title, and that each row reads avatar, author, timestamp and excerpt with its two controls to the right, one rule apart from its neighbour. Pressing jump reports the message id and closes the panel — the reader is going to the transcript; pressing unpin reports the id and leaves the panel where it is, so several pins can be dropped in one visit. `apps/app/src/components/thread-screen.tsx:322` mounts it in the header of every thread, with the rows `apps/app/src/components/thread-screen.tsx:205` builds from the pinned bubbles.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: TRIGGER })

		await expect(trigger).toHaveAccessibleName(`${TITLE}, 2 pinned`)

		await userEvent.click(trigger)
		const panel = await opaque(await body.findByRole("dialog", { name: TITLE }))

		const rows = within(panel).getAllByRole("listitem")

		await expect(rows).toHaveLength(2)
		await expect(within(panel).getByText(MESSAGES[0].timestamp)).toBeVisible()
		await waitFor(() => expect(isReachable(rows[1])).toBe(true))

		await userEvent.click(
			within(panel).getByRole("button", {
				name: "Unpin the message from Skippy",
			}),
		)
		await expect(args.onUnpin).toHaveBeenCalledWith(MESSAGES[0].id)
		await expect(panel).toBeVisible()

		await userEvent.click(
			within(panel).getByRole("button", {
				name: "Jump to the message from You",
			}),
		)
		await expect(args.onJump).toHaveBeenCalledWith(MESSAGES[1].id)
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
	},
})

export const OnePinned = meta.story({
	args: { messages: MESSAGES.slice(0, 1) },
	parameters: {
		docs: {
			description: {
				story:
					"One message pinned, the button at rest. Check that the pin and the number wear the same colour as the button with nothing pinned and as every other ghost button of the header, with no muted tone and no fade, and that the number keeps tabular figures and the count in the button's name. `apps/app/src/components/thread-screen.tsx:322` mounts it in the header of every thread.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const trigger = canvas.getByRole("button", { name: TRIGGER })

		await expect(trigger).toHaveAccessibleName(`${TITLE}, 1 pinned`)
		await expect(trigger).toHaveTextContent("1")
		await expect(getComputedStyle(trigger).fontVariantNumeric).toBe(
			"tabular-nums",
		)
		await expectHeaderRestColour(canvasElement, trigger)
	},
})

export const Empty = meta.story({
	args: { messages: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Nothing pinned yet. The button keeps the same plain pin and only drops the count from its name, and the panel says so in one sentence in place of the rows rather than opening on an empty box. `apps/app/src/components/thread-screen.tsx:322` mounts it in the header of every thread, with the rows `apps/app/src/components/thread-screen.tsx:205` builds from the pinned bubbles.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: TRIGGER })

		await expect(trigger.tagName).toBe("BUTTON")
		await expect(trigger).toHaveAccessibleName(TITLE)
		await expectHeaderRestColour(canvasElement, trigger)

		await userEvent.click(trigger)
		const body = within(canvasElement.ownerDocument.body)
		const panel = await opaque(await body.findByRole("dialog", { name: TITLE }))

		await expect(
			within(panel).getByText("No pinned messages in this conversation yet."),
		).toBeVisible()
		await expect(within(panel).queryByRole("listitem")).not.toBeInTheDocument()
	},
})

export const Overflowing = meta.story({
	args: { messages: OVERFLOWING },
	parameters: {
		docs: {
			description: {
				story:
					"A pin over a long answer. The excerpt is bound to three lines and clipped, so one verbose message cannot push the rest of the list out of reach; the row keeps its two controls on the first line whatever the excerpt costs. `apps/app/src/components/thread-screen.tsx:322` mounts it in the header of every thread, with the rows `apps/app/src/components/thread-screen.tsx:205` builds from the pinned bubbles.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)

		await userEvent.click(canvas.getByRole("button", { name: TRIGGER }))
		const panel = await opaque(await body.findByRole("dialog", { name: TITLE }))
		const excerpt = within(panel).getByText(OVERFLOWING[0].excerpt)
		const lineHeight = Number.parseFloat(getComputedStyle(excerpt).lineHeight)

		await expect(excerpt.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeight * 3 + 1,
		)
		await expect(excerpt.scrollHeight).toBeGreaterThan(excerpt.clientHeight)
	},
})

export const Unpinning = meta.story({
	render: () => <PinnedHeader initial={MESSAGES} />,
	parameters: {
		docs: {
			description: {
				story:
					"The button in the header slot it lives in, with a host that really drops a pin. Check the panel stays open while the rows go away one by one, and that the empty sentence takes their place once the last one is gone — the button drops the count from its name at the same moment. `apps/app/src/components/thread-screen.tsx:322` mounts it in the header of every thread, with the rows `apps/app/src/components/thread-screen.tsx:205` builds from the pinned bubbles.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: TRIGGER })

		await userEvent.click(trigger)
		const panel = await opaque(await body.findByRole("dialog", { name: TITLE }))

		for (const message of MESSAGES) {
			await userEvent.click(
				within(panel).getByRole("button", {
					name: `Unpin the message from ${message.author}`,
				}),
			)
		}

		await expect(
			within(panel).getByText("No pinned messages in this conversation yet."),
		).toBeVisible()
		await expect(trigger).toHaveAccessibleName(TITLE)
	},
})
