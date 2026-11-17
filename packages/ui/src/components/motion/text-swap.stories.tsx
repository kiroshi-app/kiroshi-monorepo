import { useState } from "react"
import { expect, userEvent, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { TextSwap } from "@workspace/ui/components/motion/text-swap"
import { Button } from "@workspace/ui/components/ui/button"

const WORKING_LABEL = "Drafting the release notes"

const DONE_LABEL = "Release notes drafted"

const StatusThatLands = () => {
	const [isDone, setIsDone] = useState(false)
	return (
		<div className="flex w-56 flex-col items-start gap-4 text-compact leading-4">
			<TextSwap
				className="block w-full truncate"
				isShimmering={!isDone}
				text={isDone ? DONE_LABEL : WORKING_LABEL}
			/>
			<Button onClick={() => setIsDone(true)} variant="outline">
				Finish
			</Button>
		</div>
	)
}

const meta = preview.meta({
	title: "Primitives/TextSwap",
	component: TextSwap,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A status label that swaps its text in place: the old text leaves upward with a blur and a fade, the new one rises in from below, 150ms each, through the `--text-swap-*` tokens. It never animates on mount, only when `text` changes, and only opacity, blur and transform move. `isShimmering` draws the text through `ShimmerText`, which it keeps while that text leaves. Give it the truncating class of its slot, a block or a flex item, so the ellipsis travels with the text. Under `prefers-reduced-motion` the text is replaced at once.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => <StatusThatLands />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to see a shimmering work label land on its result: press Finish. Check that the working label leaves upward, that the result rises in from below with no shimmer, and that both stay on one line with an ellipsis. The conversation title stories of the sidebar row, the tab and the header button show it in place.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const swap = slotIn(canvasElement, "text-swap")
		await expect(swap).toHaveTextContent(WORKING_LABEL)
		await expect(slotsIn(swap, "shimmer-text")).toHaveLength(1)
		await expect(swap).not.toHaveAttribute("data-phase")

		await userEvent.click(canvas.getByRole("button", { name: "Finish" }))
		await waitFor(() =>
			expect(slotIn(canvasElement, "text-swap")).toHaveTextContent(DONE_LABEL),
		)
		await expect(
			slotsIn(slotIn(canvasElement, "text-swap"), "shimmer-text"),
		).toHaveLength(0)
	},
})
