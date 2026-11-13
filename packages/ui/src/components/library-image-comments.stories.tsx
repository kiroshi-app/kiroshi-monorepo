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
import type { LibraryCommentResolution } from "@workspace/ui/components/library-comment-thread"
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

type ViewerWithCommentsProps = {
	threads: LibraryImageThread[]
	isCommentMode: boolean
	openThreadId?: string
	resolution?: LibraryCommentResolution
	draftAnchor?: LibraryImageAnchor
	onCommentModeChange: (isCommentMode: boolean) => void
	onOpenThread: (threadId: string) => void
	onStartComment: (anchor: LibraryImageAnchor) => void
	onCloseThread: () => void
	onCloseDraft: () => void
	onClose: () => void
}

const ViewerWithComments = ({
	threads,
	isCommentMode,
	openThreadId,
	resolution,
	draftAnchor,
	onCommentModeChange,
	onOpenThread,
	onStartComment,
	onCloseThread,
	onCloseDraft,
	onClose,
}: ViewerWithCommentsProps) => {
	const [value, setValue] = useState("")
	const [reply, setReply] = useState("")

	return (
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
									: {
											id: openThreadId,
											comments: [FIRST_COMMENT, AGENT_REPLY],
											participants: COMMENT_PARTICIPANTS,
											resolution,
											reply,
											onReplyChange: setReply,
											onReply: fn(),
											onResolve: fn(),
											onReopen: fn(),
											onMore: fn(),
											onClose: onCloseThread,
										},
							draft:
								draftAnchor === undefined
									? undefined
									: {
											author: STEVE,
											anchor: draftAnchor,
											participants: COMMENT_PARTICIPANTS,
											value,
											onValueChange: setValue,
											onSubmit: fn(),
											onClose: onCloseDraft,
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
}

const LiveViewer = ({
	isCommentMode: isInitiallyOn,
	openThreadId: initialThreadId,
	draftAnchor,
	onCommentModeChange,
	onOpenThread,
	onCloseThread,
	onCloseDraft,
	...props
}: ViewerWithCommentsProps) => {
	const [isCommentMode, setCommentMode] = useState(isInitiallyOn)
	const [openThreadId, setOpenThreadId] = useState(initialThreadId)
	const [isDrafting, setDrafting] = useState(true)

	return (
		<ViewerWithComments
			{...props}
			draftAnchor={isDrafting ? draftAnchor : undefined}
			isCommentMode={isCommentMode}
			onCloseDraft={() => {
				setDrafting(false)
				onCloseDraft()
			}}
			onCloseThread={() => {
				setOpenThreadId(undefined)
				onCloseThread()
			}}
			onCommentModeChange={(next) => {
				setCommentMode(next)
				onCommentModeChange(next)
			}}
			onOpenThread={(id) => {
				setOpenThreadId(id)
				onOpenThread(id)
			}}
			openThreadId={openThreadId}
		/>
	)
}

const VIEWER_ARGS: ViewerWithCommentsProps = {
	threads: IMAGE_THREADS,
	isCommentMode: false,
	onCommentModeChange: fn(),
	onOpenThread: fn(),
	onStartComment: fn(),
	onCloseThread: fn(),
	onCloseDraft: fn(),
	onClose: fn(),
}

const PIN_SIZE = 32

const BESIDE_GAP = 8

const GAP_BEFORE_PIN = 12

const CORNER_POINT: LibraryImagePoint = { x: 0.97, y: 0.96 }

const TOP_EDGE_POINT: LibraryImagePoint = { x: 0.98, y: 0.02 }

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

const expectInsideStage = async (card: HTMLElement, popup: HTMLElement) => {
	const stage = slotIn(popup, "library-lightbox-zoom").getBoundingClientRect()
	const box = card.getBoundingClientRect()
	await expect(box.left).toBeGreaterThanOrEqual(stage.left)
	await expect(box.top).toBeGreaterThanOrEqual(stage.top)
	await expect(box.right).toBeLessThanOrEqual(stage.right)
	await expect(box.bottom).toBeLessThanOrEqual(stage.bottom)
	return { stage, box }
}

const expectBeforePin = async (card: HTMLElement, pin: HTMLElement) =>
	expect(card.getBoundingClientRect().right).toBeCloseTo(
		pin.getBoundingClientRect().left - GAP_BEFORE_PIN,
		0,
	)

const expectMentionMenuClosedByEscape = async (
	popup: HTMLElement,
	field: HTMLElement,
	type: (keys: string) => Promise<void>,
) => {
	field.focus()
	await type("@")
	await within(popup).findByRole("listbox", { name: "Mention" })
	await type("{Escape}")
	await waitFor(() => expect(within(popup).queryByRole("listbox")).toBeNull())
	await expect(field).toHaveValue("@")
	await expect(field).toHaveFocus()
	await expect(popup).toBeVisible()
}

const pinsIn = (popup: HTMLElement) => slotsIn(popup, "library-comment-pin")

const expectThreadPinsOn = async (popup: HTMLElement, image: HTMLElement) => {
	const pins = pinsIn(popup)
	await expect(pins).toHaveLength(IMAGE_THREADS.length)
	for (const [at, thread] of IMAGE_THREADS.entries())
		await expectPinOn(pins[at], image, thread.anchor)
}

const groundOf = (pin: HTMLElement) => getComputedStyle(pin).backgroundColor

const STAGE_CURSOR_RING = "rgb(10, 10, 10) 0px 0px 0px 2px"

const STAGE_CURSOR_SHADOW = "rgba(0, 0, 0, 0.4) 0px 2px 6px 0px"

const expectStageCursorLook = async (cursor: HTMLElement) => {
	const look = getComputedStyle(cursor)
	await expect(look.borderBottomLeftRadius).toBe("2px")
	await expect(look.boxShadow).toContain(STAGE_CURSOR_RING)
	await expect(look.boxShadow).toContain(STAGE_CURSOR_SHADOW)
}

const meta = preview.meta({
	title: "Overlays/LibraryImageComments",
	component: withStoryProps<ViewerWithCommentsProps>(LibraryImageComments),
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The comment threads of an image, drawn over it in the Library viewer: one pin per thread, its sharp corner on the point it comments or on the top right corner of its zone. Every anchor is a fraction of the image, so pins and zone frames follow the image as it zooms and scrolls, pins at a constant size. It draws from props only: `threads`, each at rest, selected once open, or resolved when `isResolved`, the `openThread` whose card it draws, the `draft` whose composer it draws, both naming a point or a zone of the image from the catalogue, and it reports `onOpenThread` and `onStartComment`. A card opens 8 px right of its pin, 12 px left of it when the right side would cross the stage, and never leaves the stage while its pin stays on its anchor. Comment mode comes from the `comments` prop of `LibraryLightbox`: while it is on, a click on the image starts a comment on a point, a drag on a zone. One Escape closes the innermost open thing only: the mention menu, then the composer through `draft.onClose`, then the thread card through `openThread.onClose`, then comment mode, then the viewer. Hand it to `LibraryLightbox` as `imageComments`.",
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
					"Comment mode on, as artboard Img 2 draws it: the hint above the zoom pill and the pin cursor under the pointer, with its 2 px ring and its shadow read from the stage cursor tokens. Check a click reports a point and a drag a zone, both as fractions of the image, that the zone follows the pointer while it is drawn, at radius 6, and stops at the edge of the image, that a drag along one axis only draws no zone and reports the point where the press started, and that Escape asks to leave the mode without closing the viewer.",
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
		await expect(getComputedStyle(drawn).borderTopLeftRadius).toBe("6px")
		const cursor = slotIn(surface, "library-image-comment-cursor")
		await expect(getComputedStyle(cursor).backgroundColor).toBe(
			getComputedStyle(drawn).borderTopColor,
		)
		await expectStageCursorLook(cursor)
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

		await userEvent.pointer([
			{ keys: "[MouseLeft>]", ...at(0.3, 0.6) },
			at(0.5, 0.6),
		])
		await expect(slotsIn(surface, "library-image-zone")).toHaveLength(0)
		await userEvent.pointer({ keys: "[/MouseLeft]", ...at(0.5, 0.6) })
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			x: expect.closeTo(0.3, 5),
			y: expect.closeTo(0.6, 5),
		})
		await expect(args.onStartComment).toHaveBeenCalledTimes(4)

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

export const CommentModeLight = meta.story({
	args: { isCommentMode: true },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on while the app wears its light theme, the pointer resting over the image. Check the viewer is the only dark surface of a light app, and that the pin cursor keeps the 2 px ring and the shadow of its dark twin, since the stage cursor tokens do not follow the theme.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { popup, image } = await viewer()
		await expect(popup.parentElement?.closest(".dark")).toBe(null)

		const surface = slotIn(popup, "library-image-comment-surface")
		const shown = image.getBoundingClientRect()
		await userEvent.pointer({
			target: surface,
			coords: {
				clientX: shown.left + 0.5 * shown.width,
				clientY: shown.top + 0.45 * shown.height,
			},
		})
		const cursor = slotIn(surface, "library-image-comment-cursor")
		await expect(cursor.getBoundingClientRect().width).toBe(20)
		await expectStageCursorLook(cursor)
	},
})

export const PointDraft = meta.story({
	args: { isCommentMode: true, draftAnchor: DRAFT_POINT },
	parameters: {
		docs: {
			description: {
				story:
					"A comment being written on a point, as artboard Img 3 draws it. Check the draft pin is selected with its sharp corner on the point, that the composer opens 8 px to its right with their top edges aligned, its line reading On a point of the image, and that no zone frame is drawn.",
			},
		},
	},
	play: async () => {
		const { popup, image } = await viewer()
		const draft = pinsIn(popup).at(-1)
		if (!draft) throw new Error("No draft pin drawn")
		await expect(draft).toHaveAttribute("data-state", "selected")
		await expectPinOn(draft, image, DRAFT_POINT)
		const composer = slotIn(popup, "library-comment-composer")
		await expectBesidePin(composer, draft)
		await expect(within(composer).getByText(POINT_ANCHOR_LINE)).toBeVisible()
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
					"A comment being written on a zone, as artboard Img 4 draws it. Check the zone wears a 2 px border in the Space colour at radius 6 over a light fill, that the draft pin sits with its sharp corner on the zone's top right corner, and that the composer opens beside the pin, its line reading On a zone of the image.",
			},
		},
	},
	play: async () => {
		const { popup, image } = await viewer()
		const draft = pinsIn(popup).at(-1)
		if (!draft) throw new Error("No draft pin drawn")
		await expectPinOn(draft, image, DRAFT_ZONE)
		const composer = slotIn(popup, "library-comment-composer")
		await expectBesidePin(composer, draft)
		await expect(within(composer).getByText(ZONE_ANCHOR_LINE)).toBeVisible()

		const frame = slotIn(popup, "library-image-zone")
		await expect(frame).toHaveAttribute("data-state", "written")
		await expectFrameOn(frame, image, DRAFT_ZONE)
		const drawn = getComputedStyle(frame)
		await expect(drawn.borderTopWidth).toBe("2px")
		await expect(drawn.borderTopLeftRadius).toBe("6px")
		await expect(drawn.borderTopColor).toBe(groundOf(draft))
	},
})

export const ZoneThreadOpen = meta.story({
	args: { openThreadId: BOAT_THREAD },
	parameters: {
		docs: {
			description: {
				story:
					"The thread of a zone open, as artboard Img 5 draws it. Check its pin is selected, that the zone frame appears at radius 4 with an inset ring in the Space colour, that the thread card opens 8 px right of the pin with their top edges aligned, named On a zone of the image, and that the frame grows with the image when it is zoomed while the pin keeps its size.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { popup, image } = await viewer()
		const [boat, terrace] = pinsIn(popup)
		await expect(boat).toHaveAttribute("data-state", "selected")
		await expect(boat).toHaveAttribute("aria-expanded", "true")
		await expect(terrace).toHaveAttribute("data-state", "rest")
		const card = slotIn(popup, "library-comment-thread")
		await expectBesidePin(card, boat)
		await expect(card).toHaveAccessibleName(ZONE_ANCHOR_LINE)

		const frame = slotIn(popup, "library-image-zone")
		await expect(frame).toHaveAttribute("data-state", "anchored")
		await expect(getComputedStyle(frame).borderTopWidth).toBe("0px")
		await expect(getComputedStyle(frame).borderTopLeftRadius).toBe("4px")
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
		await expect(groundOf(terrace)).toBe("rgb(255, 255, 255)")
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

export const ResolvedThreadInPlace = meta.story({
	args: {
		threads: [
			{ ...IMAGE_THREADS[0], isResolved: true },
			...IMAGE_THREADS.slice(1),
		],
		resolution: { by: "Steve", time: "1 min" },
	},
	render: (args) => <LiveViewer {...VIEWER_ARGS} {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A resolved thread shown back on the image, as artboard Resolved 2 draws it. Check its pin sits on its anchor in the resolved state, a check on a disc in the Space colour, while the open threads keep their pins at rest, and that a click opens its card beside the pin with the resolved footer naming who resolved it and Reopen, the pin staying resolved and the zone framed.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { popup, image } = await viewer()
		const [boat, terrace] = pinsIn(popup)
		await expect(boat).toHaveAttribute("data-state", "resolved")
		await expect(boat).toHaveAccessibleName("Resolved comment by Steve")
		await expect(boat).toHaveAttribute("aria-expanded", "false")
		await expect(slotIn(boat, "library-comment-pin-check")).toBeVisible()
		await expect(terrace).toHaveAttribute("data-state", "rest")
		await expectPinOn(boat, image, BOAT_ZONE)
		await expect(slotsIn(popup, "library-comment-thread")).toHaveLength(0)

		await userEvent.click(boat)
		await expect(args.onOpenThread).toHaveBeenLastCalledWith(BOAT_THREAD)
		const card = slotIn(popup, "library-comment-thread")
		await expect(card).toHaveAttribute("data-resolved", "true")
		await expect(slotIn(card, "library-comment-resolution")).toHaveTextContent(
			"Resolved by Steve · 1 min",
		)
		await expect(
			within(card).getByRole("button", { name: "Reopen" }),
		).toBeVisible()
		await expect(boat).toHaveAttribute("data-state", "resolved")
		await expect(boat).toHaveAttribute("aria-expanded", "true")
		await expectPinOn(boat, image, BOAT_ZONE)
		await expectBesidePin(card, boat)
		await expectFrameOn(slotIn(popup, "library-image-zone"), image, BOAT_ZONE)
	},
})

export const CardKeptInsideStage = meta.story({
	args: {
		threads: [
			...IMAGE_THREADS,
			{ id: "thread-corner", author: LENA, anchor: CORNER_POINT },
		],
		openThreadId: "thread-corner",
		isCommentMode: true,
		draftAnchor: TOP_EDGE_POINT,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A thread open on a point in the bottom right corner of the image and a comment being written against its top right corner. Check both pins stay on their anchors, that the thread card and the composer open 12 px left of their pin instead of crossing the right edge, that the card is lifted off the bottom edge and the composer dropped under the top edge, that both stay inside the stage once the image is zoomed and scrolled, and that both come back beside their pin once the image fits the stage again.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const { popup, image } = await viewer()
		const corner = pinsIn(popup)[IMAGE_THREADS.length]
		const draft = pinsIn(popup).at(-1)
		if (!draft) throw new Error("No draft pin drawn")
		const card = slotIn(popup, "library-comment-thread")
		const composer = slotIn(popup, "library-comment-composer")

		await expectPinOn(corner, image, CORNER_POINT)
		await expectPinOn(draft, image, TOP_EDGE_POINT)
		await waitFor(() => expectBeforePin(card, corner))
		await waitFor(() => expectBeforePin(composer, draft))
		const lifted = await expectInsideStage(card, popup)
		await expect(lifted.box.bottom).toBeCloseTo(lifted.stage.bottom, 0)
		const dropped = await expectInsideStage(composer, popup)
		await expect(dropped.box.top).toBeGreaterThan(
			draft.getBoundingClientRect().top,
		)

		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		await userEvent.click(
			within(popup).getByRole("button", { name: "Zoom in" }),
		)
		const scroller = slotIn(popup, "library-lightbox-zoom")
		scroller.scrollTo({ left: 120, top: 80 })
		await waitFor(() => expect(scroller.scrollLeft).toBe(120))
		await expectPinOn(corner, image, CORNER_POINT)
		await expectPinOn(draft, image, TOP_EDGE_POINT)
		await waitFor(() => expectInsideStage(card, popup))
		await waitFor(() => expectInsideStage(composer, popup))

		await userEvent.click(
			within(popup).getByRole("button", { name: /%, fit to the window$/ }),
		)
		await waitFor(() => expectBeforePin(card, corner))
		await waitFor(() => expectBeforePin(composer, draft))
		await expectInsideStage(card, popup)
	},
})

export const EscapeClosesInnermost = meta.story({
	tags: ["test-only"],
	args: { isCommentMode: true, draftAnchor: DRAFT_POINT },
	render: (args) => <LiveViewer {...VIEWER_ARGS} {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Comment mode on with a comment being written and the mention menu open, then Escape pressed again and again. Check the first Escape closes the menu alone with the draft and its @ kept, the second closes the composer alone, the same two steps on a thread card opened from its pin, comment mode and the viewer kept all along, then one more Escape leaves comment mode and the viewer stays open.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { popup } = await viewer()
		const type = (keys: string) => userEvent.keyboard(keys)
		const expectStillCommenting = async () => {
			await expect(args.onCommentModeChange).not.toHaveBeenCalled()
			await expect(args.onClose).not.toHaveBeenCalled()
			await expect(
				within(popup).getByRole("button", { name: "Comment" }),
			).toHaveAttribute("aria-pressed", "true")
		}

		const composer = slotIn(popup, "library-comment-composer")
		await expectMentionMenuClosedByEscape(
			popup,
			within(composer).getByPlaceholderText("Comment, @ to mention"),
			type,
		)
		await expect(args.onCloseDraft).not.toHaveBeenCalled()
		await expectStillCommenting()

		await type("{Escape}")
		await waitFor(() =>
			expect(slotsIn(popup, "library-comment-composer")).toHaveLength(0),
		)
		await expect(args.onCloseDraft).toHaveBeenCalledOnce()
		await expectStillCommenting()

		await userEvent.click(pinsIn(popup)[0])
		const card = slotIn(popup, "library-comment-thread")
		await expectMentionMenuClosedByEscape(
			popup,
			within(card).getByPlaceholderText("Reply, @ to mention"),
			type,
		)
		await expect(args.onCloseThread).not.toHaveBeenCalled()
		await expectStillCommenting()

		await type("{Escape}")
		await waitFor(() =>
			expect(slotsIn(popup, "library-comment-thread")).toHaveLength(0),
		)
		await expect(args.onCloseThread).toHaveBeenCalledOnce()
		await expectStillCommenting()

		await type("{Escape}")
		await expect(args.onCommentModeChange).toHaveBeenCalledOnce()
		await expect(args.onCommentModeChange).toHaveBeenCalledWith(false)
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()
	},
})

export const EscapeAfterCommentButtonLeavesMode = meta.story({
	tags: ["test-only"],
	render: (args) => <LiveViewer {...VIEWER_ARGS} {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A click on the Comment button of the bar, then Escape with the focus still on the button. Check the click turns comment mode on, that Escape turns it off and leaves the viewer open, and that the next Escape closes the viewer.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const { popup } = await viewer()
		const comment = within(popup).getByRole("button", { name: "Comment" })

		await userEvent.click(comment)
		await expect(comment).toHaveAttribute("aria-pressed", "true")
		await expect(comment).toHaveFocus()

		await userEvent.keyboard("{Escape}")
		await expect(args.onCommentModeChange).toHaveBeenLastCalledWith(false)
		await expect(comment).toHaveAttribute("aria-pressed", "false")
		await expect(args.onClose).not.toHaveBeenCalled()
		await expect(popup).toBeVisible()

		await userEvent.keyboard("{Escape}")
		await expect(args.onClose).toHaveBeenCalledOnce()
	},
})
