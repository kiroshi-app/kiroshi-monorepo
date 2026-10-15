import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { probedStyleOf, slotIn } from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import type { ConnectionStatusState } from "@workspace/ui/components/connection-status"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { Notice } from "@workspace/ui/components/notice"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	ThreadLayout,
	type ThreadLayoutProps,
} from "@workspace/ui/components/thread-layout"
import {
	ToolApproval,
	ToolApprovalCode,
} from "@workspace/ui/components/tool-approval"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"

const ANSWER =
	"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell."

const BOT: RosterBot = {
	id: "bot-skippy",
	name: "Skippy",
	blot: "blue",
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
	args: { older: { has: true, onLoad: fn() }, children: SCROLLING_TRANSCRIPT },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the host pages the transcript by cursor. The layout owns nothing here — `older` is handed straight to MessageScroller, so the control sits above the first row inside the scrolling transcript and scrolls with it, never between the header and the transcript. Check that the header and the composer are untouched by it, and pick `Default` for a host that loads the whole conversation at once. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			await canvas.findByRole("button", { name: "Load older messages" }),
		)
		await expect(args.older?.onLoad).toHaveBeenCalledTimes(1)
	},
})

export const LoadingOlderMessages = meta.story({
	args: {
		older: { has: true, isLoading: true, onLoad: fn() },
		children: SCROLLING_TRANSCRIPT,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a page request is in flight through the layout. Check that the loading half of the contract survives the hop: the control announces itself busy, refuses a second request, and keeps its name and its focus — a keyboard reader who fired it must not be dropped back to the top of the transcript. Pick `OlderMessages` for the idle control. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const loadOlder = await canvas.findByRole("button", {
			name: "Load older messages",
		})

		await expect(loadOlder).toHaveAttribute("aria-busy", "true")
		await expect(loadOlder).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(loadOlder)

		await expect(args.older?.onLoad).not.toHaveBeenCalled()
		await expect(loadOlder).toHaveFocus()
	},
})

export const StartOfOlderMessages = meta.story({
	args: { older: { has: false, onLoad: fn() }, children: CONVERSATION },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the last page has landed. Check that the control is replaced by the start-of-history copy rather than disappearing — the reader needs to know the history above them is finished, not still loading. Pick `OlderMessages` while pages remain. The app assembles it at `apps/app/src/components/thread-screen.tsx:1368`.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Beginning of the conversation"),
		).toBeVisible()
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
