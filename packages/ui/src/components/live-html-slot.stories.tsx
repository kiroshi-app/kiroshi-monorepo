import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import {
	type LiveHtmlPlacement,
	LiveHtmlSlot,
	type LiveHtmlSlotProps,
} from "@workspace/ui/components/live-html-slot"

const HTML_SOURCE = `<!doctype html>
<html>
  <body>
    <h1>Budget</h1>
    <canvas id="chart"></canvas>
    <script src="chart.js"></script>
  </body>
</html>`

const viewOf = (canvasElement: HTMLElement) => {
	const view = canvasElement.querySelector<HTMLElement>(
		"[data-slot='live-html-slot-view']",
	)
	if (!view) throw new Error("The reserved area did not render.")
	return view
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

const placementIn = (view: Element, scroller: Element) => ({
	rect: rectOf(view),
	clip: visiblePartOf(view, scroller),
})

const scrollPast = (scroller: Element, view: HTMLElement, share: number) => {
	scroller.scrollTop +=
		view.getBoundingClientRect().top -
		scroller.getBoundingClientRect().top +
		view.offsetHeight * share
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

const meta = preview.meta({
	title: "Conversation/Markdown/LiveHtmlSlot",
	component: LiveHtmlSlot,
	parameters: {
		docs: {
			description: {
				component:
					"The place a live HTML view takes inside an agent reply. The app lays a native view over the `rect` `onPlacementChange` reports and shows only its `clip`, the part the reply's scroll containers leave visible, so nothing interactive lives inside the reserved area, and the header bar above it carries only its label. Without a live view, the HTML reads as the fence an `html` block renders.",
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
					"A live view at the default height, in a reply that scrolls. The header holds no button and Escape changes nothing. The reported rect and clip follow the reserved area through a scroll and a resize of the reply column.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const view = viewOf(canvasElement)
		const scroller = canvas.getByTestId("reply-scroller")
		const placed = () => placementIn(view, scroller)

		const mounted = await reportFollows(args.onPlacementChange, placed)
		await expect(mounted.clip).toEqual(mounted.rect)
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()

		const reportCount = (args.onPlacementChange as ReturnType<typeof fn>).mock
			.calls.length
		const focused = document.activeElement
		await userEvent.keyboard("{Escape}")
		await expect(
			canvas.getByRole("group", { name: "Live view" }),
		).toBeInTheDocument()
		await expect(args.onPlacementChange).toHaveBeenCalledTimes(reportCount)
		await expect(lastPlacementOf(args.onPlacementChange)).toEqual(mounted)
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
		await reportFollows(args.onPlacementChange, placed, resized)
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

export const Loading = meta.story({
	args: { status: "loading" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The live view is on its way: a skeleton fills the reserved area, the slot reads busy and the header holds no button.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("group", { name: "Live view" }),
		).toHaveAttribute("aria-busy", "true")
		await expect(
			viewOf(canvasElement).querySelector("[data-slot='skeleton']"),
		).toBeInTheDocument()
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"No live view on this platform: the HTML reads as the code block an `html` fence renders, with no reserved area.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("group", { name: "Code snippet, html" }),
		).toBeInTheDocument()
		await expect(args.onPlacementChange).not.toHaveBeenCalled()
	},
})
