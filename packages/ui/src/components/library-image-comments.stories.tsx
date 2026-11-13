import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	hueScopeOf,
	slotIn,
	slotsIn,
	withStoryProps,
} from "@workspace/storybook/story-utils"
import { LIBRARY_ITEMS } from "@workspace/ui/components/library.fixtures"
import { LibraryCommentComposer } from "@workspace/ui/components/library-comment-composer"
import { LibraryCommentThread } from "@workspace/ui/components/library-comment-thread"
import {
	AGENT_REPLY,
	COMMENT_COUNTS,
	COMMENT_PARTICIPANTS,
	FIRST_COMMENT,
	JUNIPER,
	LENA,
	OPEN_THREADS,
	STEVE,
} from "@workspace/ui/components/library-comments.fixtures"
import { LibraryCommentsList } from "@workspace/ui/components/library-comments-list"
import {
	type LibraryImageAnchor,
	LibraryImageComments,
	type LibraryImagePoint,
	type LibraryImageThread,
	type LibraryImageZone,
} from "@workspace/ui/components/library-image-comments"
import {
	LibraryLightbox,
	type LibraryLightboxImage,
} from "@workspace/ui/components/library-lightbox"
import { LibraryPanel } from "@workspace/ui/components/library-panel"

const HARBOUR_VIEW: LibraryLightboxImage = {
	id: "harbour-view",
	name: "harbour-view.jpg",
	detail: "JPG · 2400 × 1600 · 1.8 MB",
	src: `data:image/svg+xml,${encodeURIComponent(
		"<svg xmlns='http://www.w3.org/2000/svg' width='2400' height='1600' viewBox='0 0 240 160'><rect width='240' height='160' fill='#6f8aa0'/><circle cx='196' cy='34' r='14' fill='#f6c177'/><rect y='84' width='240' height='76' fill='#3d6079'/><path d='M112 62 V84 H136Z' fill='#f4f4f5'/><path d='M104 86 H148 L142 96 H110Z' fill='#27272a'/><rect y='128' width='240' height='32' fill='#c9895b'/><rect x='150' y='112' width='40' height='16' fill='#8f5a3c'/></svg>",
	)}`,
}

const BOAT_ZONE: LibraryImageZone = {
	x: 0.4,
	y: 0.35,
	width: 0.25,
	height: 0.3,
}

const TERRACE_POINT: LibraryImagePoint = { x: 0.7, y: 0.75 }

const SUN_POINT: LibraryImagePoint = { x: 0.82, y: 0.2 }

const DRAFT_POINT: LibraryImagePoint = { x: 0.3, y: 0.6 }

const DRAFT_ZONE: LibraryImageZone = {
	x: 0.1,
	y: 0.5,
	width: 0.2,
	height: 0.25,
}

const BOAT_THREAD = "thread-boat"

const IMAGE_THREADS: LibraryImageThread[] = [
	{ id: BOAT_THREAD, author: STEVE, anchor: BOAT_ZONE },
	{ id: "thread-terrace", author: LENA, anchor: TERRACE_POINT },
	{ id: "thread-sun", author: JUNIPER, anchor: SUN_POINT },
]

const POINT_ANCHOR_LINE = "On a point of the image"

const ZONE_ANCHOR_LINE = "On a zone of the image"

const BoatThreadCard = () => {
	const [reply, setReply] = useState("")

	return (
		<LibraryCommentThread
			anchor={ZONE_ANCHOR_LINE}
			comments={[FIRST_COMMENT, AGENT_REPLY]}
			onClose={fn()}
			onMore={fn()}
			onReopen={fn()}
			onReply={fn()}
			onReplyChange={setReply}
			onResolve={fn()}
			participants={COMMENT_PARTICIPANTS}
			reply={reply}
		/>
	)
}

type DraftComposerProps = { anchor: string }

const DraftComposer = ({ anchor }: DraftComposerProps) => {
	const [value, setValue] = useState("")

	return (
		<LibraryCommentComposer
			anchor={anchor}
			onSubmit={fn()}
			onValueChange={setValue}
			participants={COMMENT_PARTICIPANTS}
			value={value}
		/>
	)
}

type ViewerWithCommentsProps = {
	threads: LibraryImageThread[]
	isCommentMode: boolean
	openThreadId?: string
	draftAnchor?: LibraryImageAnchor
	onCommentModeChange: (isCommentMode: boolean) => void
	onOpenThread: (threadId: string) => void
	onStartComment: (anchor: LibraryImageAnchor) => void
	onClose: () => void
}

const ViewerWithComments = ({
	threads,
	isCommentMode,
	openThreadId,
	draftAnchor,
	onCommentModeChange,
	onOpenThread,
	onStartComment,
	onClose,
}: ViewerWithCommentsProps) => (
	<div className="h-[900px] w-[1440px] bg-background" {...hueScopeOf("blue")}>
		<LibraryPanel
			filter="all"
			items={LIBRARY_ITEMS}
			onFilterChange={fn()}
			onOpenItem={fn()}
			overlay={
				<LibraryLightbox
					comments={{
						counts: COMMENT_COUNTS,
						isCommentMode,
						onCommentModeChange,
						list: (
							<LibraryCommentsList
								counts={COMMENT_COUNTS}
								onOpenThread={fn()}
								onTabChange={fn()}
								tab="open"
								threads={OPEN_THREADS}
							/>
						),
					}}
					count={8}
					image={HARBOUR_VIEW}
					imageComments={{
						threads,
						openThread:
							openThreadId === undefined
								? undefined
								: { id: openThreadId, card: <BoatThreadCard /> },
						draft:
							draftAnchor === undefined
								? undefined
								: {
										author: STEVE,
										anchor: draftAnchor,
										composer: (
											<DraftComposer
												anchor={
													"width" in draftAnchor
														? ZONE_ANCHOR_LINE
														: POINT_ANCHOR_LINE
												}
											/>
										),
									},
						onOpenThread,
						onStartComment,
					}}
					onClose={onClose}
					onCopy={fn()}
					onDelete={fn()}
					onDownload={fn()}
					onNext={fn()}
					onPrevious={fn()}
					onRename={fn()}
					position={2}
				/>
			}
			state="ready"
		/>
	</div>
)

const VIEWER_ARGS: ViewerWithCommentsProps = {
	threads: IMAGE_THREADS,
	isCommentMode: false,
	onCommentModeChange: fn(),
	onOpenThread: fn(),
	onStartComment: fn(),
	onClose: fn(),
}

const PIN_SIZE = 32

const BESIDE_GAP = 8

const viewer = async () => {
	const popup = await screen.findByRole("dialog")
	await waitFor(() => expect(popup).toBeVisible())
	await waitFor(() => expect(popup.contains(document.activeElement)).toBe(true))
	const image = within(popup).getByRole<HTMLImageElement>("img", {
		name: HARBOUR_VIEW.name,
	})
	await waitFor(() => expect(image.naturalWidth).toBeGreaterThan(0))
	await expect(popup.closest(".dark")).toBe(popup)
	return { popup, image }
}

const pinSpotOf = (anchor: LibraryImageAnchor): LibraryImagePoint =>
	"width" in anchor ? { x: anchor.x + anchor.width, y: anchor.y } : anchor

const expectPinOn = async (
	pin: HTMLElement,
	image: HTMLElement,
	anchor: LibraryImageAnchor,
) => {
	const shown = image.getBoundingClientRect()
	const box = pin.getBoundingClientRect()
	const spot = pinSpotOf(anchor)
	await expect(box.left).toBeCloseTo(shown.left + spot.x * shown.width, 0)
	await expect(box.bottom).toBeCloseTo(shown.top + spot.y * shown.height, 0)
	await expect(box.width).toBe(PIN_SIZE)
	await expect(box.height).toBe(PIN_SIZE)
}

const expectFrameOn = async (
	frame: HTMLElement,
	image: HTMLElement,
	zone: LibraryImageZone,
) => {
	const shown = image.getBoundingClientRect()
	const box = frame.getBoundingClientRect()
	await expect(box.left).toBeCloseTo(shown.left + zone.x * shown.width, 0)
	await expect(box.top).toBeCloseTo(shown.top + zone.y * shown.height, 0)
	await expect(box.width).toBeCloseTo(zone.width * shown.width, 0)
	await expect(box.height).toBeCloseTo(zone.height * shown.height, 0)
}

const expectBesidePin = async (card: HTMLElement, pin: HTMLElement) => {
	const pinBox = pin.getBoundingClientRect()
	const cardBox = card.getBoundingClientRect()
	await expect(cardBox.left).toBeCloseTo(pinBox.right + BESIDE_GAP, 0)
	await expect(cardBox.top).toBeCloseTo(pinBox.top, 0)
}

const pinsIn = (popup: HTMLElement) => slotsIn(popup, "library-comment-pin")

const expectThreadPinsOn = async (popup: HTMLElement, image: HTMLElement) => {
	const pins = pinsIn(popup)
	await expect(pins).toHaveLength(IMAGE_THREADS.length)
	for (const [at, thread] of IMAGE_THREADS.entries())
		await expectPinOn(pins[at], image, thread.anchor)
}

const spaceColourOf = (pin: HTMLElement) =>
	getComputedStyle(pin).backgroundColor

const meta = preview.meta({
	title: "Overlays/LibraryImageComments",
	component: withStoryProps<ViewerWithCommentsProps>(LibraryImageComments),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The comment threads of an image, drawn over it in the Library viewer: one pin per thread, its sharp corner on the point it comments or on the top right corner of its zone. Every anchor is a fraction of the image, so pins and zone frames follow the image as it zooms and scrolls, pins at a constant size. It draws from props only: `threads`, the `openThread` with its card, the `draft` with its composer, and it reports `onOpenThread` and `onStartComment`. Comment mode comes from the `comments` prop of `LibraryLightbox`: while it is on, a click on the image starts a comment on a point, a drag on a zone, and Escape asks to leave the mode instead of closing the viewer. Hand it to `LibraryLightbox` as `imageComments`.",
			},
		},
	},
	globals: { theme: "dark" },
	args: VIEWER_ARGS,
	render: (args) => <ViewerWithComments {...VIEWER_ARGS} {...args} />,
})

export const AtRest = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An image with three open threads, as artboard Img 1 draws it. Check each thread shows its pin alone, the zone thread included, with the pin's sharp corner on its anchor, and that a pin reports its thread by pointer and by keyboard.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { popup, image } = await viewer()
		await expectThreadPinsOn(popup, image)
		await expect(slotsIn(popup, "library-image-zone")).toHaveLength(0)
		await expect(
			within(popup).queryByText("Click for a point, drag for a zone"),
		).toBe(null)

		const [boat, terrace] = pinsIn(popup)
		await expect(boat).toHaveAttribute("data-state", "rest")
		await userEvent.click(boat)
		await expect(args.onOpenThread).toHaveBeenLastCalledWith(BOAT_THREAD)

		terrace.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpenThread).toHaveBeenLastCalledWith("thread-terrace")
		await expect(args.onOpenThread).toHaveBeenCalledTimes(2)
	},
})

export const CommentMode = meta.story({
	args: { isCommentMode: true },
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on, as artboard Img 2 draws it: the hint above the zoom pill and the pin cursor under the pointer. Check a click reports a point and a drag a zone, both as fractions of the image, that the zone follows the pointer while it is drawn and stops at the edge of the image, and that Escape asks to leave the mode without closing the viewer.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { popup, image } = await viewer()
		await expect(
			within(popup).getByText("Click for a point, drag for a zone"),
		).toBeVisible()
		await expectThreadPinsOn(popup, image)

		const surface = slotIn(popup, "library-image-comment-surface")
		const shown = image.getBoundingClientRect()
		const at = (x: number, y: number) => ({
			target: surface,
			coords: {
				clientX: shown.left + x * shown.width,
				clientY: shown.top + y * shown.height,
			},
		})

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", ...at(0.25, 0.5) },
			{ keys: "[/MouseLeft]", ...at(0.25, 0.5) },
		])
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			x: expect.closeTo(0.25, 5),
			y: expect.closeTo(0.5, 5),
		})

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", ...at(0.6, 0.4) },
			at(0.4, 0.2),
		])
		const drawn = slotIn(surface, "library-image-zone")
		await expect(drawn).toHaveAttribute("data-state", "written")
		await expectFrameOn(drawn, image, {
			x: 0.4,
			y: 0.2,
			width: 0.2,
			height: 0.2,
		})
		const cursor = slotIn(surface, "library-image-comment-cursor")
		await expect(getComputedStyle(cursor).backgroundColor).toBe(
			getComputedStyle(drawn).borderTopColor,
		)
		await userEvent.pointer({ keys: "[/MouseLeft]", ...at(0.4, 0.2) })
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			x: expect.closeTo(0.4, 5),
			y: expect.closeTo(0.2, 5),
			width: expect.closeTo(0.2, 5),
			height: expect.closeTo(0.2, 5),
		})
		await expect(slotsIn(surface, "library-image-zone")).toHaveLength(0)

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", ...at(0.9, 0.8) },
			at(1.2, 1.3),
			{ keys: "[/MouseLeft]", ...at(1.2, 1.3) },
		])
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			x: expect.closeTo(0.9, 5),
			y: expect.closeTo(0.8, 5),
			width: expect.closeTo(0.1, 5),
			height: expect.closeTo(0.2, 5),
		})
		await expect(args.onStartComment).toHaveBeenCalledTimes(3)

		await userEvent.keyboard("{Escape}")
		await expect(args.onCommentModeChange).toHaveBeenCalledOnce()
		await expect(args.onCommentModeChange).toHaveBeenCalledWith(false)
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()

		await userEvent.pointer(at(0.5, 0.45))
		const resting = slotIn(
			surface,
			"library-image-comment-cursor",
		).getBoundingClientRect()
		await expect(resting.left).toBeCloseTo(shown.left + 0.5 * shown.width, 0)
		await expect(resting.bottom).toBeCloseTo(shown.top + 0.45 * shown.height, 0)
		await expect(resting.width).toBe(20)
	},
})

export const PointDraft = meta.story({
	args: { isCommentMode: true, draftAnchor: DRAFT_POINT },
	parameters: {
		docs: {
			description: {
				story:
					"A comment being written on a point, as artboard Img 3 draws it. Check the draft pin is selected with its sharp corner on the point, that the composer opens 8 px to its right with their top edges aligned, and that no zone frame is drawn.",
			},
		},
	},
	play: async () => {
		const { popup, image } = await viewer()
		const draft = pinsIn(popup).at(-1)
		if (!draft) throw new Error("No draft pin drawn")
		await expect(draft).toHaveAttribute("data-state", "selected")
		await expectPinOn(draft, image, DRAFT_POINT)
		await expectBesidePin(slotIn(popup, "library-comment-composer"), draft)
		await expect(slotsIn(popup, "library-image-zone")).toHaveLength(0)
		await expect(pinsIn(popup)).toHaveLength(IMAGE_THREADS.length + 1)
	},
})

export const ZoneDraft = meta.story({
	args: { isCommentMode: true, draftAnchor: DRAFT_ZONE },
	parameters: {
		docs: {
			description: {
				story:
					"A comment being written on a zone, as artboard Img 4 draws it. Check the zone wears a 2 px border in the Space colour over a light fill, that the draft pin sits with its sharp corner on the zone's top right corner, and that the composer opens beside the pin.",
			},
		},
	},
	play: async () => {
		const { popup, image } = await viewer()
		const draft = pinsIn(popup).at(-1)
		if (!draft) throw new Error("No draft pin drawn")
		await expectPinOn(draft, image, DRAFT_ZONE)
		await expectBesidePin(slotIn(popup, "library-comment-composer"), draft)

		const frame = slotIn(popup, "library-image-zone")
		await expect(frame).toHaveAttribute("data-state", "written")
		await expectFrameOn(frame, image, DRAFT_ZONE)
		const drawn = getComputedStyle(frame)
		await expect(drawn.borderTopWidth).toBe("2px")
		await expect(drawn.borderTopColor).toBe(spaceColourOf(draft))
	},
})

export const ZoneThreadOpen = meta.story({
	args: { openThreadId: BOAT_THREAD },
	parameters: {
		docs: {
			description: {
				story:
					"The thread of a zone open, as artboard Img 5 draws it. Check its pin is selected, that the zone frame appears with an inset ring in the Space colour, that the thread card opens 8 px right of the pin with their top edges aligned, and that the frame grows with the image when it is zoomed while the pin keeps its size.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { popup, image } = await viewer()
		const [boat, terrace] = pinsIn(popup)
		await expect(boat).toHaveAttribute("data-state", "selected")
		await expect(boat).toHaveAttribute("aria-expanded", "true")
		await expect(terrace).toHaveAttribute("data-state", "rest")
		await expectBesidePin(slotIn(popup, "library-comment-thread"), boat)

		const frame = slotIn(popup, "library-image-zone")
		await expect(frame).toHaveAttribute("data-state", "anchored")
		await expect(getComputedStyle(frame).borderTopWidth).toBe("0px")
		await expectFrameOn(frame, image, BOAT_ZONE)
		const fitted = frame.getBoundingClientRect().width

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await expect(frame.getBoundingClientRect().width).toBeGreaterThan(fitted)
		await expectFrameOn(frame, image, BOAT_ZONE)
		await expectPinOn(boat, image, BOAT_ZONE)

		await userEvent.click(
			within(popup).getByRole("button", { name: /%, fit to the window$/ }),
		)
		await expectFrameOn(frame, image, BOAT_ZONE)
	},
})

export const ZoneThreadOpenLight = meta.story({
	args: { openThreadId: BOAT_THREAD },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"The same open thread while the app wears its light theme. Check the viewer stays dark: the thread card keeps its dark ground and the pins at rest stay light over the image.",
			},
		},
	},
	play: async () => {
		const { popup } = await viewer()
		const [, terrace] = pinsIn(popup)
		await expect(spaceColourOf(terrace)).toBe("rgb(255, 255, 255)")
		await expect(
			getComputedStyle(slotIn(popup, "library-comment-thread")).backgroundColor,
		).toBe("rgb(31, 31, 31)")
	},
})

export const Zoomed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The image of artboard Img 1 zoomed past its fit and scrolled. Check every pin stays on the same spot of the image, at the same 32 px, as the image grows and as the stage scrolls.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { popup, image } = await viewer()
		const fitted = image.getBoundingClientRect().width

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await expect(image.getBoundingClientRect().width).toBeGreaterThan(fitted)
		await expectThreadPinsOn(popup, image)

		const scroller = slotIn(popup, "library-lightbox-zoom")
		const before = image.getBoundingClientRect()
		scroller.scrollTo({ left: 240, top: 160 })
		await waitFor(() =>
			expect(image.getBoundingClientRect().left).toBeLessThan(before.left),
		)
		await expectThreadPinsOn(popup, image)
	},
})
