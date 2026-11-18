import { useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import {
	type LiveHtmlPlacement,
	LiveHtmlSlot,
	type LiveHtmlSlotProps,
} from "@workspace/ui/components/live-html-slot"
import { Button } from "@workspace/ui/components/ui/button"

const HTML_SOURCE = `<!doctype html>
<html>
  <body>
    <h1>Budget</h1>
    <canvas id="chart"></canvas>
    <script src="chart.js"></script>
  </body>
</html>`

const SHORT_PAGE_HEIGHT = 160
const TALL_PAGE_HEIGHT = 2400
const GROWN_PAGE_HEIGHT = 640
const FRACTIONAL_PAGE_HEIGHT = 240.5

const PAGE_STILL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAoAAAAFACAMAAAAbEz04AAAADFBMVEX///8fKTc7gvbR1dtnm1WqAAAC50lEQVR42u3SiQkAIAwEwaj992wN4kOCMwUcYjYCAAAAAAAAAAAAAAAAAAAoqyXnQgIUIAJEgAJEgAhQgAgQAQoQASJAASJABChABIgABYgAEaAAESACFCACRIACBAAAAAAAAIAfjMv8MAJEgCBABAgCRIAgQAAAAAAAAAAAAAAAAAAAAAAAAAAAWNU3+UEEiABBgAgQBIgAQYAIEASIAEGACBAEiABBgAgQAQoQASJAASJABChABIgABYgAEaAAESACFCACRIACRIAIUIAO6P0CFCAOKEABChAHFKAABYgDClCAAsQBBShAAeKAAhSgAHFAAQpQgDigAAUoQBzQ+wXo/QJ0QO8XoPcL0AG9X4DeL0AH9H4Ber8AHdD7Bej9AnRA7xeg9wvQAb1fgN4vQAf0fgF6vwBffED1fQEKUIACFKAABShAAQpQgAIUoAAFKEABClCAAhSgAAUoQAEKUIACFKAABShAAQpQgAIUoAAFKEABClCAAhSgAAUoQAEKUIACFKAABShAAQpQIAIUoH0BCkSAArQvQIEIUID2BSgQAQrQvgAFIkABClCAAhGgAAUoQIEIUIACFKBABChAAQpQIAIUoAAFKEABClCAAhSgAAUoQAEKUIACFKAABWhfgPYFaF+AArQvQPsCFKB9AdoXoADtC9C+AAVoX4D2BeiD7QvQvgB9sH0B2hegD7YvQPsC9MH2BWhfgD7YvgDtC9AH2xegfQH6YPsCtC9AB7QvQPsCdED7ArQvQAe0L0D7AnRA+wK0L0AHFKAA7QvQvgAFaF+A9gUoQPsCtC9AAdoXoH0B+mD7ArQvQB9sX4D2BeiD7QvQvgB9sH0B2hegD7YvQPsC9MH2BWhfgD7YvgDtC9AH2xegfQE6oH0B2hegA9oXoH0BOqB9AdoXoAPaF6B9AdoXoADtC9C+AAVoX4D2BShA+1kDHHCQAKkVIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHDcBGgafcDkB5S4AAAAASUVORK5CYII="
const OTHER_PAGE_STILL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR42mOQ1zQHIgADUAD/sT/BWQAAAABJRU5ErkJggg=="

const partOf = (canvasElement: HTMLElement, slot: string, name: string) => {
	const part = canvasElement.querySelector<HTMLElement>(`[data-slot='${slot}']`)
	if (!part) throw new Error(`The ${name} did not render.`)
	return part
}

const viewOf = (canvasElement: HTMLElement) =>
	partOf(canvasElement, "live-html-slot-view", "reserved area")

const cardOf = (view: HTMLElement) => {
	const card = view.closest<HTMLElement>("[data-slot='live-html-slot']")
	if (!card) throw new Error("The reserved area is not in its card.")
	return card
}

const rectOf = (element: Element) => {
	const { x, y, width, height } = element.getBoundingClientRect()
	return { x, y, width, height }
}

const lastPlacementOf = (
	onPlacementChange: LiveHtmlSlotProps["onPlacementChange"],
): LiveHtmlPlacement | null | undefined =>
	(onPlacementChange as ReturnType<typeof fn>).mock.lastCall?.[0]

const reportFollows = async (
	onPlacementChange: LiveHtmlSlotProps["onPlacementChange"],
	measure: () => LiveHtmlPlacement,
	previous?: LiveHtmlPlacement,
) => {
	await waitFor(() => {
		expect(lastPlacementOf(onPlacementChange)).not.toEqual(previous)
		expect(lastPlacementOf(onPlacementChange)).toEqual(measure())
	})
	return measure()
}

const visiblePartOf = (view: Element, scroller: Element) => {
	const viewBox = view.getBoundingClientRect()
	const scrollerBox = scroller.getBoundingClientRect()
	const x = Math.max(viewBox.left, scrollerBox.left)
	const y = Math.max(viewBox.top, scrollerBox.top)
	return {
		x,
		y,
		width: Math.min(viewBox.right, scrollerBox.right) - x,
		height: Math.min(viewBox.bottom, scrollerBox.bottom) - y,
	}
}

const bottomRadiusIn = (view: HTMLElement) => {
	const style = getComputedStyle(cardOf(view))
	return {
		topLeft: 0,
		topRight: 0,
		bottomRight: Number.parseFloat(style.borderBottomRightRadius),
		bottomLeft: Number.parseFloat(style.borderBottomLeftRadius),
	}
}

const placementIn = (view: HTMLElement, scroller: Element) => ({
	rect: rectOf(view),
	clip: visiblePartOf(view, scroller),
	radius: bottomRadiusIn(view),
})

const scrollPast = (scroller: Element, view: HTMLElement, share: number) => {
	scroller.scrollTop +=
		view.getBoundingClientRect().top -
		scroller.getBoundingClientRect().top +
		view.offsetHeight * share
}

const expectSizedToPage = async (
	canvasElement: HTMLElement,
	height: number,
) => {
	const canvas = within(canvasElement)
	const slot = canvas.getByRole("group", { name: "Live view" })
	const view = viewOf(canvasElement)
	const paragraph = canvas.getByTestId("paragraph-above")
	const line = paragraph.getBoundingClientRect().height
	await expect(
		Math.abs(view.getBoundingClientRect().height - height),
	).toBeLessThanOrEqual(line)
	await expect(slot.offsetWidth).toBe(paragraph.offsetWidth)
	for (const element of [slot, view])
		await expect(element.scrollHeight).toBe(element.clientHeight)
}

const expectAnswerCardFrame = async (card: HTMLElement) => {
	const style = getComputedStyle(card)
	await expect(style.boxShadow).toContain("0px 0px 0px 1px")
	await expect(style.borderWidth).toBe("0px")
	await expect(style.overflow).toBe("hidden")
	await expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0)
	for (const corner of [
		style.borderTopRightRadius,
		style.borderBottomRightRadius,
		style.borderBottomLeftRadius,
	])
		await expect(corner).toBe(style.borderTopLeftRadius)
	for (const side of [
		style.paddingTop,
		style.paddingRight,
		style.paddingBottom,
		style.paddingLeft,
	])
		await expect(side).toBe("0px")
}

const expectViewInCard = async (canvasElement: HTMLElement) => {
	const slot = within(canvasElement).getByRole("group", { name: "Live view" })
	await expectAnswerCardFrame(slot)
	const slotBox = slot.getBoundingClientRect()
	const view = viewOf(canvasElement)
	const viewBox = view.getBoundingClientRect()
	const headerBox = partOf(
		canvasElement,
		"markdown-answer-card-header",
		"card header",
	).getBoundingClientRect()
	await expect(viewBox.left).toBe(slotBox.left)
	await expect(viewBox.right).toBe(slotBox.right)
	await expect(viewBox.bottom).toBe(slotBox.bottom)
	await expect(viewBox.top).toBe(headerBox.bottom)
	await expect(slotBox.height).toBe(headerBox.height + viewBox.height)
	await expect(bottomRadiusIn(view).bottomLeft).toBeGreaterThan(0)
}

const ScrollingReply = (props: LiveHtmlSlotProps) => (
	<section
		aria-label="Agent reply"
		data-testid="reply-scroller"
		className="h-[28rem] overflow-y-auto p-4"
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region takes keyboard focus so it can be scrolled
		tabIndex={0}
	>
		<MarkdownProse>
			<p data-testid="paragraph-above">The budget chart, drawn live.</p>
			<LiveHtmlSlot {...props} />
			<p className="h-[40rem]">The figures come from the March export.</p>
		</MarkdownProse>
	</section>
)

const PageMeasuredAgain = (props: LiveHtmlSlotProps) => {
	const [height, setHeight] = useState(props.height)
	return (
		<>
			<Button onClick={() => setHeight(GROWN_PAGE_HEIGHT)}>
				Measure the page again
			</Button>
			<ScrollingReply {...props} height={height} />
		</>
	)
}

const stillIn = (element: HTMLElement) =>
	element.querySelector<HTMLImageElement>("[data-slot='live-html-slot-still']")

const expectStillFillsView = async (canvasElement: HTMLElement) => {
	const view = viewOf(canvasElement)
	const still = stillIn(view)
	if (!still) throw new Error("The still did not render.")
	await waitFor(() => expect(still.naturalWidth).toBeGreaterThan(0))
	await expect(rectOf(still)).toEqual(rectOf(view))
	const style = getComputedStyle(still)
	await expect(style.objectFit).toBe("cover")
	await expect(style.objectPosition).toBe("0% 0%")
	await expect(style.pointerEvents).toBe("none")
	await expect(still).toHaveAttribute("aria-hidden", "true")
	await expect(within(canvasElement).queryByRole("img")).not.toBeInTheDocument()
}

const StillTakenAgain = (props: LiveHtmlSlotProps) => {
	const [still, setStill] = useState(props.still)
	return (
		<>
			<Button onClick={() => setStill(OTHER_PAGE_STILL)}>
				Take another still
			</Button>
			<Button onClick={() => setStill(undefined)}>Drop the still</Button>
			<ScrollingReply {...props} still={still} />
		</>
	)
}

const StatusChangesAfterMount = (props: LiveHtmlSlotProps) => {
	const [status, setStatus] = useState(props.status)
	return (
		<>
			<Button onClick={() => setStatus("live")}>Show the live view</Button>
			<Button onClick={() => setStatus("unavailable")}>
				Fail the live view
			</Button>
			<ScrollingReply {...props} status={status} />
		</>
	)
}

const UNAVAILABLE_WITHOUT_CODE =
	"Couldn’t show the live view. Ask for the page again to retry."

const expectSentenceInCard = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	const slot = canvas.getByRole("group", { name: "Live view" })
	await expect(slot).toHaveAttribute("aria-busy", "false")
	await expectAnswerCardFrame(slot)
	const sentence = within(slot).getByText(UNAVAILABLE_WITHOUT_CODE)
	const header = partOf(
		canvasElement,
		"markdown-answer-card-header",
		"card header",
	)
	await expect(rectOf(slot).height).toBe(
		rectOf(header).height + rectOf(sentence).height,
	)
	await expect(
		canvas.queryByRole("group", { name: /^Code snippet/ }),
	).not.toBeInTheDocument()
	await expect(
		canvasElement.querySelector("[data-slot='live-html-slot-view']"),
	).toBeNull()
	await expect(within(slot).queryByRole("button")).not.toBeInTheDocument()
}

const meta = preview.meta({
	title: "Conversation/Markdown/LiveHtmlSlot",
	component: LiveHtmlSlot,
	parameters: {
		docs: {
			description: {
				component:
					"The place a live HTML view takes inside an agent reply. The app lays a native view over the `rect` `onPlacementChange` reports and shows only its `clip`, the part the reply's scroll containers leave visible, with its corners cut by `radius`, so nothing interactive lives inside the reserved area, and the header bar above it carries only its label. Without a live view, the HTML reads as the fence an `html` block renders, and a page with no code to show reads as one sentence in the same card.",
			},
		},
	},
	args: {
		status: "live" as const,
		html: HTML_SOURCE,
		onPlacementChange: fn(),
	},
})

export const Live = meta.story({
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A live view whose page height is not known yet, in a reply that scrolls: the slot wears the outlined, rounded answer card and the reserved area holds a 20rem placeholder, flush against the ring and under the header divider. The header holds no button and Escape changes nothing. The reported rect, clip and radius follow the reserved area through a scroll and a resize of the reply column, and a new card radius alone reports a new placement, square on top under the header and rounded at the bottom.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const placed = () => placementIn(view, scroller)

		const mounted = await reportFollows(args.onPlacementChange, placed)
		await expect(mounted.clip).toEqual(mounted.rect)
		await expectViewInCard(canvasElement)
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()

		const reportCount = (args.onPlacementChange as ReturnType<typeof fn>).mock
			.calls.length
		const focused = document.activeElement
		await userEvent.keyboard("{Escape}")
		await expect(
			canvas.getByRole("group", { name: "Live view" }),
		).toBeInTheDocument()
		await expect(args.onPlacementChange).toHaveBeenCalledTimes(reportCount)
		await expect(document.activeElement).toBe(focused)

		scroller.scrollTop += 16
		const scrolled = await reportFollows(
			args.onPlacementChange,
			placed,
			mounted,
		)

		scroller.style.width = `${scroller.offsetWidth / 2}px`
		const resized = await reportFollows(
			args.onPlacementChange,
			placed,
			scrolled,
		)

		const above = canvas.getByTestId("paragraph-above")
		above.textContent = `${above.textContent} `.repeat(12)
		const reflowed = await reportFollows(
			args.onPlacementChange,
			placed,
			resized,
		)

		cardOf(view).style.borderRadius = "8px"
		window.dispatchEvent(new Event("resize"))
		await waitFor(() =>
			expect(lastPlacementOf(args.onPlacementChange)).toEqual({
				rect: reflowed.rect,
				clip: reflowed.clip,
				radius: { topLeft: 0, topRight: 0, bottomRight: 8, bottomLeft: 8 },
			}),
		)
	},
})

export const LiveDark = meta.story({
	globals: { theme: "dark" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same live slot as `Live` on the dark thread: the outlined, rounded card holds the reserved area flush against its ring and under the header divider, and the reported rect, clip and radius match it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const mounted = await reportFollows(args.onPlacementChange, () =>
			placementIn(view, scroller),
		)
		await expect(mounted.clip).toEqual(mounted.rect)
		await expectViewInCard(canvasElement)
	},
})

export const LiveWithStill = meta.story({
	args: { still: PAGE_STILL },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A live slot given a still of its page: the image fills the reserved area edge to edge, flush against the ring and under the header divider, its bottom corners cut by the card radius, kept at its aspect ratio from the top left corner. It stays out of the accessibility tree and of pointer events, and the reported rect, clip and radius are those of the slot without a still.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const mounted = await reportFollows(args.onPlacementChange, () =>
			placementIn(view, scroller),
		)
		await expect(mounted.clip).toEqual(mounted.rect)
		await expectViewInCard(canvasElement)
		await expectStillFillsView(canvasElement)
	},
})

export const LiveWithStillDark = meta.story({
	args: LiveWithStill.input.args,
	globals: { theme: "dark" },
	render: LiveWithStill.input.render,
	play: LiveWithStill.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"The same slot as `LiveWithStill` on the dark thread: the still keeps the page's own colours and fills the reserved area of the outlined card, its bottom corners cut by the card radius.",
			},
		},
	},
})

export const StillChangesAfterMount = meta.story({
	tags: ["test-only"],
	args: { still: PAGE_STILL },
	render: (args) => <StillTakenAgain {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Another still is taken, then the still is dropped, after the slot mounted: the reserved area stays the same element, draws the new image, then goes back to empty, and no new placement is reported.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const mounted = await reportFollows(args.onPlacementChange, () =>
			placementIn(view, scroller),
		)
		const reportCount = (args.onPlacementChange as ReturnType<typeof fn>).mock
			.calls.length
		await expect(stillIn(view)).toHaveAttribute("src", PAGE_STILL)

		await userEvent.click(
			canvas.getByRole("button", { name: "Take another still" }),
		)
		await expect(stillIn(view)).toHaveAttribute("src", OTHER_PAGE_STILL)
		await expectStillFillsView(canvasElement)

		await userEvent.click(
			canvas.getByRole("button", { name: "Drop the still" }),
		)
		await expect(viewOf(canvasElement)).toBe(view)
		await expect(view.childElementCount).toBe(0)
		await expect(lastPlacementOf(args.onPlacementChange)).toEqual(mounted)
		await expect(args.onPlacementChange).toHaveBeenCalledTimes(reportCount)
	},
})

export const ScrolledOutOfView = meta.story({
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reply scrolls the live view half out, then fully out. The reported rect keeps the reserved size at its scrolled place while the clip shrinks to the visible half, then to zero width and zero height.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const placed = () => placementIn(view, scroller)
		const mounted = await reportFollows(args.onPlacementChange, placed)

		scrollPast(scroller, view, 0.5)
		const partlyOut = await reportFollows(
			args.onPlacementChange,
			placed,
			mounted,
		)
		await expect(partlyOut.rect.width).toBe(mounted.rect.width)
		await expect(partlyOut.rect.height).toBe(mounted.rect.height)
		await expect(partlyOut.clip.height).toBeGreaterThan(0)
		await expect(partlyOut.clip.height).toBeLessThan(partlyOut.rect.height)

		scrollPast(scroller, view, 1)
		await waitFor(() =>
			expect(lastPlacementOf(args.onPlacementChange)).toMatchObject({
				rect: {
					width: mounted.rect.width,
					height: mounted.rect.height,
					y: view.getBoundingClientRect().y,
				},
				clip: { width: 0, height: 0 },
			}),
		)
	},
})

export const ShortPage = meta.story({
	args: { height: SHORT_PAGE_HEIGHT },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A page shorter than the placeholder: the reserved area is exactly the page height at the width of the reply, with no scrollbar in the slot, and the clip covers the whole rect.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const mounted = await reportFollows(args.onPlacementChange, () =>
			placementIn(view, scroller),
		)
		await expectSizedToPage(canvasElement, SHORT_PAGE_HEIGHT)
		await expect(mounted.clip).toEqual(mounted.rect)
	},
})

export const TallPage = meta.story({
	args: { height: TALL_PAGE_HEIGHT },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A page several screens tall: the reserved area takes its full height, only the reply scrolls, and the clip is the part of the reserved area the reply shows, every row of the reply viewport once scrolled to its middle.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const placed = () => placementIn(view, scroller)
		const mounted = await reportFollows(args.onPlacementChange, placed)
		await expectSizedToPage(canvasElement, TALL_PAGE_HEIGHT)
		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
		await expect(mounted.clip.height).toBeLessThan(mounted.rect.height)

		scrollPast(scroller, view, 0.5)
		const midway = await reportFollows(args.onPlacementChange, placed, mounted)
		const reply = rectOf(scroller)
		await expect(midway.clip).toEqual({
			x: midway.rect.x,
			y: reply.y,
			width: midway.rect.width,
			height: reply.height,
		})
	},
})

export const HeightChangesAfterMount = meta.story({
	args: { height: SHORT_PAGE_HEIGHT },
	render: (args) => <PageMeasuredAgain {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The page is measured again, taller, after the slot mounted: the reserved area grows to the new height in place and the reported rect and clip follow it.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const placed = () => placementIn(view, scroller)
		const mounted = await reportFollows(args.onPlacementChange, placed)
		await expectSizedToPage(canvasElement, SHORT_PAGE_HEIGHT)

		await userEvent.click(
			canvas.getByRole("button", { name: "Measure the page again" }),
		)
		const grown = await reportFollows(args.onPlacementChange, placed, mounted)
		await expectSizedToPage(canvasElement, GROWN_PAGE_HEIGHT)
		await expect(grown.rect.y).toBe(mounted.rect.y)
		await expect(grown.clip.height).toBeLessThan(grown.rect.height)
	},
})

export const FractionalCardSize = meta.story({
	tags: ["test-only"],
	args: { height: FRACTIONAL_PAGE_HEIGHT },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The reply column is a fractional pixel wide and the page a fractional pixel tall: the reported bottom corners still carry the card radius. Once the reserved area stops two pixels short of the right edge, the bottom right corner reports 0 and the bottom left keeps the radius.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		const card = cardOf(view)
		const scroller = canvas.getByTestId("reply-scroller")
		scroller.style.width = "400.5px"
		await expect(card.getBoundingClientRect().width % 1).not.toBe(0)
		await expect(card.getBoundingClientRect().height % 1).not.toBe(0)

		const rounded = bottomRadiusIn(view)
		await expect(rounded.bottomLeft).toBeGreaterThan(0)
		await waitFor(() =>
			expect(lastPlacementOf(args.onPlacementChange)?.radius).toEqual(rounded),
		)

		view.style.marginInlineEnd = "2px"
		await waitFor(() =>
			expect(lastPlacementOf(args.onPlacementChange)?.radius).toEqual({
				...rounded,
				bottomRight: 0,
			}),
		)
	},
})

export const Loading = meta.story({
	args: { status: "loading" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The live view is on its way: a skeleton fills the reserved area of the same outlined card at the same size as the live slot, its bottom corners cut by the card radius, the slot reads busy and the header holds no button.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("group", { name: "Live view" }),
		).toHaveAttribute("aria-busy", "true")
		const view = viewOf(canvasElement)
		const skeleton = view.querySelector("[data-slot='skeleton']")
		if (!skeleton) throw new Error("The skeleton did not render.")
		await expect(rectOf(skeleton)).toEqual(rectOf(view))
		await expectViewInCard(canvasElement)
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
	},
})

export const LoadingDark = meta.story({
	args: Loading.input.args,
	globals: { theme: "dark" },
	render: Loading.input.render,
	play: Loading.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"The same loading slot as `Loading` on the dark thread: the skeleton fills the reserved area of the outlined card, its bottom corners cut by the card radius.",
			},
		},
	},
})

export const LoadingWithStill = meta.story({
	tags: ["test-only"],
	args: { ...Loading.input.args, still: PAGE_STILL },
	render: Loading.input.render,
	parameters: {
		docs: {
			description: {
				story:
					"A still given while the live view is on its way: the skeleton fills the reserved area and the still is not drawn.",
			},
		},
	},
	play: async (context) => {
		await Loading.input.play?.(context)
		await expect(stillIn(context.canvasElement)).toBeNull()
	},
})

export const LoadingTallPage = meta.story({
	args: { ...Loading.input.args, height: TALL_PAGE_HEIGHT },
	render: Loading.input.render,
	parameters: {
		docs: {
			description: {
				story:
					"The live view of a page several screens tall is on its way: the skeleton fills the whole reserved area at the page height under the card header, the frame the live view takes, however long the wait.",
			},
		},
	},
	play: async (context) => {
		await Loading.input.play?.(context)
		await expectSizedToPage(context.canvasElement, TALL_PAGE_HEIGHT)
		await expect(context.canvas.queryByRole("alert")).not.toBeInTheDocument()
	},
})

export const LoadingTallPageDark = meta.story({
	args: LoadingTallPage.input.args,
	globals: { theme: "dark" },
	render: LoadingTallPage.input.render,
	play: LoadingTallPage.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"The same tall loading slot as `LoadingTallPage` on the dark thread: the skeleton fills the whole reserved area at the page height.",
			},
		},
	},
})

export const LoadingTurnsLive = meta.story({
	tags: ["test-only"],
	args: LoadingTallPage.input.args,
	render: (args) => <StatusChangesAfterMount {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The live view arrives at the height the skeleton held: the skeleton leaves, the reserved area stays the same element and the card keeps its size and its place.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const card = cardOf(view)
		await expect(card).toHaveAttribute("aria-busy", "true")
		const loading = rectOf(card)

		await userEvent.click(
			canvas.getByRole("button", { name: "Show the live view" }),
		)
		await waitFor(() => expect(card).toHaveAttribute("aria-busy", "false"))
		await expect(view.querySelector("[data-slot='skeleton']")).toBeNull()
		await expect(viewOf(canvasElement)).toBe(view)
		await expect(rectOf(card)).toEqual(loading)
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"No live view on this platform: the HTML reads as the code block an `html` fence renders, in the same outlined, rounded card as the live slot, with no reserved area.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("group", { name: "Code snippet, html" }),
		).toBeInTheDocument()
		await expectAnswerCardFrame(
			partOf(canvasElement, "markdown-fence", "html fence"),
		)
		await expect(args.onPlacementChange).not.toHaveBeenCalled()
	},
})

export const UnavailableDark = meta.story({
	args: Unavailable.input.args,
	globals: { theme: "dark" },
	render: Unavailable.input.render,
	play: Unavailable.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"The same fallback as `Unavailable` on the dark thread: the `html` fence in the outlined, rounded answer card.",
			},
		},
	},
})

export const UnavailableWithStill = meta.story({
	tags: ["test-only"],
	args: { ...Unavailable.input.args, still: PAGE_STILL },
	render: Unavailable.input.render,
	parameters: {
		docs: {
			description: {
				story:
					"A still given on a platform with no live view: the HTML still reads as the `html` fence and the still is not drawn.",
			},
		},
	},
	play: async (context) => {
		await Unavailable.input.play?.(context)
		await expect(stillIn(context.canvasElement)).toBeNull()
	},
})

export const UnavailableWithoutCode = meta.story({
	args: { status: "unavailable", html: undefined },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"No live view and no code to show: the outlined Live view card keeps its header and reads one sentence, with no code block, no reserved area and no placement reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectSentenceInCard(canvasElement)
		await expect(args.onPlacementChange).not.toHaveBeenCalled()
	},
})

export const UnavailableWithoutCodeDark = meta.story({
	args: UnavailableWithoutCode.input.args,
	globals: { theme: "dark" },
	render: UnavailableWithoutCode.input.render,
	play: UnavailableWithoutCode.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"The same card as `UnavailableWithoutCode` on the dark thread: the header and one sentence, with no code block.",
			},
		},
	},
})

export const UnavailableWithEmptyCode = meta.story({
	tags: ["test-only"],
	args: { ...UnavailableWithoutCode.input.args, html: "" },
	render: UnavailableWithoutCode.input.render,
	play: UnavailableWithoutCode.input.play,
	parameters: {
		docs: {
			description: {
				story:
					"An empty string given as the code: the slot reads as `UnavailableWithoutCode`, never as an empty code block.",
			},
		},
	},
})

export const LiveTurnsUnavailable = meta.story({
	tags: ["test-only"],
	args: { html: undefined },
	render: (args) => <StatusChangesAfterMount {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A live view with no code to show fails after it was placed: the reserved area leaves, the slot reports no placement and the card reads its one sentence.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		await reportFollows(args.onPlacementChange, () =>
			placementIn(view, scroller),
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Fail the live view" }),
		)
		await waitFor(() =>
			expect(lastPlacementOf(args.onPlacementChange)).toBeNull(),
		)
		await expectSentenceInCard(canvasElement)
	},
})
