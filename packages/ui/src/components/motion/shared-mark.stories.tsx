import { useId, useState } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SharedMark } from "@workspace/ui/components/motion/shared-mark"
import { Button } from "@workspace/ui/components/ui/button"

const MARK_SIZE = 40

const Mark = () => <span className="size-10 rounded-full bg-primary" />

const Journey = () => {
	const markId = useId()
	const [arrived, setArrived] = useState(false)

	return (
		<div className="flex max-w-md flex-col gap-6">
			<Button
				size="sm"
				variant="outline"
				className="self-start"
				onClick={() => setArrived(!arrived)}
			>
				{arrived ? "Send it back" : "Send it across"}
			</Button>
			<div data-testid="origin" className="flex items-center gap-2 text-sm">
				{arrived ? null : (
					<SharedMark markId={markId}>
						<Mark />
					</SharedMark>
				)}
				Origin
			</div>
			<div data-testid="destination" className="text-sm leading-6">
				{arrived ? (
					<SharedMark markId={markId}>
						<Mark />
					</SharedMark>
				) : null}
				Destination
			</div>
		</div>
	)
}

const meta = preview.meta({
	title: "Primitives/SharedMark",
	component: SharedMark,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The box that says which of two places holds a companion's mark right now. Give the same `markId` to the places a mark can live: whichever one is on screen carries `data-state=\"marked\"` and the id in `data-mark`, and the mark appears there outright, with no travel, fade or scale, because a row that moves in reads as latency. Exactly one node may hold a given id at a time, so the places must be mutually exclusive, never two rows of one list, and the box measures the same wherever it lands, which is why it is a block box rather than an inline one. Without an id it is a plain span. `AI/Turn → Mark` shows it on the companion's avatar in a real transcript.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => <Journey />,
	parameters: {
		docs: {
			description: {
				story:
					"Send the mark across and back. Check that it leaves one place and appears at the other on the same frame, already at rest: nothing glides between them, with or without reduced motion.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const held = () => canvasElement.querySelectorAll('[data-state="marked"]')

		await expect(held()).toHaveLength(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "Send it across" }),
		)

		await expect(held()).toHaveLength(1)
		await expect(
			canvas.getByTestId("destination").querySelector('[data-state="marked"]'),
		).toBeInTheDocument()
		await expect(getComputedStyle(held()[0]).transform).toBe("none")
	},
})

export const StableBox = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Flex parent</span>
				<div data-testid="flex-parent" className="flex w-fit bg-accent">
					<SharedMark>
						<Mark />
					</SharedMark>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Text parent</span>
				<div
					data-testid="text-parent"
					className="w-fit bg-accent text-sm leading-6"
				>
					<SharedMark>
						<Mark />
					</SharedMark>
				</div>
			</div>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same mark under two formatting contexts, each tinted so any slack shows. An inline box would sit on the second parent's text baseline and leave the line's descender under it, so a mark moving from one to the other would shift the row by exactly that much. Check that neither parent is taller than the mark inside it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const heightOf = (parent: string) =>
			canvas.getByTestId(parent).getBoundingClientRect().height

		await expect(heightOf("flex-parent")).toBe(MARK_SIZE)
		await expect(heightOf("text-parent")).toBe(MARK_SIZE)
	},
})

export const Plain = meta.story({
	render: () => (
		<SharedMark>
			<Mark />
		</SharedMark>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Without a `markId` the slot is a plain span marked `plain`. Reach for this wherever a mark is drawn but is not the one the transcript currently names, the older rows of a transcript for instance.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="shared-mark"]'),
		).toHaveAttribute("data-state", "plain")
	},
})
