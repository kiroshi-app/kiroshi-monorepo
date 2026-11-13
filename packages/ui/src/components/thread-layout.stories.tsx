import { useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	mergeA11y,
	probedStyleOf,
	slotIn,
	slotsIn,
	tokenLengthOf,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { ConnectionStatusState } from "@workspace/ui/components/connection-status"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { LIBRARY_LIGHTBOX_IMAGES } from "@workspace/ui/components/library.fixtures"
import { LibraryLightbox } from "@workspace/ui/components/library-lightbox"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import { Notice } from "@workspace/ui/components/notice"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptQueue } from "@workspace/ui/components/prompt-queue"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	ThreadLayout,
	type ThreadLayoutProps,
} from "@workspace/ui/components/thread-layout"
import { ThreadTranscriptSkeleton } from "@workspace/ui/components/thread-transcript-skeleton"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: BLOT_HUES.blue,
}

const LONG_TRANSCRIPT = [
	"Walk me through the workspace layout.",
	"Where does the design system live?",
	"Which package owns the Tauri commands?",
	"How does the transcript get its data?",
	"What happens when the CLI crashes mid-turn?",
	"Can a turn be stopped once it started streaming?",
	"How is a tool approval surfaced?",
	"What resets when a session restarts?",
]

const threadHeader = (connection: ConnectionStatusState) => (
	<AppHeader
		leading={
			<HeaderIdentityButton
				connection={connection}
				name="Skippy"
				onOpenSettings={fn()}
				seed={BOT.id}
				version="2.1.233"
			/>
		}
		trailing={<PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />}
	/>
)

const THREAD_HEADER = threadHeader("ready")

const CRASHED_HEADER = threadHeader("crashed")

const CONVERSATION = (
	<>
		<UserTurn>How is this workspace laid out?</UserTurn>
		<AssistantTurn copyText={ANSWER} identity={BOT}>
			{ANSWER}
		</AssistantTurn>
	</>
)

const CONVERSATION_ROWS: TranscriptItem[] = [
	{
		key: "question",
		render: () => <UserTurn>How is this workspace laid out?</UserTurn>,
	},
	{
		key: "answer",
		render: () => (
			<AssistantTurn copyText={ANSWER} identity={BOT}>
				{ANSWER}
			</AssistantTurn>
		),
	},
]

const STREAMED_CHUNK =
	" Each package keeps its own stories, tests and build step.".repeat(12)

const SCROLLING_TRANSCRIPT = LONG_TRANSCRIPT.map((question) => (
	<UserTurn key={question}>{question}</UserTurn>
))

const TRANSCRIPT_TOP_PADDING = 32
const TRANSCRIPT_BOTTOM_PADDING = 24

const scrollerOf = (transcript: HTMLElement) => {
	const scroller = transcript.closest<HTMLElement>(
		'[data-slot="message-scroller"]',
	)
	if (!scroller)
		throw new globalThis.Error("This transcript sits in no scroller")
	return scroller
}

const spaceUnderLastRow = (transcript: HTMLElement, scroller: HTMLElement) => {
	const lastRow = transcript.lastElementChild
	if (!lastRow) throw new globalThis.Error("This transcript holds no row")
	return Math.round(
		scroller.getBoundingClientRect().bottom -
			lastRow.getBoundingClientRect().bottom,
	)
}

const restOf = (canvasElement: HTMLElement) => {
	const viewport = canvasElement.querySelector<HTMLElement>(
		'[data-slot="message-scroller-viewport"]',
	)
	const content = canvasElement.querySelector<HTMLElement>(
		'[data-slot="message-scroller-content"]',
	)
	const rows = Array.from(content?.children ?? []).filter(
		(child) => !child.hasAttribute("data-message-scroller-spacer"),
	)
	const first = rows.at(0)
	const last = rows.at(-1)
	if (!viewport || !first || !last)
		throw new globalThis.Error("This transcript holds no row")

	const frame = viewport.getBoundingClientRect()
	return {
		above: Math.round(first.getBoundingClientRect().top - frame.top),
		below: Math.round(frame.bottom - last.getBoundingClientRect().bottom),
	}
}

const expectRestingAtBottom = (canvasElement: HTMLElement) =>
	waitFor(() => {
		const { above, below } = restOf(canvasElement)
		expect(below).toBeLessThan(above)
	})

const settledRestOf = async (canvasElement: HTMLElement) => {
	let previous = restOf(canvasElement)
	await waitFor(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50))
		const next = restOf(canvasElement)
		const isSettled =
			next.above === previous.above && next.below === previous.below
		previous = next
		expect(isSettled).toBe(true)
	})
	return previous
}

const StreamingAnswer = (props: ThreadLayoutProps) => {
	const [answer, setAnswer] = useState(ANSWER)

	return (
		<ThreadLayout
			{...props}
			busy
			notice={
				<Button
					onClick={() => setAnswer((current) => current + STREAMED_CHUNK)}
				>
					Stream a paragraph
				</Button>
			}
			rows={[
				CONVERSATION_ROWS[0],
				{
					key: "answer",
					render: () => (
						<AssistantTurn identity={BOT} state="streaming">
							{answer}
						</AssistantTurn>
					),
				},
			]}
		/>
	)
}

const RegionProbe = (props: ThreadLayoutProps) => {
	const [region, setRegion] = useState<HTMLDivElement | null>(null)
	const [composer, setComposer] = useState<HTMLTextAreaElement | null>(null)
	const holdsComposer = region?.contains(composer) ?? false

	return (
		<ThreadLayout
			{...props}
			rootRef={setRegion}
			notice={
				<Notice
					tone="warning"
					title={holdsComposer ? "Composer inside" : "Composer outside"}
					description="What the handed-back region contains."
				/>
			}
			composer={<PromptInput textareaRef={setComposer} onSubmit={fn()} />}
		/>
	)
}

const BOTH_THEMES = 2

const A11Y_SIDE_BY_SIDE_THREADS = mergeA11y(A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS, {
	config: {
		rules: [{ id: "landmark-no-duplicate-banner", reviewOnFail: true }],
	},
})

const rowsAround = (node: HTMLElement) =>
	slotIn(
		node.closest<HTMLElement>('[data-slot="message-scroller-viewport"]') ??
			node,
		"message-scroller-content",
	)

const expectAboveTheRows = async (node: HTMLElement) => {
	await expect(
		node.compareDocumentPosition(rowsAround(node)) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy()
}

const expectInTheColumnOfTheRows = async (skeleton: HTMLElement) => {
	const column = skeleton.firstElementChild?.getBoundingClientRect()
	const rows = rowsAround(skeleton).getBoundingClientRect()
	await expect(column?.left).toBe(rows.left)
	await expect(column?.width).toBe(rows.width)
}

const meta = preview.meta({
	title: "Layout/ThreadLayout",
	component: ThreadLayout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The whole chat screen shell: a fixed header, a transcript that always fills every pixel between header and composer, and a composer that keeps its natural height. A transcript shorter than its viewport rests its last row against the composer and leaves the free space above its first row, the way a conversation reads. The transcript region still stretches, so a lone child that centres itself with `m-auto` stays centred in the free space. It owns no data and no scroll logic of its own: it wraps MessageScroller and lets the transcript run the full width of the shell.",
			},
		},
	},
	args: {
		header: THREAD_HEADER,
		composer: <PromptInput onSubmit={fn()} />,
	},
})

export const Default = meta.story({
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a live conversation short enough not to scroll. Check that the two turns rest against the bottom of the transcript, one small gap above the composer, with the free space above the first turn rather than below the last one. Pick `Empty` for the first launch. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("banner")).toBeVisible()
		await expect(canvas.getByRole("textbox", { name: "Message" })).toBeVisible()
		await expect(
			canvasElement.querySelector('[data-slot="message-scroller-older"]'),
		).toBeNull()
		await expectRestingAtBottom(canvasElement)
		const agentReply = canvasElement.querySelector(
			'[data-slot="message"][data-from="assistant"] [data-slot="message-bubble-content"]',
		)
		await expect(agentReply).toHaveStyle({
			paddingTop: "0px",
			paddingRight: "0px",
			paddingBottom: "0px",
			paddingLeft: "0px",
		})
		const userBubble = canvasElement.querySelector(
			'[data-slot="message"][data-from="user"] [data-slot="message-bubble-content"]',
		)
		await expect(userBubble).toHaveStyle({
			paddingTop: "18px",
			paddingRight: "18px",
			paddingBottom: "18px",
			paddingLeft: "18px",
		})
	},
})

export const ImageViewerInPanel = meta.story({
	args: {
		rows: CONVERSATION_ROWS,
		children: null,
		overlay: (
			<LibraryLightbox
				count={LIBRARY_LIGHTBOX_IMAGES.length}
				image={LIBRARY_LIGHTBOX_IMAGES[0]}
				onClose={fn()}
				onCopy={fn()}
				onDownload={fn()}
				onNext={fn()}
				onPrevious={fn()}
				position={1}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"An image of an answer opened in the thread: the viewer fills the thread panel only, so the rail beside the panel stays visible, as artboard Images 3 draws it. Check the viewer sits inside the layout rather than over the whole window. The app passes it at `apps/app/src/components/thread-screen.tsx` through `overlay`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		await waitFor(() =>
			expect(
				layout.querySelector('[data-slot="library-lightbox"]'),
			).toBeVisible(),
		)
		await expect(
			getComputedStyle(slotIn(layout, "library-lightbox")).position,
		).toBe("absolute")
	},
})

export const OutsideContentCard = meta.story({
	tags: ["test-only"],
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story:
					"The layout mounted with no content card around it. Check it keeps painting the background token itself: only a content card hands it the card surface.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		await expect(getComputedStyle(layout).backgroundColor).toBe(
			probedStyleOf("bg-background", "backgroundColor"),
		)
	},
})

export const StreamingIntoShortTranscript = meta.story({
	tags: ["test-only"],
	args: { children: null },
	render: (args) => <StreamingAnswer {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while an answer streams into a conversation short enough not to scroll. Each press of *Stream a paragraph* appends one to the answer: check that the growing turn keeps its bottom edge against the composer and pushes the first turn up, never down. Pick `LongContent` once the transcript scrolls.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expectRestingAtBottom(canvasElement)
		const before = await settledRestOf(canvasElement)

		await userEvent.click(
			canvas.getByRole("button", { name: "Stream a paragraph" }),
		)

		const after = await settledRestOf(canvasElement)
		await expect(after.above).toBeLessThan(before.above)
		await expect(Math.abs(after.below - before.below)).toBeLessThanOrEqual(1)
	},
})

export const Empty = meta.story({
	args: {
		children: (
			<ChatEmptyState className="m-auto" name="Nest Keeper" onSetup={fn()} />
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on first launch, when the transcript holds nothing but the empty state. This is the story that proves the stretch: `m-auto` only centres because the transcript fills the height, so check that the empty state sits in the middle of the free space rather than pinned under the header. Pick `Default` once a first turn exists. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "Nest Keeper" }),
		).toBeVisible()
		await waitFor(() => {
			const { above, below } = restOf(canvasElement)
			expect(Math.abs(above - below)).toBeLessThanOrEqual(
				TRANSCRIPT_TOP_PADDING,
			)
		})
	},
})

export const LongContent = meta.story({
	args: { busy: true, children: SCROLLING_TRANSCRIPT },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the transcript is taller than the viewport. Check that only the transcript scrolls — the header and the composer must stay put — and that the rows wrap inside the full-width transcript however wide the window gets, without pushing the layout sideways. At the live edge the last row keeps one small gap above the composer, never a band of empty space. Pick `Default` for a transcript that fits. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const transcript = canvas.getByRole("log")
		const scroller = scrollerOf(transcript)
		const spacing = getComputedStyle(transcript)

		await expect(spacing.paddingTop).toBe(`${TRANSCRIPT_TOP_PADDING}px`)
		await expect(spacing.paddingBottom).toBe(`${TRANSCRIPT_BOTTOM_PADDING}px`)

		scroller.scrollTo({ top: scroller.scrollHeight })

		await waitFor(() =>
			expect(spaceUnderLastRow(transcript, scroller)).toBeGreaterThanOrEqual(
				TRANSCRIPT_BOTTOM_PADDING,
			),
		)
	},
})

export const OlderMessages = meta.story({
	args: {
		older: { hasNextPage: true, isFetchingNextPage: false },
		children: SCROLLING_TRANSCRIPT,
	},
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_THREADS,
		docs: {
			description: {
				story:
					"Reach for this when the host pages the transcript by cursor. The layout owns nothing here: `older` is handed straight to the transcript, which parks an invisible sentinel above the first row, inside the scrolling transcript, so the host reads the next page as the reader nears the top. Check that nothing shows above the rows while no page is in flight, and that the header and the composer are untouched, in both themes. Pick `LoadingOlderMessages` for a page in flight. The app assembles it at `apps/app/src/components/thread-screen.tsx:1875`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const sentinels = slotsIn(canvasElement, "list-end-sentinel")

		await expect(sentinels).toHaveLength(BOTH_THEMES)
		await expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(0)
		for (const sentinel of sentinels) {
			await expect(sentinel.closest('[aria-hidden="true"]')).not.toBeNull()
			await expectAboveTheRows(sentinel)
		}
		await expect(canvas.queryAllByRole("button", { name: /older/i })).toEqual(
			[],
		)
	},
})

export const LoadingOlderMessages = meta.story({
	args: {
		older: { hasNextPage: true, isFetchingNextPage: true },
		children: SCROLLING_TRANSCRIPT,
	},
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_THREADS,
		docs: {
			description: {
				story:
					"Reach for this while a page of older messages is in flight. A message-row skeleton shows above the first row, past the same delay as the sidebar skeleton so a quick page never flashes it, and pulses as one shape out of the accessible tree. Check that it lines up with the column of the rows below and reads against the ground in both themes. Pick `OlderMessages` for the idle sentinel. The app assembles it at `apps/app/src/components/thread-screen.tsx:1875`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(
				BOTH_THEMES,
			),
		)

		for (const skeleton of slotsIn(canvasElement, "list-end-skeleton")) {
			const sentinel = slotIn(
				skeleton.closest<HTMLElement>('[data-slot="list-end"]') ?? skeleton,
				"list-end-sentinel",
			)
			await expect(skeleton.closest('[aria-hidden="true"]')).not.toBeNull()
			await expect(
				skeleton.compareDocumentPosition(sentinel) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy()
			await expectAboveTheRows(skeleton)
			await expect(slotsIn(skeleton, "skeleton-agent-bubble")).toHaveLength(1)
			await expectInTheColumnOfTheRows(skeleton)
		}
	},
})

export const StartOfOlderMessages = meta.story({
	args: {
		older: { hasNextPage: false, isFetchingNextPage: false },
		children: CONVERSATION,
	},
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_THREADS,
		docs: {
			description: {
				story:
					"Reach for this once the last page has landed. Check that the sentinel is replaced by the start-of-history line rather than disappearing: the reader needs to know the history above them is finished, not still loading. Pick `OlderMessages` while pages remain. The app assembles it at `apps/app/src/components/thread-screen.tsx:1875`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const starts = slotsIn(canvasElement, "transcript-start-of-history")

		await expect(starts).toHaveLength(BOTH_THEMES)
		await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(0)
		for (const start of starts) await expectAboveTheRows(start)
		for (const line of canvas.getAllByText("Beginning of the conversation"))
			await expect(line).toBeVisible()
	},
})

export const Error = meta.story({
	args: {
		header: CRASHED_HEADER,
		notice: (
			<Notice
				title="The agent stopped"
				description="The agent exited (code 1). Restart the session."
				retry={{ label: "Restart session", onRetry: fn() }}
			/>
		),
		composer: <PromptInput disabled placeholder="Waiting for the agent…" />,
		children: (
			<>
				<UserTurn>How is this workspace laid out?</UserTurn>
				<AssistantTurn state="failed">{""}</AssistantTurn>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the CLI died mid-session. Check that the notice takes its own row directly above the composer without covering the transcript — the failed turn must stay readable, because losing the history is what the notice slot exists to avoid. Pick `Default` once the session has been restarted. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Restart session" }),
		).toBeVisible()
		await expect(canvas.getByLabelText("user message")).toBeVisible()
	},
})

export const Pending = meta.story({
	args: {
		children: SCROLLING_TRANSCRIPT,
		pending: (
			<ToolApproval
				tool="Bash"
				description="The agent wants to clear the build output before rebuilding it."
				parameters={[
					{ id: "command", label: "command", value: "bun run build" },
				]}
				onAllowOnce={fn()}
				onDeny={fn()}
			>
				<ToolApprovalCode code="rm -rf apps/app/dist && bun run build" />
			</ToolApproval>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the agent waits on an answer. The pending card takes its own row between the notice and the composer, so it is docked to the question it answers instead of scrolling away with the transcript. Check that scrolling the rows above leaves the card on screen, that it sits one notice gap above the composer, and that it holds focus as soon as it appears. Pick `Default` once the answer has been sent. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = canvas.getByRole("group")
		const scroller = canvasElement.querySelector(
			'[data-slot="message-scroller"]',
		)

		await expect(card).toHaveFocus()
		await expect(scroller?.contains(card)).toBe(false)
	},
})

export const EmptyQueue = meta.story({
	tags: ["test-only"],
	args: {
		rows: CONVERSATION_ROWS,
		children: null,
		queue: <PromptQueue agentName="Atlas" items={[]} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The queue slot handed a PromptQueue with no rows. Check that no tray is drawn and that the composer sits exactly where `Default` puts it, with nothing above it in its dock.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="prompt-queue"]'),
		).toBeNull()
		const composer = slotIn(canvasElement, "message-quote")
		await expect(composer.getBoundingClientRect().top).toBe(
			composer.parentElement?.getBoundingClientRect().top,
		)
	},
})

export const ForwardedRegion = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The region a conversation occupies, handed back through `rootRef`. A host that has to tell a drop landing on the conversation from one landing beside it asks the element, not the DOM for a `data-slot`. The notice reports what the handed-back element contains: check that it reads *Composer inside*, and that the shell renders exactly as `Default` does — the handle changes nothing about the markup.",
			},
		},
	},
	args: { children: CONVERSATION },
	render: (args) => <RegionProbe {...args} />,
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Composer inside")).toBeVisible()
	},
})

const PROMPT_OVERHANG = 28

const overhangOf = (frame: HTMLElement) => {
	const column = slotIn(frame, "message-scroller-content")
	const { paddingLeft, paddingRight } = getComputedStyle(column)
	const columnBox = column.getBoundingClientRect()
	const promptBox = slotIn(frame, "prompt-input").getBoundingClientRect()
	return {
		start: Math.round(
			columnBox.left + Number.parseFloat(paddingLeft) - promptBox.left,
		),
		end: Math.round(
			promptBox.right - columnBox.right + Number.parseFloat(paddingRight),
		),
	}
}

export const PromptOverhangsTheThread = meta.story({
	render: (args) => (
		<div className="flex flex-col gap-6">
			<div data-slot="overhang-frame" className="h-100 w-[1072px]">
				<ThreadLayout {...args} label="Widest thread" />
			</div>
			<div data-slot="overhang-frame" className="h-100 w-120">
				<ThreadLayout {...args} header={null} label="Narrow thread" />
			</div>
		</div>
	),
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story:
					"Measured on the Final page, artboard 1b Solo a long message the input grows: the thread column is 680 wide and the prompt 736, so the prompt overhangs it by 28 on each side. Check the 28 at the widest thread and at a 480 wide one, where the prompt still keeps the shell inset from the thread card's edges.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [widest, narrow] = slotsIn(canvasElement, "overhang-frame")
		await expect(overhangOf(widest)).toEqual({
			start: PROMPT_OVERHANG,
			end: PROMPT_OVERHANG,
		})
		await expect(
			slotIn(widest, "prompt-input").getBoundingClientRect().width,
		).toBe(736)
		await expect(overhangOf(narrow)).toEqual({
			start: PROMPT_OVERHANG,
			end: PROMPT_OVERHANG,
		})
		const card = narrow.getBoundingClientRect()
		const prompt = slotIn(narrow, "prompt-input").getBoundingClientRect()
		const inset = Number.parseFloat(tokenLengthOf("--shell-inset"))
		await expect(Math.round(prompt.left - card.left)).toBeGreaterThanOrEqual(
			inset,
		)
		await expect(Math.round(card.right - prompt.right)).toBeGreaterThanOrEqual(
			inset,
		)
	},
})

const LONG_ANSWER =
	"The design system lives in `packages/ui`: every component, token and story sits there, and the app only composes them. The Tauri shell in `apps/app` owns the commands, the drivers and the state machines that feed those components. A turn streams through the sidecar, lands in the transcript controller, and reaches the screen as rows the transcript renders one by one."

const SCROLLING_ROWS: TranscriptItem[] = LONG_TRANSCRIPT.map((question) => ({
	key: question,
	render: () => <UserTurn>{question}</UserTurn>,
}))

const LONG_ANSWER_ROW: TranscriptItem = {
	key: "long-answer",
	render: () => (
		<AssistantTurn copyText={LONG_ANSWER} identity={BOT}>
			{LONG_ANSWER}
		</AssistantTurn>
	),
}

const PROMPT_EDGE_TOLERANCE = 1

const lastBubbleAgainstPrompt = (frame: HTMLElement) => {
	const bubble = slotsIn(frame, "message-bubble-content")
		.at(-1)
		?.getBoundingClientRect()
	if (!bubble) throw new globalThis.Error("This thread holds no bubble")
	const prompt = slotIn(frame, "prompt-input").getBoundingClientRect()
	return { start: bubble.left - prompt.left, end: prompt.right - bubble.right }
}

const WEBKIT_SCROLLBAR_GUTTER = "[&_[data-slot=message-scroller-viewport]]:pe-4"

const PROMPT_EDGE_FRAMES = [
	{ label: "Widest thread", className: "w-[1072px]" },
	{ label: "Narrow thread", className: "w-120" },
	{
		label: "Widest thread beside a scrollbar",
		className: cn("w-[1072px]", WEBKIT_SCROLLBAR_GUTTER),
	},
	{
		label: "Narrow thread beside a scrollbar",
		className: cn("w-120", WEBKIT_SCROLLBAR_GUTTER),
	},
]

const PromptEdgeFrames = (args: ThreadLayoutProps) => (
	<div className="flex flex-col gap-6">
		{PROMPT_EDGE_FRAMES.map(({ label, className }) => (
			<div
				key={label}
				data-slot="prompt-edge-frame"
				className={cn("h-100", className)}
			>
				<ThreadLayout {...args} header={null} label={label} />
			</div>
		))}
	</div>
)

export const LongAgentMessageAboveThePrompt = meta.story({
	render: (args) => <PromptEdgeFrames {...args} />,
	args: { rows: [...SCROLLING_ROWS, LONG_ANSWER_ROW], children: null },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, artboard 1b: a long agent answer rests right above the prompt. Check that the answer's start edge sits 28 inside the prompt's start edge, past its rounded corner, in a scrolling thread at full width and at 480 wide, with and without the 16 wide scrollbar the app's webview reserves.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const frame of slotsIn(canvasElement, "prompt-edge-frame")) {
			const { start } = lastBubbleAgainstPrompt(frame)
			await expect(Math.abs(start - PROMPT_OVERHANG)).toBeLessThanOrEqual(
				PROMPT_EDGE_TOLERANCE,
			)
		}
	},
})

export const UserMessageAboveThePrompt = meta.story({
	render: (args) => <PromptEdgeFrames {...args} />,
	args: {
		rows: [
			...SCROLLING_ROWS,
			LONG_ANSWER_ROW,
			{
				key: "follow-up",
				render: () => <UserTurn>{LONG_TRANSCRIPT[0]}</UserTurn>,
			},
		],
		children: null,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Final page, artboard 1b mirrored: your message rests right above the prompt. Check that the bubble's end edge sits 28 inside the prompt's end edge, in a scrolling thread at full width and at 480 wide, with and without the 16 wide scrollbar the app's webview reserves.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		for (const frame of slotsIn(canvasElement, "prompt-edge-frame")) {
			const { end } = lastBubbleAgainstPrompt(frame)
			await expect(Math.abs(end - PROMPT_OVERHANG)).toBeLessThanOrEqual(
				PROMPT_EDGE_TOLERANCE,
			)
		}
	},
})

const COLUMN_FRAME_WIDTHS = [
	{ label: "Wide", className: "w-[1072px]" },
	{ label: "Narrow", className: "w-120" },
]

const COLUMN_FRAMES = [
	{ label: "conversation skeleton", skeleton: <ThreadTranscriptSkeleton /> },
	{ label: "mission skeleton", skeleton: <MissionDetailSkeleton /> },
	{ label: "loaded thread" },
]

const columnOf = (element: HTMLElement, frame: HTMLElement) => {
	const box = element.getBoundingClientRect()
	const { paddingLeft, paddingRight } = getComputedStyle(element)
	const start = Number.parseFloat(paddingLeft)
	return {
		left: box.left + start - frame.getBoundingClientRect().left,
		width: box.width - start - Number.parseFloat(paddingRight),
	}
}

const surfaceOf = (element: HTMLElement, frame: HTMLElement) => {
	const box = element.getBoundingClientRect()
	const { top } = frame.getBoundingClientRect()
	return { top: box.top - top, bottom: box.bottom - top }
}

export const SkeletonInTheTranscriptColumn = meta.story({
	render: (args) => (
		<div className="flex flex-col gap-6">
			{COLUMN_FRAME_WIDTHS.map(({ label, className }) => (
				<div key={label} data-slot="column-frame-row" className="flex gap-6">
					{COLUMN_FRAMES.map((frame) => (
						<div
							key={frame.label}
							data-slot="column-frame"
							className={cn("h-100 shrink-0", className)}
						>
							<ThreadLayout
								{...args}
								header={null}
								label={`${label} ${frame.label}`}
								skeleton={frame.skeleton}
							/>
						</div>
					))}
				</div>
			))}
		</div>
	),
	args: { rows: CONVERSATION_ROWS, children: null },
	globals: { theme_layout: "side-by-side" },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_THREADS,
		docs: {
			description: {
				story:
					"The conversation skeleton and the mission skeleton beside the loaded transcript, at 1072 wide then at 480 wide, in both themes. Every skeleton takes the column the layout hands the loaded transcript, so check that the bubbles start and end on the same edges across a row, and that each skeleton fills the whole surface down to the composer. Pick `Default` for the loaded transcript alone.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = slotsIn(canvasElement, "column-frame-row")
		await expect(rows).toHaveLength(COLUMN_FRAME_WIDTHS.length * BOTH_THEMES)

		for (const row of rows) {
			const frames = slotsIn(row, "column-frame")
			const loadedFrame = frames.at(-1) as HTMLElement
			const loadedColumn = columnOf(
				slotIn(loadedFrame, "message-scroller-content"),
				loadedFrame,
			)
			const loadedSurface = surfaceOf(
				slotIn(loadedFrame, "message-scroller-viewport"),
				loadedFrame,
			)

			for (const frame of frames.slice(0, -1)) {
				const skeleton = slotIn(frame, "list-skeleton")
				await expect(columnOf(skeleton, frame)).toEqual(loadedColumn)
				await expect(surfaceOf(skeleton, frame)).toEqual(loadedSurface)
			}
		}
	},
})

const THREAD_COLUMN_WIDTH = 680

const PROMPT_WIDTH = 736

const expectReferenceWidths = async (canvasElement: HTMLElement) => {
	const frame = slotIn(canvasElement, "window-frame")
	const column = columnOf(slotIn(frame, "message-scroller-content"), frame)
	await expect(column.width).toBe(THREAD_COLUMN_WIDTH)
	await expect(
		slotIn(frame, "prompt-input").getBoundingClientRect().width,
	).toBe(PROMPT_WIDTH)
	await expect(overhangOf(frame)).toEqual({
		start: PROMPT_OVERHANG,
		end: PROMPT_OVERHANG,
	})
}

export const At1280 = meta.story({
	render: (args) => (
		<div data-slot="window-frame" className="h-svh w-[1280px]">
			<ThreadLayout {...args} label="Thread at 1280" />
		</div>
	),
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story:
					"Conversation feed, artboards 1 to 11, the thread in a 1280 wide window. Check that the thread column is 680 wide, the prompt 736, and that the prompt overhangs the column by 28 on each side.",
			},
		},
	},
	play: async ({ canvasElement }) => expectReferenceWidths(canvasElement),
})

export const At1728 = meta.story({
	render: (args) => (
		<div data-slot="window-frame" className="h-svh w-[1728px]">
			<ThreadLayout {...args} label="Thread at 1728" />
		</div>
	),
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story:
					"Conversation feed, artboards 1 to 11, the thread in a 1728 wide window. Check that the thread column stays 680 wide and the prompt 736, both centred, however wide the window gets.",
			},
		},
	},
	play: async ({ canvasElement }) => expectReferenceWidths(canvasElement),
})

const expectThreadWithComposer = async (canvasElement: HTMLElement) => {
	const frame = slotIn(canvasElement, "window-frame")
	const thread = slotIn(frame, "message-scroller-content")
	const prompt = slotIn(frame, "prompt-input")
	const lane = prompt.closest<HTMLElement>("[data-slot='chat-layout'] > div")
	const turns = slotsIn(thread, "message-scroller-item")
	const { paddingTop, paddingBottom } = getComputedStyle(thread)
	await expectReferenceWidths(canvasElement)
	await expect([paddingTop, paddingBottom]).toEqual(["32px", "24px"])
	await expect(
		turns[1].getBoundingClientRect().top -
			turns[0].getBoundingClientRect().bottom,
	).toBe(32)
	await expect(lane).not.toBeNull()
	const { paddingInlineStart, paddingInlineEnd } = getComputedStyle(
		lane as HTMLElement,
	)
	await expect([paddingInlineStart, paddingInlineEnd]).toEqual(["8px", "8px"])

	const field = within(prompt).getByRole("textbox")
	const { fontSize, lineHeight } = getComputedStyle(field)
	await expect([fontSize, lineHeight]).toEqual(["14px", "24px"])
}

const ThreadWithComposer = (props: ThreadLayoutProps) => (
	<div data-slot="window-frame" className="h-svh w-[1280px]">
		<ThreadLayout {...props} label="Thread with its composer" />
	</div>
)

const COMPOSER_KEPT_AS_IT_IS =
	"The composer is shared with other surfaces and stays as it is: the artboards draw it with radius 16, padding 12, a gap of 12, a 28 round send button and 16 under it, where it renders radius 25, padding 8, a gap of 4, a 32 round send button and 8 under it."

export const WithComposer = meta.story({
	globals: { theme: "light" },
	render: (args) => <ThreadWithComposer {...args} />,
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story: `Conversation feed, artboards 3, 4 and 7, light: the thread over its composer. Check that the thread starts 32 under the header and ends 24 above the composer, that its column is 680 wide with turns 32 apart, that the composer is 736 wide in a lane padded 8 on each side, and that its placeholder reads 14 on 24. ${COMPOSER_KEPT_AS_IT_IS} Pick \`WithComposerDark\` for the dark theme.`,
			},
		},
	},
	play: async ({ canvasElement }) => expectThreadWithComposer(canvasElement),
})

export const WithComposerDark = meta.story({
	globals: { theme: "dark" },
	render: (args) => <ThreadWithComposer {...args} />,
	args: { rows: CONVERSATION_ROWS, children: null },
	parameters: {
		docs: {
			description: {
				story: `Conversation feed, artboards 3, 4 and 7, dark. The same thread as \`WithComposer\` on the dark shell. Check that the thread and the composer keep the same places. ${COMPOSER_KEPT_AS_IT_IS}`,
			},
		},
	},
	play: async ({ canvasElement }) => expectThreadWithComposer(canvasElement),
})
