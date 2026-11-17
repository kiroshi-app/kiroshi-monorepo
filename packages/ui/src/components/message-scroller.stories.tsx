import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { FRAME_POLL, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@workspace/ui/components/message-scroller"

const SHORT_THREAD = [
	"Where did the nightly run stop?",
	"On the migration that renames the run history table.",
]

const LONG_THREAD = [
	...SHORT_THREAD,
	"It failed on the third batch, after 12 000 rows.",
	"The batch is retried from the last checkpoint, so nothing is written twice.",
	"I kept the failing statement in the report attached to this turn.",
	"The column it renames still holds the old index.",
	"Dropping the index first makes the rename instant.",
	"I can prepare that as a second migration.",
	"Do it, and leave the rename untouched.",
	"Prepared. Waiting for you to read it before I run anything.",
]

const SCROLLED_THREAD = Array.from(
	{ length: 40 },
	(_, rank) => `${rank + 1}. ${LONG_THREAD[rank % LONG_THREAD.length]}`,
)

const BUBBLE =
	"rounded-xl border border-border bg-card px-4 py-3 text-foreground text-sm"

const FRAME = "h-72 w-[32rem]"

const NO_SCROLL_ANCHORING = "[overflow-anchor:none]"

const GROWING_RANK = 20

const BLOCK_CHANGE = 120

const GROWING_BLOCK = "h-40 rounded-xl border border-border bg-muted"

type ThreadProps = {
	lines: string[]
	viewportClassName?: string
	growingRank?: number
}

const Thread = ({ lines, viewportClassName, growingRank }: ThreadProps) => (
	<MessageScrollerProvider autoScroll defaultScrollPosition="end">
		<div className={FRAME}>
			<MessageScroller className="min-h-0">
				<MessageScrollerViewport
					aria-label="Transcript"
					className={viewportClassName}
				>
					<MessageScrollerContent
						aria-busy={false}
						aria-relevant="additions text"
						className="justify-end gap-6"
					>
						{lines.map((line, rank) => (
							<MessageScrollerItem
								className="flex flex-col gap-6"
								key={line}
								messageId={line}
								scrollAnchor={rank === lines.length - 1}
							>
								<p className={BUBBLE}>{line}</p>
								{rank === growingRank ? (
									<div className={GROWING_BLOCK} data-slot="growing-block" />
								) : null}
							</MessageScrollerItem>
						))}
					</MessageScrollerContent>
				</MessageScrollerViewport>
				<MessageScrollerButton
					behavior="auto"
					className="rounded-full shadow-xl tabular-nums"
					size="sm"
					variant="secondary"
				>
					<Icons.ArrowDown data-icon="inline-start" />
					Jump to latest
				</MessageScrollerButton>
			</MessageScroller>
		</div>
	</MessageScrollerProvider>
)

const viewportIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "message-scroller-viewport")

const buttonIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "message-scroller-button")

const lastItemIn = (canvasElement: HTMLElement) => {
	const item = slotsIn(canvasElement, "message-scroller-item").at(-1)
	if (!item) throw new Error("the thread rendered no item")
	return item
}

const firstItemInView = (canvasElement: HTMLElement) => {
	const top = viewportIn(canvasElement).getBoundingClientRect().top
	const item = slotsIn(canvasElement, "message-scroller-item").find(
		(candidate) => candidate.getBoundingClientRect().top >= top,
	)
	if (!item) throw new Error("no item is in view")
	return item
}

const nextFrames = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	})

const growingBlockIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "growing-block")

const lineHeightIn = (canvasElement: HTMLElement) => {
	const bubble = canvasElement.querySelector("p")
	if (!bubble) throw new Error("the thread rendered no bubble")
	return Number.parseFloat(getComputedStyle(bubble).lineHeight)
}

const topOf = (element: Element) => element.getBoundingClientRect().top

const releaseFollow = async (viewport: HTMLElement) => {
	await waitFor(async () => {
		await expect(viewport).not.toHaveAttribute("data-autoscrolling")
	}, FRAME_POLL)
	viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))
}

const placeBlockAt = async (
	viewport: HTMLElement,
	block: HTMLElement,
	offset: number,
) => {
	await releaseFollow(viewport)
	viewport.scrollTop += topOf(block) - topOf(viewport) - offset
	await nextFrames()
}

const resize = async (block: HTMLElement, by: number) => {
	block.style.height = `${block.getBoundingClientRect().height + by}px`
	await nextFrames()
}

const itemAfter = (block: HTMLElement) => {
	const next = block.closest("[data-message-id]")?.nextElementSibling
	if (!next) throw new Error("the growing block has no item below it")
	return next
}

const meta = preview.meta({
	title: "Conversation/Message/MessageScroller",
	component: MessageScroller,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The scrolling machinery under the transcript, composed from the registry primitive: a provider owning the scroll position, a viewport that follows the last message while the reader stays at the end and stops following the moment they scroll back, items laid out at their real height so nothing above the reader moves when it scrolls into view, and a button that only comes up when there is something below. It draws no message — what a turn looks like belongs to `Transcript` and to the rows it renders. Reach for these parts when a list must stay pinned to its newest row.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A thread short enough to fit its frame, which is what a conversation looks like for its first few turns. Check that the messages sit at the bottom of the viewport rather than at the top — the content justifies to the end so a thread grows downwards from the first turn — and that the jump button stays out of the way: it is inactive, transparent and takes no pointer, so it never covers the last message or eats a click meant for it. Pick `ScrolledBack` for the state that brings it up. `packages/ui/src/components/transcript.tsx:342` composes these parts for every thread, and `apps/app/src/components/thread-screen.tsx:1434` hands it the rows.",
			},
		},
	},
	render: () => <Thread lines={SHORT_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const button = buttonIn(canvasElement)

		await expect(viewport.scrollHeight).toBe(viewport.clientHeight)
		await expect(button.dataset.active).toBe("false")
		await expect(getComputedStyle(button).pointerEvents).toBe("none")
	},
})

export const AtEnd = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A thread longer than its frame, opened where the transcript opens it: on the newest message. Check that the viewport starts scrolled to the bottom rather than at the oldest turn, that the jump button stays inactive while there is nothing below — offering to jump to a message already on screen is noise — and that the last item is measured on the message it holds, so the thread lands on the real last line. Same composition as `packages/ui/src/components/transcript.tsx:342`.",
			},
		},
	},
	render: () => <Thread lines={LONG_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const button = buttonIn(canvasElement)

		await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
		await waitFor(async () => {
			await expect(
				viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
			).toBeLessThan(2)
		}, FRAME_POLL)
		await expect(button.dataset.active).toBe("false")

		const last = lastItemIn(canvasElement)
		const message = last.firstElementChild as HTMLElement

		await expect(last.getBoundingClientRect().height).toBe(
			message.getBoundingClientRect().height,
		)
	},
})

export const ScrolledBack = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The reader went back up the thread, so the viewport stopped following the newest message. Check that the jump button comes up opaque and clickable at that moment, that pressing it returns to the end, and that it goes back to inactive once there. This is the only state in which the button is reachable at all. The button `packages/ui/src/components/transcript.tsx:390` mounts, reached the only way a reader reaches it.",
			},
		},
	},
	render: () => <Thread lines={LONG_THREAD} />,
	play: async ({ canvasElement, userEvent }) => {
		const viewport = viewportIn(canvasElement)
		const button = buttonIn(canvasElement)

		await waitFor(async () => {
			await expect(viewport).not.toHaveAttribute("data-autoscrolling")
		}, FRAME_POLL)

		viewport.focus()
		await userEvent.keyboard("{Home}")
		viewport.scrollTop = 0

		await waitFor(async () => {
			await expect(button.dataset.active).toBe("true")
		}, FRAME_POLL)
		await expect(getComputedStyle(button).pointerEvents).not.toBe("none")

		await userEvent.click(button)

		await waitFor(async () => {
			await expect(button.dataset.active).toBe("false")
		}, FRAME_POLL)
	},
})

export const HoldsTheReaderWhileScrollingBack = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The reader climbs a long thread half a screen at a time, with scroll anchoring turned off on the viewport the way WebKit leaves it for rows that settle their height. Check that each step moves the message under the reader by exactly the distance scrolled: a row above it that settled to a different height on the way would push it further, which is the jump content-visibility rows caused under WebKit.",
			},
		},
	},
	render: () => (
		<Thread lines={SCROLLED_THREAD} viewportClassName={NO_SCROLL_ANCHORING} />
	),
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)

		await waitFor(async () => {
			await expect(
				viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
			).toBeLessThan(2)
		}, FRAME_POLL)

		while (viewport.scrollTop > 0) {
			const reader = firstItemInView(canvasElement)
			const readerTop = reader.getBoundingClientRect().top
			const scrollTop = viewport.scrollTop

			viewport.scrollTop = scrollTop - viewport.clientHeight / 2
			await nextFrames()

			await expect(reader.getBoundingClientRect().top - readerTop).toBeCloseTo(
				scrollTop - viewport.scrollTop,
				0,
			)
		}
	},
})

export const HoldsTheReaderWhenABlockCutAtTheTopGrows = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A block of an earlier turn is cut by the top edge of the viewport and gets taller after its first paint, the way a live HTML view, a late image or a reply settling its height does. Check that the message under it stays where the reader sees it: the block grows into the part of the thread already scrolled past, not over what is being read.",
			},
		},
	},
	render: () => <Thread growingRank={GROWING_RANK} lines={SCROLLED_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const block = growingBlockIn(canvasElement)

		await placeBlockAt(viewport, block, -block.offsetHeight / 2)
		const reader = itemAfter(block)
		const readerTop = topOf(reader)

		await resize(block, BLOCK_CHANGE)

		await expect(Math.abs(topOf(reader) - readerTop)).toBeLessThanOrEqual(
			lineHeightIn(canvasElement),
		)
	},
})

export const HoldsTheReaderWhenABlockCutAtTheTopShrinks = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The same block cut by the top edge gets shorter instead. Check that the message under it stays where the reader sees it rather than climbing by the height the block lost.",
			},
		},
	},
	render: () => <Thread growingRank={GROWING_RANK} lines={SCROLLED_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const block = growingBlockIn(canvasElement)

		await placeBlockAt(viewport, block, -block.offsetHeight / 2)
		const reader = itemAfter(block)
		const readerTop = topOf(reader)

		await resize(block, -block.offsetHeight / 4)

		await expect(Math.abs(topOf(reader) - readerTop)).toBeLessThanOrEqual(
			lineHeightIn(canvasElement),
		)
	},
})

export const HoldsTheReaderWhenABlockAboveGrows = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A block of an earlier turn, already scrolled past entirely, gets taller. Check that nothing on screen moves.",
			},
		},
	},
	render: () => <Thread growingRank={GROWING_RANK} lines={SCROLLED_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const block = growingBlockIn(canvasElement)

		await placeBlockAt(viewport, block, -block.offsetHeight - BLOCK_CHANGE)
		const reader = firstItemInView(canvasElement)
		const readerTop = topOf(reader)

		await resize(block, BLOCK_CHANGE)

		await expect(Math.abs(topOf(reader) - readerTop)).toBeLessThanOrEqual(
			lineHeightIn(canvasElement),
		)
	},
})

export const HoldsTheContentAboveWhenABlockInViewGrows = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A block fully on screen gets taller while the reader is scrolled back. Check that what sits above it stays put and the block grows downwards, the way a reader expects a card to open.",
			},
		},
	},
	render: () => <Thread growingRank={GROWING_RANK} lines={SCROLLED_THREAD} />,
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const block = growingBlockIn(canvasElement)

		await placeBlockAt(
			viewport,
			block,
			(viewport.clientHeight - block.offsetHeight) / 2,
		)
		const above = block.previousElementSibling
		if (!above) throw new Error("the growing block has nothing above it")
		const aboveTop = topOf(above)

		await resize(block, BLOCK_CHANGE)

		await expect(Math.abs(topOf(above) - aboveTop)).toBeLessThanOrEqual(
			lineHeightIn(canvasElement),
		)
	},
})

export const KeepsFollowingWhenABlockGrows = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The reader follows the newest message and a block of the last turn gets taller than the viewport. Check that the thread keeps following: the end of the block stays at the bottom of the viewport.",
			},
		},
	},
	render: () => (
		<Thread growingRank={SCROLLED_THREAD.length - 1} lines={SCROLLED_THREAD} />
	),
	play: async ({ canvasElement }) => {
		const viewport = viewportIn(canvasElement)
		const block = growingBlockIn(canvasElement)
		const line = lineHeightIn(canvasElement)

		await waitFor(async () => {
			await expect(viewport).not.toHaveAttribute("data-autoscrolling")
		}, FRAME_POLL)

		await resize(block, viewport.clientHeight)

		await waitFor(async () => {
			await expect(
				viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
			).toBeLessThanOrEqual(line)
		}, FRAME_POLL)
	},
})
