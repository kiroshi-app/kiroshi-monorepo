import { useState } from "react"
import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { MarkdownProse } from "@workspace/storybook/story-utils"
import {
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

const lastRectOf = (onRectChange: LiveHtmlSlotProps["onRectChange"]) =>
	(onRectChange as ReturnType<typeof fn>).mock.lastCall?.[0]

const ScrollingReply = (props: LiveHtmlSlotProps) => (
	<div
		data-testid="reply-scroller"
		className="h-[28rem] overflow-y-auto rounded-md border p-4"
	>
		<MarkdownProse>
			<p>The budget chart, drawn live.</p>
			<LiveHtmlSlot {...props} />
			<p className="h-[40rem]">The figures come from the March export.</p>
		</MarkdownProse>
	</div>
)

const EnlargeableReply = (props: LiveHtmlSlotProps) => {
	const [container, setContainer] = useState<HTMLElement | null>(null)
	return (
		<div
			ref={setContainer}
			data-testid="enlarged-container"
			className="relative h-[32rem] overflow-hidden p-4"
		>
			<MarkdownProse>
				<p>The budget chart, drawn live.</p>
				<LiveHtmlSlot {...props} enlargedContainer={container} />
			</MarkdownProse>
		</div>
	)
}

const meta = preview.meta({
	title: "Conversation/Markdown/LiveHtmlSlot",
	component: LiveHtmlSlot,
	parameters: {
		docs: {
			description: {
				component:
					"The place a live HTML view takes inside an agent reply. The app lays a native view over the rect `onRectChange` reports, so nothing interactive lives inside the reserved area: the enlarge control sits in the header bar above it. Without a live view, the HTML reads as the fence an `html` block renders.",
			},
		},
	},
	args: {
		status: "live" as const,
		html: HTML_SOURCE,
		onRectChange: fn(),
		onEnlargedChange: fn(),
	},
})

export const Live = meta.story({
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A live view at the default height, in a reply that scrolls. The reported rect follows the reserved area through a scroll and a resize of the reply column.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const view = viewOf(canvasElement)
		await waitFor(() =>
			expect(lastRectOf(args.onRectChange)).toEqual(rectOf(view)),
		)
		const mounted = rectOf(view)

		const scroller = canvas.getByTestId("reply-scroller")
		scroller.scrollTop = scroller.scrollTop + 16
		await waitFor(() =>
			expect(lastRectOf(args.onRectChange)).not.toEqual(mounted),
		)
		await expect(lastRectOf(args.onRectChange)).toEqual(rectOf(view))
		const scrolled = rectOf(view)

		scroller.style.width = `${scroller.offsetWidth / 2}px`
		await waitFor(() =>
			expect(lastRectOf(args.onRectChange)).not.toEqual(scrolled),
		)
		await expect(lastRectOf(args.onRectChange)).toEqual(rectOf(view))
	},
})

export const Loading = meta.story({
	args: { status: "loading" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The live view is on its way: a skeleton fills the reserved area and the slot reads busy.",
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
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	render: (args) => <ScrollingReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"No live view on this platform: the HTML reads as the code block an `html` fence renders, with no reserved area and no enlarge control.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		await expect(
			canvas.getByRole("group", { name: "Code snippet, html" }),
		).toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: "Enlarge the live view" }),
		).not.toBeInTheDocument()
		await expect(args.onRectChange).not.toHaveBeenCalled()
	},
})

export const Enlarged = meta.story({
	render: (args) => <EnlargeableReply {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The view enlarged to fill the container the app gives it, with a shrink control in place of enlarge. Escape shrinks it back and focus returns to Enlarge.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Enlarge the live view" }),
		)
		await expect(args.onEnlargedChange).toHaveBeenLastCalledWith(true)
		await expect(
			canvas.getByRole("button", { name: "Shrink the live view" }),
		).toHaveFocus()

		await userEvent.keyboard("{Escape}")
		await expect(args.onEnlargedChange).toHaveBeenLastCalledWith(false)
		await waitFor(() =>
			expect(
				canvas.getByRole("button", { name: "Enlarge the live view" }),
			).toHaveFocus(),
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Enlarge the live view" }),
		)
		await expect(args.onEnlargedChange).toHaveBeenNthCalledWith(1, true)
		await expect(args.onEnlargedChange).toHaveBeenNthCalledWith(2, false)
		await expect(
			rectOf(canvas.getByRole("group", { name: "Live view" })),
		).toEqual(rectOf(canvas.getByTestId("enlarged-container")))
	},
})
