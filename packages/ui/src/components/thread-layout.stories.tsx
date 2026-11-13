import { type ReactNode, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	botIdentityAvatars,
	colourTransitionsOf,
	LAPTOP_WINDOW,
	mergeA11y,
	probedStyleOf,
	slotIn,
	slotsIn,
	tokenLengthOf,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { ConnectionStatusState } from "@workspace/ui/components/connection-status"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { LIBRARY_LIGHTBOX_IMAGES } from "@workspace/ui/components/library.fixtures"
import { LibraryLightbox } from "@workspace/ui/components/library-lightbox"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import { NO_EARLIER_TODAY } from "@workspace/ui/components/missions.fixtures"
import { Notice } from "@workspace/ui/components/notice"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptQueue } from "@workspace/ui/components/prompt-queue"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	RoutinesPanel,
	RoutinesPanelTrigger,
} from "@workspace/ui/components/routines-panel"
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
const TRANSCRIPT_BOTTOM_PADDING = 16

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
		const agentBubble = canvasElement.querySelector(
			'[data-slot="message"][data-from="assistant"] [data-slot="message-bubble"]',
		)
		await expect(agentBubble).toHaveStyle({ maxWidth: "580px" })
		for (const bubble of canvasElement.querySelectorAll(
			'[data-slot="message-bubble-content"]',
		)) {
			await expect(bubble).toHaveStyle({
				paddingTop: "18px",
				paddingRight: "18px",
				paddingBottom: "18px",
				paddingLeft: "18px",
			})
		}
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

const PROMPT_OVERHANG = 20

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
					"Measured on the Final page, artboard 1b Solo a long message the input grows: the bubbles column is 680 wide and the prompt 720, so the prompt overhangs it by 20 on each side and the bubbles edge meets the start of its rounded corner. Check the 20 at the widest thread and at a 480 wide one, where the prompt still keeps the shell inset from the thread card's edges.",
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
		).toBe(720)
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
					"Final page, artboard 1b: a long agent answer rests right above the prompt. Check that the bubble's start edge sits 20 inside the prompt's start edge, past its rounded corner, in a scrolling thread at full width and at 480 wide, with and without the 16 wide scrollbar the app's webview reserves.",
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
					"Final page, artboard 1b mirrored: your message rests right above the prompt. Check that the bubble's end edge sits 20 inside the prompt's end edge, in a scrolling thread at full width and at 480 wide, with and without the 16 wide scrollbar the app's webview reserves.",
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

const HEADER_ISLAND_INSET = 8

const HEADER_ISLAND_HEIGHT = 40

const HEADER_CONTROL_SIZE = 32

const CONVERSATION_CONTENT_TOP = 56

const NARROW_CONVERSATION_WIDTH = 400

const HEADER_ISLAND_EDGE = 5

const TWO_CONTROL_ISLAND_WIDTH = 76

const SOLO_NAME = "Ichi"

const SOLO_ROLE = "Frontend engineer"

const GROUP_TITLE = "Launch checklist"

const LONG_GROUP_TITLE =
	"Launch checklist for the 0.42 release and the notes that ship with it"

const openSubjectSettings = fn()

const FLOATING_CONTROLS = (
	<>
		<PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />
		<RoutinesPanelTrigger />
	</>
)

const SOLO_ISLANDS = (
	<AppHeader
		isFloating
		leading={
			<HeaderIdentityButton
				blot={BOT.blot}
				connection="ready"
				name={SOLO_NAME}
				onOpenSettings={openSubjectSettings}
				seed={BOT.id}
				title={SOLO_ROLE}
				version="2.1.233"
			/>
		}
		trailing={FLOATING_CONTROLS}
	/>
)

const groupIslands = (name: string) => (
	<AppHeader
		isFloating
		leading={
			<HeaderConversationButton
				color={BLOT_HUES.blue}
				name={name}
				onOpenSettings={openSubjectSettings}
			/>
		}
		trailing={FLOATING_CONTROLS}
	/>
)

const LONG_CONVERSATION_ROWS: TranscriptItem[] = [
	...LONG_TRANSCRIPT,
	...LONG_TRANSCRIPT,
	...LONG_TRANSCRIPT,
].map((question, turn) => ({
	key: `turn-${turn}`,
	render: () => <UserTurn>{question}</UserTurn>,
}))

const FLOATING_THREAD = {
	isHeaderFloating: true,
	rows: CONVERSATION_ROWS,
	children: null,
}

const inRoutinesShell = (Story: () => ReactNode) => (
	<div className="h-svh bg-card" data-content-card="">
		<RoutinesPanel
			failure={null}
			isOpen={false}
			missions={{ open: [], earlierToday: NO_EARLIER_TODAY, onOpen: fn() }}
			onDelete={fn()}
			onEnabledChange={fn()}
			onOpenChange={fn()}
			onRetry={fn()}
			routines={[]}
		>
			<Story />
		</RoutinesPanel>
	</div>
)

const inNarrowConversation = (Story: () => ReactNode) => (
	<div style={{ width: NARROW_CONVERSATION_WIDTH }}>
		<Story />
	</div>
)

const boxOf = (element: Element) => element.getBoundingClientRect()

const expectConversationIslands = async (
	canvasElement: HTMLElement,
	subjectSlot: string,
) => {
	const layout = slotIn(canvasElement, "chat-layout")
	const frame = boxOf(layout)
	const bar = slotIn(layout, "app-header")
	const [leading, trailing] = slotsIn(bar, "header-island")
	const subject = slotIn(leading, subjectSlot)
	const gear = subject.lastElementChild as HTMLElement
	const pins = slotIn(trailing, "pinned-messages-trigger")

	await expect(getComputedStyle(bar).borderBottomWidth).toBe("0px")
	await expect([
		boxOf(leading).left - frame.left,
		boxOf(leading).top - frame.top,
		boxOf(leading).height,
	]).toEqual([HEADER_ISLAND_INSET, HEADER_ISLAND_INSET, HEADER_ISLAND_HEIGHT])
	await expect([
		frame.right - boxOf(trailing).right,
		boxOf(trailing).top - frame.top,
		boxOf(trailing).height,
	]).toEqual([HEADER_ISLAND_INSET, HEADER_ISLAND_INSET, HEADER_ISLAND_HEIGHT])

	await expect(within(leading).getAllByRole("button")).toEqual([subject])
	await expect(subject).toHaveAttribute("aria-expanded", "false")
	await expect([
		boxOf(subject).left - boxOf(leading).left,
		boxOf(subject).height,
		boxOf(leading).right - boxOf(subject).right,
	]).toEqual([HEADER_ISLAND_EDGE, HEADER_CONTROL_SIZE, HEADER_ISLAND_EDGE])
	await expect([
		boxOf(gear).width,
		boxOf(subject).right - boxOf(gear).right,
	]).toEqual([HEADER_CONTROL_SIZE, 0])
	await expect(boxOf(gear.firstElementChild as Element).width).toBe(16)
	await expect([boxOf(pins).width, boxOf(pins).height]).toEqual([
		HEADER_CONTROL_SIZE,
		HEADER_CONTROL_SIZE,
	])
	await expect(boxOf(pins.firstElementChild as Element).width).toBe(16)
	await withMotionAllowed(async () => {
		await expect(colourTransitionsOf(subject)).toEqual([])
		await expect(colourTransitionsOf(pins)).toEqual([])
	})
	await waitFor(() =>
		expect(
			getComputedStyle(slotIn(layout, "message-scroller-content")).paddingTop,
		).toBe(`${CONVERSATION_CONTENT_TOP}px`),
	)

	return { frame, leading, trailing, subject, gear }
}

const expectSoloIslands = async (canvasElement: HTMLElement) => {
	const islands = await expectConversationIslands(
		canvasElement,
		"header-identity-button",
	)
	const [avatar] = botIdentityAvatars(islands.subject)
	const dot = slotIn(islands.subject, "connection-status")
		.firstElementChild as HTMLElement

	await expect(islands.subject).toHaveAccessibleName(
		`${SOLO_NAME} · agent settings`,
	)
	await expect(boxOf(avatar).width).toBe(24)
	await expect([boxOf(dot).width, boxOf(dot).height]).toEqual([6, 6])

	return { ...islands, dot, role: slotIn(islands.subject, "bot-title-badge") }
}

const expectIslandSurface = async (
	canvasElement: HTMLElement,
	surface: "bg-card" | "bg-card-raised",
) => {
	for (const island of slotsIn(canvasElement, "header-island")) {
		await expect(getComputedStyle(island).backgroundColor).toBe(
			tokenStyleIn(island, surface, "backgroundColor"),
		)
	}
}

const ASSEMBLED_ONCE_THE_APP_OPTS_IN =
	"`apps/app/src/components/thread-screen.tsx:477` assembles it once it passes `isFloating` to the header and `isHeaderFloating` to the layout."

export const Solo1a = meta.story({
	args: { ...FLOATING_THREAD, header: SOLO_ISLANDS },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1a, a conversation with one agent. Check that no bar and no rule cross the top: the leading island sits 8px from the top and the side and holds one button, the avatar, the name, the role chip, the connection dot and the gear in its 32px cell; the trailing island sits 8px from the other side and holds the pins control as a 32px cell. Check the transcript starts 56px from the top and that neither control animates its colours. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const { subject, role } = await expectSoloIslands(canvasElement)

		await expectIslandSurface(canvasElement, "bg-card")
		await expect(role).toBeVisible()
		await expect(role).toHaveTextContent(SOLO_ROLE)
		await expect(slotsIn(canvasElement, "screen-layout-fade")).toHaveLength(0)

		await userEvent.click(subject)
		await expect(openSubjectSettings).toHaveBeenCalledOnce()
	},
})

export const SoloDark1b = meta.story({
	args: Solo1a.input.args,
	decorators: [inRoutinesShell],
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1b, the conversation with one agent in the dark theme. Check that both islands wear the raised card surface and keep the geometry of `Solo1a`. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSoloIslands(canvasElement)
		await expectIslandSurface(canvasElement, "bg-card-raised")
	},
})

export const SoloScrolled1c = meta.story({
	args: { ...Solo1a.input.args, rows: LONG_CONVERSATION_ROWS },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1c, a conversation with one agent long enough to scroll. Check that the turns pass under both islands and that the top fade of the layout covers them as they leave. Pick `Solo1a` for a conversation short enough to rest whole. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSoloIslands(canvasElement)
		await waitFor(() => slotIn(canvasElement, "screen-layout-fade"))
	},
})

export const SoloNarrow1d = meta.story({
	args: Solo1a.input.args,
	decorators: [inRoutinesShell, inNarrowConversation],
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1d, the conversation with one agent in a thread 400px wide. Check that the role chip is gone and that the name, the connection dot and the gear stay whole inside the leading island, with the trailing island whole beside it. Pick `Solo1a` for the width that keeps the role. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { frame, leading, trailing, subject, role, dot, gear } =
			await expectSoloIslands(canvasElement)
		const name = within(subject).getByText(SOLO_NAME)

		await expect(frame.width).toBe(NARROW_CONVERSATION_WIDTH)
		await expect(role).not.toBeVisible()
		await expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
		for (const whole of [dot, gear]) {
			await expect(boxOf(whole).right).toBeLessThanOrEqual(
				boxOf(leading).right - 4,
			)
		}
		await expect(boxOf(leading).right).toBeLessThan(boxOf(trailing).left)
	},
})

export const Group2a = meta.story({
	args: { ...FLOATING_THREAD, header: groupIslands(GROUP_TITLE) },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2a, a group conversation. Check the same two islands as `Solo1a`, the leading one holding one button made of the 24px subject icon, the title and the gear, with no role chip and no connection dot. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const { subject } = await expectConversationIslands(
			canvasElement,
			"header-conversation-button",
		)

		await expectIslandSurface(canvasElement, "bg-card")
		await expect(subject).toHaveAccessibleName(
			`${GROUP_TITLE} · conversation settings`,
		)
		const tile = slotIn(subject, "conversation-subject-icon-tile")
		await expect([boxOf(tile).width, boxOf(tile).height]).toEqual([24, 24])
		await expect(getComputedStyle(tile).borderTopLeftRadius).toBe("6px")
		await expect(slotsIn(subject, "bot-title-badge")).toHaveLength(0)
		await expect(slotsIn(subject, "connection-status")).toHaveLength(0)

		await userEvent.click(subject)
		await expect(openSubjectSettings).toHaveBeenCalledOnce()
	},
})

export const GroupDark2b = meta.story({
	args: Group2a.input.args,
	decorators: [inRoutinesShell],
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2b, the group conversation in the dark theme. Check that both islands wear the raised card surface and keep the geometry of `Group2a`. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConversationIslands(canvasElement, "header-conversation-button")
		await expectIslandSurface(canvasElement, "bg-card-raised")
	},
})

export const GroupScrolled2c = meta.story({
	args: { ...Group2a.input.args, rows: LONG_CONVERSATION_ROWS },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2c, a group conversation long enough to scroll. Check that the turns pass under both islands and that the top fade of the layout covers them as they leave. Pick `Group2a` for a conversation short enough to rest whole. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectConversationIslands(canvasElement, "header-conversation-button")
		await waitFor(() => slotIn(canvasElement, "screen-layout-fade"))
	},
})

export const GroupNarrow2d = meta.story({
	args: { ...FLOATING_THREAD, header: groupIslands(LONG_GROUP_TITLE) },
	decorators: [inRoutinesShell, inNarrowConversation],
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2d, a group conversation with a title written as a sentence, in a thread 400px wide. Check that the title truncates with an ellipsis, that the gear keeps its 32px cell inside the leading island, and that the trailing island stays whole, 8px from the side. Pick `Group2a` for a title that fits. " +
					ASSEMBLED_ONCE_THE_APP_OPTS_IN,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const { frame, leading, trailing } = await expectConversationIslands(
			canvasElement,
			"header-conversation-button",
		)
		const title = canvas.getByText(LONG_GROUP_TITLE)

		await expect(frame.width).toBe(NARROW_CONVERSATION_WIDTH)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")
		await expect(boxOf(leading).right).toBeLessThan(boxOf(trailing).left)
		await expect(boxOf(trailing).width).toBe(TWO_CONTROL_ISLAND_WIDTH)
	},
})
