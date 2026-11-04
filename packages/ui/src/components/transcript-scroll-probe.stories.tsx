import { useEffect, useRef, useState } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Markdown } from "@workspace/ui/components/markdown"
import {
	Message,
	MessageContent,
	type MessageFrom,
} from "@workspace/ui/components/message"
import { MessageAttachments } from "@workspace/ui/components/message-attachments"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	Transcript,
	type TranscriptItem,
} from "@workspace/ui/components/transcript"
import { installScrollTrace } from "@workspace/ui/lib/scroll-trace"

interface ProbeMessage {
	id: string
	from: MessageFrom
	text: string
	imageUrl?: string
}

const HISTORY_SIZE = 120
const WINDOW_SIZE = 60
const WHOLE_THREAD_SIZE = 240
const STREAM_TICK_MS = 60
const TICKS_PER_TURN = 40
const MERMAID_INDEX = 100
const UNSIZED_IMAGE = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#888"/></svg>',
)}`

const SENTENCES = [
	"The index build goes first and reports done at around four minutes.",
	"The migration starts right after it, inside a single transaction.",
	"Both the copy into role_id and the drop of the legacy column land together.",
	"Nothing else touches the table while the lock is held.",
	"Rollback stays one command away until the release is tagged.",
	"The dashboards keep reading from the replica the whole time.",
]

const CODE_FENCE = [
	"```ts",
	"export const migrate = async (db: Database) => {",
	"\tawait db.exec('create index concurrently roles_idx on roles(id)')",
	"\tawait db.transaction(async (tx) => {",
	"\t\tawait tx.exec('update users set role_id = legacy_role')",
	"\t\tawait tx.exec('alter table users drop column legacy_role')",
	"\t})",
	"}",
	"```",
].join("\n")

const MERMAID_FENCE = [
	"```mermaid",
	"flowchart TD",
	"  A[Index build] --> B[Migration]",
	"  B --> C{Checks pass}",
	"  C -->|yes| D[Release]",
	"  C -->|no| E[Rollback]",
	"```",
].join("\n")

const proseOf = (index: number) =>
	Array.from(
		{ length: 1 + ((index * 7) % 6) },
		(_, sentence) => SENTENCES[(index + sentence) % SENTENCES.length],
	).join(" ")

const assistantTextOf = (index: number) => {
	if (index === MERMAID_INDEX) return `${proseOf(index)}\n\n${MERMAID_FENCE}`
	if (index % 7 === 3) return `${proseOf(index)}\n\n${CODE_FENCE}`
	return proseOf(index)
}

const messageOf = (index: number): ProbeMessage =>
	index % 2 === 0
		? {
				id: `probe-${index}`,
				from: "user",
				text: proseOf(index).split(". ")[0],
				imageUrl: index % 9 === 4 ? UNSIZED_IMAGE : undefined,
			}
		: { id: `probe-${index}`, from: "assistant", text: assistantTextOf(index) }

const historyOf = (size: number) =>
	Array.from({ length: size }, (_, index) => messageOf(index))

type ProbeRowProps = {
	message: ProbeMessage
}

const ProbeRow = ({ message }: ProbeRowProps) => (
	<Message from={message.from}>
		<MessageContent>
			{message.from === "user" ? (
				<MessageBubble align="end">
					{message.imageUrl ? (
						<MessageAttachments
							items={[
								{
									id: message.id,
									name: "screenshot.png",
									previewUrl: message.imageUrl,
								},
							]}
							onOpen={() => {}}
						/>
					) : null}
					<MessageBubbleContent>{message.text}</MessageBubbleContent>
				</MessageBubble>
			) : (
				<Markdown>{message.text}</Markdown>
			)}
		</MessageContent>
	</Message>
)

const toRows = (messages: ProbeMessage[]): TranscriptItem[] =>
	messages.map((message) => ({
		key: message.id,
		messageIds: [message.id],
		render: () => <ProbeRow message={message} />,
	}))

const grownBy = (messages: ProbeMessage[], tick: number): ProbeMessage[] => {
	if (tick % TICKS_PER_TURN === 0) {
		return [
			...messages,
			{ id: `streamed-${tick}`, from: "assistant", text: SENTENCES[0] },
		]
	}
	const last = messages.at(-1)
	if (last?.from !== "assistant") return messages
	const word = SENTENCES[tick % SENTENCES.length].split(" ")[tick % 5]
	return [...messages.slice(0, -1), { ...last, text: `${last.text} ${word}` }]
}

type WindowInput = {
	messages: ProbeMessage[]
	isFollowing: boolean
	windowSize: number
}

const withinWindow = ({ messages, isFollowing, windowSize }: WindowInput) =>
	isFollowing && messages.length > windowSize
		? messages.slice(messages.length - windowSize)
		: messages

type ProbeThreadProps = {
	isStreaming: boolean
	historySize: number
	windowSize: number
}

const ProbeThread = ({
	isStreaming,
	historySize,
	windowSize,
}: ProbeThreadProps) => {
	const [history] = useState(() => historyOf(historySize))
	const [messages, setMessages] = useState(() =>
		history.slice(historySize - windowSize),
	)
	const isFollowingRef = useRef(true)

	useEffect(() => {
		if (!isStreaming) return
		let tick = 0
		const timer = window.setInterval(() => {
			tick += 1
			setMessages((current) =>
				withinWindow({
					messages: grownBy(current, tick),
					isFollowing: isFollowingRef.current,
					windowSize,
				}),
			)
		}, STREAM_TICK_MS)
		return () => window.clearInterval(timer)
	}, [isStreaming, windowSize])

	const oldestIndex = history.findIndex(
		(message) => message.id === messages[0]?.id,
	)

	return (
		<div className="mx-auto flex h-screen w-full max-w-3xl flex-col bg-background">
			<Transcript
				anchorOnSend
				busy={isStreaming}
				className="flex-1"
				contentClassName="flex min-h-full w-full flex-col px-6 pt-8 pb-4"
				older={{ hasNextPage: oldestIndex > 0, isFetchingNextPage: false }}
				onFollowChange={(isFollowing) => {
					isFollowingRef.current = isFollowing
				}}
				rows={toRows(messages)}
			>
				{isStreaming ? (
					<div className="h-8 text-muted-foreground text-sm">Working</div>
				) : null}
			</Transcript>
		</div>
	)
}

const meta = preview.meta({
	title: "Conversation/Message/TranscriptScrollProbe",
	component: ProbeThread,
	tags: ["test-only"],
	parameters: { layout: "fullscreen" },
	args: {
		isStreaming: false,
		historySize: HISTORY_SIZE,
		windowSize: WINDOW_SIZE,
	},
	beforeEach: () => installScrollTrace(),
})

export const LongThread = meta.story({
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(canvasElement.querySelectorAll("[data-message-id]").length).toBe(
				WINDOW_SIZE,
			),
		)
		await waitFor(() =>
			expect(window.kiroshiScrollTrace?.mark("probe")?.messageId).toMatch(
				/^probe-/,
			),
		)
	},
})

export const LongThreadStreaming = meta.story({
	args: { isStreaming: true },
	play: async () => {
		await waitFor(
			() =>
				expect(
					window.kiroshiScrollTrace
						?.entries()
						.some((entry) => entry.origin === "content-mutation-observer"),
				).toBe(true),
			{ timeout: STREAM_TICK_MS * TICKS_PER_TURN * 2 },
		)
	},
})

export const WholeThread = meta.story({
	args: { historySize: WHOLE_THREAD_SIZE, windowSize: WHOLE_THREAD_SIZE },
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(canvasElement.querySelectorAll("[data-message-id]").length).toBe(
				WHOLE_THREAD_SIZE,
			),
		)
	},
})
