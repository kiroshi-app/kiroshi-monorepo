import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	isInBrowserRunner,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import { MarkProvider } from "@workspace/ui/components/mark-context"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	Transcript,
	type TranscriptItem,
	type TranscriptProps,
} from "@workspace/ui/components/transcript"
import {
	AssistantTurn,
	TurnGroup,
	UserTurn,
} from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

interface Entry {
	id: string
	from: "user" | "assistant"
	text: string
	isPosted?: boolean
}

const FRAME_CLASS =
	"flex h-80 w-96 flex-col overflow-hidden rounded-xl border border-border bg-background"

const FRAME_HEIGHTS = [320, 220]

const entryOf = (index: number): Entry => ({
	id: `turn-${index}`,
	from: index % 2 === 0 ? "user" : "assistant",
	text: `Run ${index + 1} of the conversation, long enough to take a line or two of the frame.`,
})

const HISTORY = Array.from({ length: 12 }, (_, index) => entryOf(index))

const SHORT_HISTORY = HISTORY.slice(0, 2)

const OLDER_PAGE = Array.from({ length: 6 }, (_, index) => ({
	id: `older-${index}`,
	from: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
	text: `Older run ${index + 1}, prepended above the reading position.`,
}))

const NEWER_PAGE = Array.from({ length: 6 }, (_, index) => ({
	id: `newer-${index}`,
	from: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
	text: `Newer run ${index + 1}, appended below the landed message.`,
}))

const NEWEST_ROW = NEWER_PAGE[NEWER_PAGE.length - 1].text

const REPLIES = Array.from({ length: 4 }, (_, index) => ({
	id: `reply-${index}`,
	from: "assistant" as const,
	text: `Reply ${index + 1} arriving while the reader watches the live edge.`,
}))

const PROMPT: Entry = {
	id: "prompt",
	from: "user",
	text: "Walk me through the rollout, one step at a time.",
}

const ANSWER_WORDS = (
	"The index build goes first and reports done at around four minutes. " +
	"The migration starts right after it, inside a single transaction, so the " +
	"copy into role_id and the drop of the legacy column either both land or " +
	"neither does."
).split(" ")

const SHORT_ANSWER_WORDS = ANSWER_WORDS.slice(0, 1)

const LONG_ANSWER_WORDS = [...ANSWER_WORDS, ...ANSWER_WORDS, ...ANSWER_WORDS]

const ONE_LINE = 24

const Bubble = ({ entry }: { entry: Entry }) => (
	<div
		className={cn(
			"max-w-[85%] rounded-lg px-3 py-2 text-sm",
			entry.from === "user"
				? "ml-auto bg-secondary text-secondary-foreground"
				: "border border-border bg-card text-foreground",
		)}
	>
		{entry.text}
	</div>
)

const toItems = (entries: Entry[]): TranscriptItem[] =>
	entries.map((entry) => ({
		key: entry.id,
		messageIds: [entry.id],
		isAnchor: entry.from === "user" && !entry.isPosted,
		render: () => <Bubble entry={entry} />,
	}))

const distanceFromEnd = (viewport: HTMLElement) =>
	viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight

const settleScroll = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				setTimeout(resolve, 0)
			}),
		)
	})

const atLiveEdge = (viewport: HTMLElement) =>
	waitFor(() => expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(2))

const RESTING_PADDING = 12

const spaceUnder = (viewport: HTMLElement, bubble: HTMLElement) => {
	const bottom =
		bubble.getBoundingClientRect().bottom -
		viewport.getBoundingClientRect().top +
		viewport.scrollTop
	return viewport.scrollHeight - bottom
}

const expectRestingPadding = (viewport: HTMLElement, bubble: HTMLElement) =>
	expect(spaceUnder(viewport, bubble)).toBeLessThanOrEqual(RESTING_PADDING)

const RETURN_CONTROL = { name: /Jump to latest|new messages?/ }

const expectCentredOver = (viewport: HTMLElement, button: HTMLElement) =>
	waitFor(async () => {
		await expect(button).toHaveAttribute("data-active", "true")
		const room = viewport.getBoundingClientRect()
		const box = button.getBoundingClientRect()
		await expect(box.left + box.width / 2).toBeCloseTo(
			room.left + room.width / 2,
			0,
		)
		await expect(box.left).toBeGreaterThanOrEqual(room.left)
		await expect(box.right).toBeLessThanOrEqual(room.right)
	})

const scrollUp = async (viewport: HTMLElement) => {
	viewport.dispatchEvent(
		new WheelEvent("wheel", { bubbles: true, deltaY: -200 }),
	)
	viewport.scrollTop = 0
	await settleScroll()
}

const dragScrollbarUp = async (viewport: HTMLElement) => {
	await waitFor(
		() => expect(viewport).toHaveAttribute("data-autoscrolling"),
		FRAME_POLL,
	)
	viewport.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
	viewport.scrollTop = 0
	viewport.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
	await settleScroll()
}

type DemoProps = Omit<
	TranscriptProps,
	"children" | "rows" | "older" | "newer"
> & {
	entries?: Entry[]
	incoming?: Entry[]
	olderPages?: Entry[][]
	newerPages?: Entry[][]
}

const TranscriptDemo = ({
	entries = HISTORY,
	incoming = REPLIES,
	olderPages,
	newerPages,
	...transcriptProps
}: DemoProps) => {
	const [shown, setShown] = useState(entries)
	const [sent, setSent] = useState(0)
	const [pending, setPending] = useState(olderPages ?? [])
	const [ahead, setAhead] = useState(newerPages ?? [])
	const next = incoming[sent]

	const deliverIncoming = () => {
		if (!next) return
		setShown((current) => [...current, next])
		setSent((current) => current + 1)
	}

	const deliverOlder = () => {
		const page = pending[0]
		if (!page) return
		setShown((current) => [...page, ...current])
		setPending((current) => current.slice(1))
	}

	const deliverNewer = () => {
		const page = ahead[0]
		if (!page) return
		setShown((current) => [...current, ...page])
		setAhead((current) => current.slice(1))
	}

	const deliverLatest = () => {
		if (ahead.length === 0) return
		setShown(ahead.at(-1) ?? [])
		setAhead([])
	}

	return (
		<div className={FRAME_CLASS}>
			<Transcript
				{...transcriptProps}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				newer={
					ahead.length > 0
						? { onLoad: deliverNewer, onLoadLatest: deliverLatest }
						: undefined
				}
				older={
					olderPages
						? { has: pending.length > 0, onLoad: deliverOlder }
						: undefined
				}
				rows={toItems(shown)}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button disabled={!next} onClick={deliverIncoming} size="sm">
					Send reply
				</Button>
			</div>
		</div>
	)
}

type StreamingDemoProps = Omit<TranscriptProps, "children" | "rows"> & {
	answerWords?: string[]
}

const StreamingDemo = ({
	answerWords = ANSWER_WORDS,
	...transcriptProps
}: StreamingDemoProps) => {
	const [shown, setShown] = useState(HISTORY)
	const [words, setWords] = useState(0)
	const [isStreaming, setIsStreaming] = useState(false)
	const [frameHeight, setFrameHeight] = useState(FRAME_HEIGHTS[0])

	const sendPrompt = () => {
		setShown([...HISTORY, PROMPT])
		setWords(0)
		setIsStreaming(true)

		let delivered = 0
		const deliverNextWord = () => {
			delivered += 1
			setWords(delivered)
			if (delivered < answerWords.length) {
				requestAnimationFrame(deliverNextWord)
				return
			}
			setIsStreaming(false)
		}
		requestAnimationFrame(deliverNextWord)
	}

	const streamed =
		words > 0
			? [
					{
						id: "answer",
						from: "assistant" as const,
						text: answerWords.slice(0, words).join(" "),
					},
				]
			: []

	return (
		<div className={FRAME_CLASS} style={{ blockSize: frameHeight }}>
			<Transcript
				{...transcriptProps}
				busy={isStreaming}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				rows={toItems([...shown, ...streamed])}
			>
				{isStreaming ? (
					<div className="flex h-10 items-center text-muted-foreground text-xs">
						Working
					</div>
				) : null}
			</Transcript>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button disabled={isStreaming} onClick={sendPrompt} size="sm">
					Send
				</Button>
				<Button
					onClick={() =>
						setFrameHeight((current) =>
							current === FRAME_HEIGHTS[0]
								? FRAME_HEIGHTS[1]
								: FRAME_HEIGHTS[0],
						)
					}
					size="sm"
					variant="outline"
				>
					Resize frame
				</Button>
				<span className="text-muted-foreground text-xs">
					{isStreaming ? "Streaming" : "Idle"}
				</span>
			</div>
		</div>
	)
}

const POSTED_ROWS: Entry[] = [
	{
		id: "question-welcome",
		from: "assistant",
		text: "Welcome. Shall we set up how you sign in?",
	},
	{ id: "answer-welcome", from: "user", text: "Start", isPosted: true },
	{
		id: "question-account",
		from: "assistant",
		text: "How do you want to sign in?",
	},
	{
		id: "answer-account",
		from: "user",
		text: "Sign in with Claude",
		isPosted: true,
	},
]

type PostedQuestionsDemoProps = Omit<TranscriptProps, "children" | "rows">

const PostedQuestionsDemo = (transcriptProps: PostedQuestionsDemoProps) => {
	const [posted, setPosted] = useState(1)
	const hasNext = posted < POSTED_ROWS.length

	return (
		<div className={FRAME_CLASS}>
			<Transcript
				{...transcriptProps}
				className="flex-1"
				contentClassName="flex flex-col p-3"
				rows={toItems(POSTED_ROWS.slice(0, posted))}
			/>
			<div className="flex items-center gap-2 border-border border-t p-2">
				<Button
					disabled={!hasNext}
					onClick={() => setPosted((current) => current + 1)}
					size="sm"
				>
					Post next
				</Button>
			</div>
		</div>
	)
}

const MOUNTED_BY_THE_LAYOUT =
	"`packages/ui/src/components/thread-layout.tsx:78` mounts it with the rows `apps/app/src/components/thread-screen.tsx:1434` hands over."

const meta = preview.meta({
	title: "Conversation/Message/Transcript",
	component: Transcript,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Scroll container for a streamed transcript, composed on the shadcn MessageScroller primitive. Every row is mounted: nothing is windowed and no row height is guessed. It holds the live edge while the reader sits there, hands scroll control back the moment they move up, and shows a return control that takes them back and resumes following. `older` adds the load-older affordance at the top and the reading position survives the page being prepended above it. `rows` is one entry per run, with the `messageIds` it anchors, and a row marked `isAnchor` is a message the reader sent: with `anchorOnSend` the newest one is parked near the top of the viewport with a peek of the previous turn while the answer fills the room below. `marksNewMessages` draws a session-local separator where the reader was released, `countsNewMessages` names on the return control how many arrived since. A new `transcriptKey` forgets both and lands at the end again.",
			},
		},
	},
	args: {
		label: "Conversation",
		onFollowChange: fn(),
	},
	argTypes: {
		busy: { control: "boolean" },
		label: { control: "text" },
		anchorOnSend: { control: "boolean" },
		marksNewMessages: { control: "boolean" },
		countsNewMessages: { control: "boolean" },
	},
	render: (args) => <TranscriptDemo {...args} />,
})

export const Default = meta.story({
	render: (args) => <TranscriptDemo {...args} entries={SHORT_HISTORY} />,
	parameters: {
		docs: {
			description: {
				story:
					"A transcript short enough to fit the frame. Nothing scrolls, the reader is following, the return control stays out of the way, the viewport carries no scroll fade over its edges, and it reserves no gutter for a scrollbar in its layout width. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeLessThanOrEqual(
			viewport.clientHeight + 1,
		)
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
		await expect(getComputedStyle(viewport).maskImage).toBe("none")
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
	},
})

export const LandsAtEnd = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A resumed conversation, longer than the frame on first paint. The reader lands on the newest message instead of on history they have already read. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })

		await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
		await atLiveEdge(viewport)
		await expect(viewport.clientWidth).toBe(viewport.offsetWidth)
	},
})

export const DoesNotFollowWithoutAutoScroll = meta.story({
	args: { autoScroll: false },
	render: (args) => <TranscriptDemo {...args} entries={SHORT_HISTORY} />,
	parameters: {
		docs: {
			description: {
				story:
					"A transcript a host drives itself, with `autoScroll` off: a replay, a scripted scene, anything whose frame must show the same band from end to end. Check that a reply taller than the room left over stays below the fold instead of pulling the viewport to the live edge, and that the reading position is the one the frame opened on. `apps/website/src/app-scene.tsx:278` is the one caller that turns following off, for the scene the website replays; the app never does.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const held = viewport.scrollTop

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await settleScroll()

		await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
		await expect(viewport.scrollTop).toBe(held)
		await expect(distanceFromEnd(viewport)).toBeGreaterThan(2)
	},
})

export const Follows = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Replies arriving while the reader sits at the live edge. Each one pulls the viewport down so the last rendered line stays inside the frame. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)
		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)

		await expect(args.onFollowChange).not.toHaveBeenCalledWith(false)
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
	},
})

export const StreamHoldsTheLastLine = meta.story({
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"An answer streamed word by word while the reader watches. The viewport never falls more than a line behind the growing answer, and it sits exactly on the last line once the final token lands. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))

		let samples = 0
		let widest = 0
		while (canvas.queryByText("Streaming")) {
			await settleScroll()
			widest = Math.max(widest, distanceFromEnd(viewport))
			samples += 1
		}

		await expect(samples).toBeGreaterThan(2)
		await expect(widest).toBeLessThanOrEqual(ONE_LINE)
		await atLiveEdge(viewport)
	},
})

export const Disengages = meta.story({
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reader scrolls up into the history mid-stream. Following stops, the answer keeps growing off screen, and the return control comes out. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await scrollUp(viewport)

		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await waitFor(() =>
			expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
				"data-active",
				"true",
			),
		)
		await expect(viewport.scrollTop).toBeLessThan(40)
	},
})

export const DisengagesOnScrollbarDrag = meta.story({
	render: (args) => <StreamingDemo {...args} answerWords={LONG_ANSWER_WORDS} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reader grabs the scrollbar and drags it up while an answer streams, at the moment the viewport is still catching up with the last line. Following stops exactly as it does for a wheel or a touch, the growing answer no longer pulls the viewport back down, and the return control brings the reader back to a viewport that follows the stream again. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await dragScrollbarUp(viewport)

		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		for (let frame = 0; frame < 10; frame += 1) {
			await settleScroll()
			await expect(viewport.scrollTop).toBeLessThan(40)
		}
		await expect(canvas.queryByText("Streaming")).toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", RETURN_CONTROL))
		await atLiveEdge(viewport)
		while (canvas.queryByText("Streaming")) {
			await settleScroll()
			await expect(distanceFromEnd(viewport)).toBeLessThanOrEqual(ONE_LINE)
		}
	},
})

export const Returns = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The reader takes the return control back to the newest message. The viewport lands at the end and following resumes, so the next reply pulls it down again. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(canvas.getByRole("button", RETURN_CONTROL))
		await atLiveEdge(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(true))

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await atLiveEdge(viewport)
	},
})

export const PrependsOlderMessages = meta.story({
	render: (args) => (
		<TranscriptDemo {...args} entries={HISTORY} olderPages={[OLDER_PAGE]} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A page of older messages loaded from the top of the history. The row the reader was looking at keeps its exact screen position while the page is inserted above it. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)

		const anchor = canvas.getByText(HISTORY[0].text)
		const before = anchor.getBoundingClientRect().top

		await userEvent.click(
			await canvas.findByRole("button", { name: "Load older messages" }),
		)
		await waitFor(() =>
			expect(canvas.getByText(OLDER_PAGE[0].text)).toBeInTheDocument(),
		)
		await settleScroll()

		await expect(
			Math.abs(anchor.getBoundingClientRect().top - before),
		).toBeLessThanOrEqual(2)
	},
})

export const LoadsNewerMessages = meta.story({
	render: (args) => (
		<TranscriptDemo {...args} entries={HISTORY} newerPages={[NEWER_PAGE]} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"A thread opened on a search result: the newest end is not loaded, so a control sits below the last row and reads the page after it. Once nothing newer is left the control is gone, which is how the reader knows the live edge is back. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const control = await canvas.findByRole("button", {
			name: "Load newer messages",
		})

		await userEvent.click(control)
		await waitFor(() =>
			expect(canvas.getByText(NEWER_PAGE[0].text)).toBeInTheDocument(),
		)

		await waitFor(() =>
			expect(
				canvas.queryByRole("button", { name: "Load newer messages" }),
			).toBeNull(),
		)
	},
})

export const JumpsToTheNewestPage = meta.story({
	render: (args) => (
		<TranscriptDemo {...args} entries={HISTORY} newerPages={[NEWER_PAGE]} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The return control on a transcript whose newest end is unloaded. Scrolling back down would only reach the last row read, which is not the last row of the conversation, so the control asks for the newest page instead: the rows it lands on are the ones that were never loaded, and both it and the load-newer control are gone once the live edge is back. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)
		await scrollUp(viewport)

		await expect(canvas.queryByText(NEWEST_ROW)).toBeNull()

		await userEvent.click(canvas.getByRole("button", RETURN_CONTROL))

		await waitFor(() =>
			expect(canvas.getByText(NEWEST_ROW)).toBeInTheDocument(),
		)
		await waitFor(() =>
			expect(
				canvas.queryByRole("button", { name: "Load newer messages" }),
			).toBeNull(),
		)
	},
})

export const AnchorsTheSentMessage = meta.story({
	args: { anchorOnSend: true },
	render: (args) => <StreamingDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A solo thread: the message the reader just sent is parked near the top of the viewport with a peek of the previous turn above it, and the answer fills the room below. The reader is still reported as following. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))

		const sent = canvas.getByText(PROMPT.text)
		await waitFor(() => {
			const offset =
				sent.getBoundingClientRect().top - viewport.getBoundingClientRect().top
			expect(offset).toBeGreaterThan(0)
			expect(offset).toBeLessThan(viewport.clientHeight / 2)
		})
		await expect(canvas.getByRole("button", RETURN_CONTROL)).toHaveAttribute(
			"data-active",
			"false",
		)
	},
})

export const RestsPostedQuestionsAtTheEnd = meta.story({
	args: { anchorOnSend: true },
	render: (args) => <PostedQuestionsDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A solo thread where the app posts two questions and writes each answer itself. Nothing here was sent by the reader, so no row is anchored: every bubble lands at the end and the last one rests against the composer. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		const postNext = canvas.getByRole("button", { name: "Post next" })

		for (const row of POSTED_ROWS.slice(1)) {
			await userEvent.click(postNext)
			const landed = await canvas.findByText(row.text)
			await atLiveEdge(viewport)
			await waitFor(() => expectRestingPadding(viewport, landed))
		}
	},
})

export const MarksAndCountsNewMessages = meta.story({
	args: { countsNewMessages: true, marksNewMessages: true },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation: once the reader is released, a separator marks where they stopped reading and the return control names how many messages arrived since. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() =>
			expect(canvas.getByText("New messages")).toBeInTheDocument(),
		)
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: "1 new message" }),
			).toBeInTheDocument(),
		)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: "2 new messages" }),
			).toBeInTheDocument(),
		)
	},
})

export const ReturnControlCentredOverViewport = meta.story({
	args: { countsNewMessages: true },
	parameters: {
		docs: {
			description: {
				story:
					"The return control, short and counted, measured against the viewport it floats over. Check its centre sits on the viewport centre and both of its edges stay inside the viewport, whichever label it carries. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await scrollUp(viewport)
		await waitFor(() => expect(args.onFollowChange).toHaveBeenCalledWith(false))
		await expectCentredOver(
			viewport,
			canvas.getByRole("button", { name: "Jump to latest" }),
		)

		await userEvent.click(canvas.getByRole("button", { name: "Send reply" }))
		await expectCentredOver(
			viewport,
			await canvas.findByRole("button", { name: "1 new message" }),
		)
	},
})

export const RestsWithoutABand = meta.story({
	args: { anchorOnSend: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same solo thread once the answer has landed and the working row has left the tail. The send anchor is released, so the room it held under the last bubble collapses and only the resting padding is left between that bubble and the composer. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await waitFor(
			() => {
				expect(
					canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
				).toBeInTheDocument()
				expect(canvas.queryByText("Working")).toBeNull()
			},
			{ timeout: 5000 },
		)

		await expectRestingPadding(
			viewport,
			canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
		)
	},
})

export const ConversationRestsWithoutABand = meta.story({
	args: { countsNewMessages: true, marksNewMessages: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same rest in a conversation, where nothing is anchored on send. Once the answer has landed and the working row has left the tail, the space under the last bubble is the resting padding, not a band left by a row the browser never sized. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await waitFor(
			() => {
				expect(
					canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
				).toBeInTheDocument()
				expect(canvas.queryByText("Working")).toBeNull()
			},
			{ timeout: 5000 },
		)

		await expectRestingPadding(
			viewport,
			canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
		)
	},
})

export const RestsAfterAResize = meta.story({
	args: { anchorOnSend: true },
	render: (args) => (
		<StreamingDemo {...args} answerWords={SHORT_ANSWER_WORDS} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"The window changes size once the answer has settled. The transcript follows the new frame down to its last bubble and leaves the resting padding under it, with no band opening up as rows are skipped and un-skipped. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const viewport = canvas.getByRole("region", { name: "Conversation" })
		await atLiveEdge(viewport)

		await userEvent.click(canvas.getByRole("button", { name: "Send" }))
		await waitFor(
			() => {
				expect(
					canvas.getByText(SHORT_ANSWER_WORDS.join(" ")),
				).toBeInTheDocument()
				expect(canvas.queryByText("Working")).toBeNull()
			},
			{ timeout: 5000 },
		)

		const answer = canvas.getByText(SHORT_ANSWER_WORDS.join(" "))
		await expectRestingPadding(viewport, answer)

		await userEvent.click(canvas.getByRole("button", { name: "Resize frame" }))
		await settleScroll()
		await expectRestingPadding(viewport, answer)

		await userEvent.click(canvas.getByRole("button", { name: "Resize frame" }))
		await settleScroll()
		await expectRestingPadding(viewport, answer)
	},
})

const JOINED_NOW = new Date(2026, 9, 10, 9, 30).getTime()

const JOINED_RUNS: TranscriptItem[] = [
	{
		key: "asked",
		render: () => (
			<TurnGroup>
				<UserTurn name="Shoto Puget">Is any of that destructive?</UserTurn>
			</TurnGroup>
		),
	},
	{
		key: "answered",
		render: () => (
			<TurnGroup>
				<AssistantTurn author={{ id: "bot-atlas", name: "Atlas" }}>
					Nothing is deleted.
				</AssistantTurn>
				<AssistantTurn author={{ id: "bot-atlas", name: "Atlas" }}>
					The migration only adds a column.
				</AssistantTurn>
			</TurnGroup>
		),
	},
	{
		key: "day",
		render: () => <DaySeparator at={JOINED_NOW} now={JOINED_NOW} />,
	},
	{
		key: "followed-up",
		render: () => (
			<TurnGroup>
				<UserTurn name="Shoto Puget">Ship it.</UserTurn>
			</TurnGroup>
		),
	},
]

export const JoinsConsecutiveRuns = meta.story({
	render: (args) => (
		<div className={FRAME_CLASS}>
			<Transcript
				{...args}
				className="flex-1"
				contentClassName="flex flex-col px-6 py-3"
				rows={JOINED_RUNS}
			/>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Two message runs in a row sit on their own row padding alone, 4px under the last row of one and 8px over the head of the next, with no transcript gap between them. Every other row keeps the transcript gap: check that the day separator still stands 24px clear of the runs on both sides. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [asked, answered, day, followedUp] = slotsIn(
			canvasElement,
			"message-scroller-item",
		).map((item) => item.getBoundingClientRect())

		await expect(answered.top - asked.bottom).toBe(0)
		await expect(day.top - answered.bottom).toBe(24)
		await expect(followedUp.top - day.bottom).toBe(24)
	},
})

const AT_REST_BOT: RosterBot = { id: "bot-lyra", name: "Lyra", blot: "purple" }

type AtRestStage = "answered" | "sent" | "replied"

const NEXT_STAGE: Record<AtRestStage, AtRestStage> = {
	answered: "sent",
	sent: "replied",
	replied: "replied",
}

const assistantRun = (key: string, text: string, isMarked: boolean) => ({
	key,
	render: () => (
		<TurnGroup carriesMark={isMarked}>
			<AssistantTurn botId={AT_REST_BOT.id} identity={AT_REST_BOT}>
				{text}
			</AssistantTurn>
		</TurnGroup>
	),
})

const userRun = (key: string, text: string) => ({
	key,
	render: () => (
		<TurnGroup>
			<UserTurn>{text}</UserTurn>
		</TurnGroup>
	),
})

const atRestRowsOf = (stage: AtRestStage): TranscriptItem[] => [
	userRun("asked", "Walk me through the rollout."),
	assistantRun("answered", "The index build goes first.", stage === "answered"),
	...(stage === "answered"
		? []
		: [userRun("sent", "Is any of that destructive?")]),
	...(stage === "replied"
		? [assistantRun("replied", "Nothing is deleted.", true)]
		: []),
]

const AtRestDemo = (args: TranscriptProps) => {
	const [stage, setStage] = useState<AtRestStage>("answered")

	return (
		<MarkProvider transcriptKey="at-rest">
			<div className="flex flex-col items-start gap-3">
				<Button
					onClick={() => setStage(NEXT_STAGE[stage])}
					size="sm"
					variant="outline"
				>
					{stage === "answered" ? "Send" : "Reply"}
				</Button>
				<div className={FRAME_CLASS}>
					<Transcript
						{...args}
						className="flex-1"
						contentClassName="flex flex-col px-6 py-3"
						rows={atRestRowsOf(stage)}
					>
						{stage === "sent" ? (
							<ActivityIndicator
								blot={AT_REST_BOT.blot}
								botId={AT_REST_BOT.id}
								kind="thinking"
								name={AT_REST_BOT.name}
								seed={AT_REST_BOT.id}
							/>
						) : null}
					</Transcript>
				</div>
			</div>
		</MarkProvider>
	)
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const motionIn = (root: HTMLElement) =>
	[root, ...root.querySelectorAll<HTMLElement>("*")].flatMap((node) => {
		const style = getComputedStyle(node)
		const running = node.getAnimations().length
		const isAtRest =
			style.opacity === "1" && style.transform === "none" && running === 0
		return isAtRest
			? []
			: [
					`${node.dataset.slot ?? node.tagName}: opacity ${style.opacity}, transform ${style.transform}, ${running} animations`,
				]
	})

const rowOf = (canvasElement: HTMLElement, key: string) => {
	const row = canvasElement.querySelector<HTMLElement>(
		`[data-message-id="${key}"]`,
	)
	if (!row) throw new Error(`No row holds ${key}`)
	return row
}

export const AppendsRowsAtRest = meta.story({
	tags: ["test-only"],
	render: (args) => <AtRestDemo {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A solo thread with full motion allowed: the reader sends, the working row takes the companion's mark, then the reply lands and its gutter claims it back. Each row the transcript gains, with its header line, avatar and bubble, and the working row's avatar, sit at full opacity with no transform and no running animation on the frame they mount: nothing fades, slides or scales in. " +
					MOUNTED_BY_THE_LAYOUT,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await userEvent.click(canvas.getByRole("button", { name: "Send" }))
			await nextFrame()
			await expect(motionIn(rowOf(canvasElement, "sent"))).toEqual([])
			await expect(
				motionIn(slotIn(slotIn(canvasElement, "bot-working"), "shared-mark")),
			).toEqual([])

			await userEvent.click(canvas.getByRole("button", { name: "Reply" }))
			await nextFrame()
			await expect(motionIn(rowOf(canvasElement, "replied"))).toEqual([])
		})
	},
})
