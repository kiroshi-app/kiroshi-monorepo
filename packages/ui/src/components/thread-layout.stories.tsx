import { type ReactNode, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	botIdentityAvatars,
	colourTransitionsOf,
	expectHeaderTitleStep,
	expectHeaderTopLineStep,
	expectStaticHeaderBar,
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
import { MissionProperties } from "@workspace/ui/components/mission-properties"
import {
	MISSION_NOW,
	MISSION_PULL_REQUEST,
	MISSION_TICKET,
	NO_EARLIER_TODAY,
} from "@workspace/ui/components/missions.fixtures"
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
					"The whole chat screen shell: a fixed header, a transcript that always fills every pixel between header and composer, and a composer that keeps its natural height. A transcript shorter than its viewport rests its last row against the composer and leaves the free space above its first row, the way a conversation reads. The transcript region still stretches, so a lone child that centres itself with `m-auto` stays centred in the free space. It owns no data and no scroll logic of its own: it wraps MessageScroller and lets the transcript run the full width of the shell. `opening` is handed to the transcript as it is, to stand at the top of the thread over the first row, takes no room when it renders nothing, and is not drawn while `skeleton` stands in for the transcript.",
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

const overhangOf = (
	frame: HTMLElement,
	columnSlot = "message-scroller-content",
) => {
	const column = slotIn(frame, columnSlot)
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

const columnWidthOf = (
	frame: HTMLElement,
	columnSlot = "message-scroller-content",
) => {
	const column = slotIn(frame, columnSlot)
	const { paddingLeft, paddingRight } = getComputedStyle(column)
	return Math.round(
		column.getBoundingClientRect().width -
			Number.parseFloat(paddingLeft) -
			Number.parseFloat(paddingRight),
	)
}

const SOLO_COLUMN_WIDTH = 680

const MISSION_COLUMN_WIDTH = 640

const NARROW_FRAME_WIDTH = 480

const HISTORY_LOADED = { hasNextPage: false, isFetchingNextPage: false }

const inOverhangFrames = (args: ThreadLayoutProps) => (
	<div className="flex flex-col gap-6">
		<div data-slot="overhang-frame" className="h-100 w-[1072px]">
			<ThreadLayout {...args} label="Widest thread" />
		</div>
		<div data-slot="overhang-frame" className="h-100 w-120">
			<ThreadLayout {...args} header={null} label="Narrow thread" />
		</div>
	</div>
)

export const PromptOverhangsTheThread = meta.story({
	render: inOverhangFrames,
	args: { rows: CONVERSATION_ROWS, children: null, older: HISTORY_LOADED },
	parameters: {
		docs: {
			description: {
				story:
					"Measured on the Final page, artboard 1b Solo a long message the input grows: the bubbles column is 680 wide and the prompt 720, so the prompt overhangs it by 20 on each side and the bubbles edge meets the start of its rounded corner. Check the 20 at the widest thread and at a 480 wide one, where the prompt still keeps the shell inset from the thread card's edges, and that a thread with no `opening` keeps its start of history line once the last page has landed. Pick `PromptOverhangsTheMissionThread` for a mission thread.",
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
		await expect(columnWidthOf(widest)).toBe(SOLO_COLUMN_WIDTH)
		await expect(slotsIn(widest, "transcript-start-of-history")).toHaveLength(1)
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

const MISSION_OPENING = (
	<MissionProperties
		now={MISSION_NOW}
		onOpenCodingSession={fn()}
		openedAt={MISSION_NOW - 7_200_000}
		pullRequest={MISSION_PULL_REQUEST}
		ticket={MISSION_TICKET}
	/>
)

const COLUMN_FRAMES = [
	{ label: "conversation skeleton", skeleton: <ThreadTranscriptSkeleton /> },
	{ label: "loaded conversation", columnWidth: SOLO_COLUMN_WIDTH },
	{ label: "mission skeleton", skeleton: <MissionDetailSkeleton /> },
	{
		label: "loaded mission",
		opening: MISSION_OPENING,
		columnWidth: MISSION_COLUMN_WIDTH,
	},
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
								opening={frame.opening}
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
					"The conversation skeleton beside the loaded conversation, then the mission skeleton, given no `opening` as the app gives it none, beside the loaded mission, at 1072 wide then at 480 wide, in both themes. Every skeleton takes the column the layout hands its loaded transcript, 680 for a conversation and 640 for a mission, so check that the bubbles start and end on the same edges within each pair, that at 480 wide both columns shrink inside the same gutters, and that each skeleton fills the whole surface down to the composer. Pick `Default` for the loaded transcript alone.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = slotsIn(canvasElement, "column-frame-row")
		await expect(rows).toHaveLength(COLUMN_FRAME_WIDTHS.length * BOTH_THEMES)

		const gutter =
			Number.parseFloat(tokenLengthOf("--shell-inset")) + PROMPT_OVERHANG

		for (const row of rows) {
			const frames = slotsIn(row, "column-frame")

			for (let index = 0; index < frames.length; index += 2) {
				const skeletonFrame = frames[index]
				const loadedFrame = frames[index + 1]
				const { columnWidth = 0 } = COLUMN_FRAMES[index + 1]
				const skeleton = slotIn(skeletonFrame, "list-skeleton")
				const loadedColumn = columnOf(
					slotIn(loadedFrame, "message-scroller-content"),
					loadedFrame,
				)

				await expect(columnOf(skeleton, skeletonFrame)).toEqual(loadedColumn)
				await expect(surfaceOf(skeleton, skeletonFrame)).toEqual(
					surfaceOf(
						slotIn(loadedFrame, "message-scroller-viewport"),
						loadedFrame,
					),
				)
				await expect(Math.round(loadedColumn.width)).toBe(
					Math.min(
						columnWidth,
						loadedFrame.getBoundingClientRect().width - 2 * gutter,
					),
				)
			}
		}
	},
})

const NARROW_CONVERSATION_WIDTH = 400

const HEADER_BAR_INSET = 12

const CAPSULE_BUTTON = 28

const TWO_BUTTON_CAPSULE_WIDTH = 62

const CONVERSATION_CONTENT_TOP = "32px"

const SOLO_NAME = "Ichi"

const SOLO_ROLE = "Frontend engineer"

const GROUP_TITLE = "Launch checklist"

const LONG_GROUP_TITLE =
	"Launch checklist for the 0.42 release and the notes that ship with it"

const openSubjectSettings = fn()

const CAPSULE_CONTROLS = (
	<>
		<PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />
		<RoutinesPanelTrigger />
	</>
)

const SOLO_BAR = (
	<AppHeader
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
		trailing={CAPSULE_CONTROLS}
	/>
)

const groupBar = (name: string) => (
	<AppHeader
		leading={
			<HeaderConversationButton
				color={BLOT_HUES.blue}
				icon="FileText"
				name={name}
				onOpenSettings={openSubjectSettings}
			/>
		}
		trailing={CAPSULE_CONTROLS}
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

const THREAD_UNDER_THE_BAR = {
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

const centreOf = (element: Element) =>
	(boxOf(element).top + boxOf(element).bottom) / 2

const expectConversationBar = async (
	canvasElement: HTMLElement,
	subjectSlot: string,
	name: string,
	settingsName: string,
) => {
	const layout = slotIn(canvasElement, "chat-layout")
	const frame = boxOf(layout)
	const bar = await expectStaticHeaderBar(layout)
	const leading = slotIn(bar, "app-header-leading")
	const subject = slotIn(leading, subjectSlot)
	const gear = within(subject).getByRole("button", { name: settingsName })
	const capsule = slotIn(bar, "app-header-capsule")
	const [pins, handoff] = within(capsule).getAllByRole("button")
	const title = within(subject).getByText(name)

	await expect(within(leading).getAllByRole("button")).toEqual([gear])
	await expect(gear).toHaveAttribute("aria-expanded", "false")
	await expect([
		boxOf(subject).left - frame.left,
		getComputedStyle(subject).columnGap,
	]).toEqual([HEADER_BAR_INSET, "10px"])
	await expect([boxOf(gear).width, boxOf(gear).height]).toEqual([
		CAPSULE_BUTTON,
		CAPSULE_BUTTON,
	])
	await expect(boxOf(gear.firstElementChild as Element).width).toBe(14)
	await expect(getComputedStyle(gear).color).toBe(
		tokenStyleIn(gear, "text-muted-foreground", "color"),
	)
	await expectHeaderTitleStep(title)

	await expect([
		frame.right - boxOf(capsule).right,
		boxOf(capsule).width,
		boxOf(capsule).height,
		getComputedStyle(capsule).padding,
		getComputedStyle(capsule).columnGap,
	]).toEqual([HEADER_BAR_INSET, TWO_BUTTON_CAPSULE_WIDTH, 32, "2px", "2px"])
	await expect(getComputedStyle(capsule).backgroundColor).toBe(
		tokenStyleIn(
			capsule,
			capsule.closest(".dark") ? "bg-white/6" : "bg-foreground/5",
			"backgroundColor",
		),
	)
	await expect(pins).toHaveAccessibleName("Pinned messages")
	for (const control of [pins, handoff]) {
		await expect([boxOf(control).width, boxOf(control).height]).toEqual([
			CAPSULE_BUTTON,
			CAPSULE_BUTTON,
		])
		await expect(boxOf(control.firstElementChild as Element).width).toBe(16)
		await expect(getComputedStyle(control).color).toBe(
			tokenStyleIn(control, "text-soft-foreground", "color"),
		)
	}
	await withMotionAllowed(async () => {
		await expect(colourTransitionsOf(gear)).toEqual([])
		await expect(colourTransitionsOf(pins)).toEqual([])
	})
	await waitFor(() =>
		expect(
			getComputedStyle(slotIn(layout, "message-scroller-content")).paddingTop,
		).toBe(CONVERSATION_CONTENT_TOP),
	)

	return { layout, frame, bar, subject, gear, capsule, title }
}

const expectSoloBar = async (canvasElement: HTMLElement) => {
	const parts = await expectConversationBar(
		canvasElement,
		"header-identity-button",
		SOLO_NAME,
		`${SOLO_NAME} · agent settings`,
	)
	const [avatar] = botIdentityAvatars(parts.subject)
	const topLine = slotIn(parts.subject, "app-header-top-line")
	const role = within(topLine).getByText(SOLO_ROLE)
	const dot = slotIn(topLine, "connection-status")
		.firstElementChild as HTMLElement

	await expect([boxOf(avatar).width, boxOf(avatar).height]).toEqual([32, 32])
	await expectHeaderTopLineStep(topLine)
	await expect(boxOf(topLine).bottom).toBe(boxOf(parts.title).top)
	await expect([boxOf(dot).width, boxOf(dot).height]).toEqual([6, 6])
	await expect(Math.round(boxOf(dot).left - boxOf(role).right)).toBe(6)

	return { ...parts, role }
}

const expectGroupBar = async (canvasElement: HTMLElement, name: string) => {
	const parts = await expectConversationBar(
		canvasElement,
		"header-conversation-button",
		name,
		`${name} · conversation settings`,
	)
	const tile = slotIn(parts.subject, "conversation-subject-icon-tile")

	await expect([boxOf(tile).width, boxOf(tile).height]).toEqual([32, 32])
	await expect(getComputedStyle(tile).borderTopLeftRadius).toBe("8px")
	await expect(slotsIn(parts.subject, "app-header-top-line")).toHaveLength(0)
	await expect(slotsIn(parts.subject, "connection-status")).toHaveLength(0)
	await expect(centreOf(parts.title)).toBe(centreOf(tile))

	return parts
}

const expectTurnsLeaveAtTheBarEdge = async (
	layout: HTMLElement,
	bar: HTMLElement,
) => {
	const content = slotIn(layout, "message-scroller-content")

	await waitFor(() =>
		expect(boxOf(content).top).toBeLessThan(boxOf(bar).bottom),
	)
	await expectStaticHeaderBar(layout)
}

const WORN_BY_THE_APP =
	"`apps/app/src/components/thread-screen.tsx:477` assembles it."

export const Solo1a = meta.story({
	args: { ...THREAD_UNDER_THE_BAR, header: SOLO_BAR },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I1a, a conversation with one agent. Check the one bar across the top, 56px tall on the content surface with a 1px rule under it and no fade: the 32px hexagonal avatar 12px from the side, the role and the 6px presence dot on the 12px top line over the agent name in 14px semibold, then the 28px settings button with its 14px gear; on the other side the capsule, 12px from the edge, holding the pins control then the handoff, two 28px circles 2px apart. Check the transcript starts 32px under the bar and that no control animates its colours. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const { gear, role } = await expectSoloBar(canvasElement)

		await expect(role).toBeVisible()
		await userEvent.click(gear)
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
					"Artboard I1b, the conversation with one agent in the dark theme. Check that the bar keeps the geometry of `Solo1a`, its rule and its capsule drawn in white at 8 and 6 percent. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSoloBar(canvasElement)
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
					"Artboard I1c, a conversation with one agent long enough to scroll. Check that the turns leave at the edge of the bar and that the bar stays as it is in `Solo1a`: same place, no fade, no shadow. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { layout, bar } = await expectSoloBar(canvasElement)

		await expectTurnsLeaveAtTheBarEdge(layout, bar)
	},
})

export const SoloNarrow1d = meta.story({
	args: Solo1a.input.args,
	decorators: [inRoutinesShell, inNarrowConversation],
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I1d, the conversation with one agent in a thread 400px wide. Check the same bar: the role, the name and the settings button whole on the leading side, and the capsule at its full width, 12px from the edge. Pick `GroupNarrow2d` for a title too long to fit. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { frame, gear, capsule, title } = await expectSoloBar(canvasElement)

		await expect(frame.width).toBe(NARROW_CONVERSATION_WIDTH)
		await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
		await expect(boxOf(gear).right).toBeLessThan(boxOf(capsule).left)
	},
})

export const Group2a = meta.story({
	args: { ...THREAD_UNDER_THE_BAR, header: groupBar(GROUP_TITLE) },
	decorators: [inRoutinesShell],
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I2a, a group conversation. Check the same bar as `Solo1a` with no top line: the 32px subject tile, a square with 8px corners in the conversation colour, the title alone on the tile's centre line, then the settings button and the capsule. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const { gear } = await expectGroupBar(canvasElement, GROUP_TITLE)

		await userEvent.click(gear)
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
					"Artboard I2b, the group conversation in the dark theme. Check that the bar keeps the geometry of `Group2a`, its rule and its capsule drawn in white at 8 and 6 percent. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectGroupBar(canvasElement, GROUP_TITLE)
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
					"Artboard I2c, a group conversation long enough to scroll. Check that the turns leave at the edge of the bar and that the bar stays as it is in `Group2a`: same place, no fade, no shadow. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { layout, bar } = await expectGroupBar(canvasElement, GROUP_TITLE)

		await expectTurnsLeaveAtTheBarEdge(layout, bar)
	},
})

export const GroupNarrow2d = meta.story({
	args: { ...THREAD_UNDER_THE_BAR, header: groupBar(LONG_GROUP_TITLE) },
	decorators: [inRoutinesShell, inNarrowConversation],
	parameters: {
		docs: {
			description: {
				story:
					"Artboard I2d, a group conversation with a title written as a sentence, in a thread 400px wide. Check that the title ends in an ellipsis before the settings button, and that the settings button and the capsule keep their full size, the capsule 12px from the edge. Pick `Group2a` for a title that fits. " +
					WORN_BY_THE_APP,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { frame, gear, capsule, title } = await expectGroupBar(
			canvasElement,
			LONG_GROUP_TITLE,
		)

		await expect(frame.width).toBe(NARROW_CONVERSATION_WIDTH)
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(boxOf(gear).right).toBeLessThan(boxOf(capsule).left)
	},
})

const OPENING_UNDER_THE_BAR = 24

const OPENING_OVER_THE_FIRST_TURN = 16

export const Opening = meta.story({
	args: { ...THREAD_UNDER_THE_BAR, opening: MISSION_OPENING },
	parameters: {
		docs: {
			description: {
				story:
					"A thread given an `opening`, here the properties of a mission, under the static bar. Check that the properties block stands 24px under the bar, not the 32px a thread without an opening keeps, that the first turn follows 16px under its rule, and that the two turns read from the top of the thread instead of resting against the composer. Pick `Default` for a thread without an opening. Nothing in `apps/app` passes `opening` yet.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		const content = slotIn(layout, "message-scroller-content")
		const opening = slotIn(content, "transcript-opening")
		const block = boxOf(slotIn(opening, "mission-properties"))
		const [firstTurn] = slotsIn(content, "message-scroller-item")

		await expect(content.firstElementChild).toBe(opening)
		await expect([
			block.top - boxOf(slotIn(layout, "app-header")).bottom,
			boxOf(firstTurn).top - block.bottom,
		]).toEqual([OPENING_UNDER_THE_BAR, OPENING_OVER_THE_FIRST_TURN])
	},
})

export const PromptOverhangsTheMissionThread = meta.story({
	render: inOverhangFrames,
	args: {
		rows: CONVERSATION_ROWS,
		children: null,
		older: HISTORY_LOADED,
		opening: MISSION_OPENING,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Measured on the Final page, artboards 3a to 3e: a thread given an `opening`, the properties of a mission, lays its column at 640 instead of the 680 of `PromptOverhangsTheThread`, and opens on the properties block with no start of history line above it. Check that the prompt still overhangs that column by 20 on each side, so it is 680 wide, and that in a 480 wide thread the column shrinks inside the same gutters a solo thread keeps. The app assembles it at `apps/app/src/components/thread-screen.tsx:1977`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [widest, narrow] = slotsIn(canvasElement, "overhang-frame")
		const gutter =
			Number.parseFloat(tokenLengthOf("--shell-inset")) + PROMPT_OVERHANG

		for (const frame of [widest, narrow]) {
			await expect(slotsIn(frame, "transcript-start-of-history")).toHaveLength(
				0,
			)
			await expect(overhangOf(frame)).toEqual({
				start: PROMPT_OVERHANG,
				end: PROMPT_OVERHANG,
			})
		}
		await expect(columnWidthOf(widest)).toBe(MISSION_COLUMN_WIDTH)
		await expect(
			slotIn(widest, "prompt-input").getBoundingClientRect().width,
		).toBe(MISSION_COLUMN_WIDTH + 2 * PROMPT_OVERHANG)
		await expect(columnWidthOf(narrow)).toBe(NARROW_FRAME_WIDTH - 2 * gutter)
	},
})

const EMPTY_MISSION_OPENING = (
	<MissionProperties
		now={MISSION_NOW}
		openedAt={MISSION_NOW - 7_200_000}
		ticket={{ externalId: "", title: "", platform: "", url: "" }}
	/>
)

const ThreadWithDroppedOpening = (props: ThreadLayoutProps) => {
	const [isDropped, setDropped] = useState(false)

	return (
		<ThreadLayout
			{...props}
			notice={
				<Button onClick={() => setDropped(true)}>Drop the opening</Button>
			}
			opening={isDropped ? undefined : props.opening}
		/>
	)
}

const firstTurnUnderTheBar = (layout: HTMLElement) => {
	const [firstTurn] = slotsIn(layout, "message-scroller-item")
	return boxOf(firstTurn).top - boxOf(slotIn(layout, "app-header")).bottom
}

export const OpeningThatRendersNothing = meta.story({
	tags: ["test-only"],
	args: { ...THREAD_UNDER_THE_BAR, opening: EMPTY_MISSION_OPENING },
	render: (args) => <ThreadWithDroppedOpening {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A thread under the static bar given the properties of a mission with no ticket, no status and no pull request, which render nothing. Check that no properties block is drawn and that the first turn stands as far under the bar as once *Drop the opening* leaves the thread with no opening at all, the two turns resting against the composer.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		await expect(slotsIn(layout, "mission-properties")).toHaveLength(0)
		const withEmptyOpening = firstTurnUnderTheBar(layout)

		await userEvent.click(
			canvas.getByRole("button", { name: "Drop the opening" }),
		)

		await expect(slotsIn(layout, "transcript-opening")).toHaveLength(0)
		await expect(firstTurnUnderTheBar(layout)).toBe(withEmptyOpening)
	},
})

export const OpeningHeldBackBySkeleton = meta.story({
	args: { ...Opening.input.args, skeleton: <MissionDetailSkeleton /> },
	globals: LAPTOP_WINDOW,
	parameters: {
		docs: {
			description: {
				story:
					"A thread given an `opening` while its `skeleton` still stands in for the transcript. Check that the skeleton holds the surface alone and that the opening is not drawn over it: it comes with the transcript, as `Opening` shows. Check too that the skeleton already lays the 640 column of `PromptOverhangsTheMissionThread`, under a prompt 680 wide overhanging it by 20 on each side, so the thread does not narrow when the transcript lands.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const layout = slotIn(canvasElement, "chat-layout")

		await expect(slotsIn(canvasElement, "thread-skeleton")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "transcript-opening")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "mission-properties")).toHaveLength(0)
		await expect(columnWidthOf(layout, "thread-skeleton-column")).toBe(
			MISSION_COLUMN_WIDTH,
		)
		await expect(overhangOf(layout, "thread-skeleton-column")).toEqual({
			start: PROMPT_OVERHANG,
			end: PROMPT_OVERHANG,
		})
		await expect(
			slotIn(layout, "prompt-input").getBoundingClientRect().width,
		).toBe(MISSION_COLUMN_WIDTH + 2 * PROMPT_OVERHANG)
	},
})
