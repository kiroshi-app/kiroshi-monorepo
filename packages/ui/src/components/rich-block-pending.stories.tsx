import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { RichBlockPending } from "@workspace/ui/components/rich-block-pending"

const meta = preview.meta({
	title: "Conversation/Message/RichBlockPending",
	component: RichBlockPending,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The frame a rich block takes while the agent still writes it: its title, Building the view… sweeping like the work line, and still placeholders where the controls and the result will land.",
			},
		},
	},
	args: { title: "Offsite budget" },
	decorators: [
		(Story) => (
			<div className="w-161">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a block is being written. Check the frame is busy for assistive technology and named after the block.",
			},
		},
	},
	play: async ({ canvas }) => {
		const block = canvas.getByRole("region", { name: "Offsite budget" })
		await expect(block).toHaveAttribute("aria-busy", "true")
	},
})
