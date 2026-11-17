import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AttachmentStandIn } from "@workspace/ui/components/attachment-stand-in"
import { LiveHtmlSlot } from "@workspace/ui/components/live-html-slot"

const meta = preview.meta({
	title: "Conversation/Message/AttachmentStandIn",
	component: AttachmentStandIn,
	parameters: {
		docs: {
			description: {
				component:
					"What a stored file wears when the app draws its own block for it instead of the chip, in the text of a reply or in the attachments row: the block across the whole column, then an Open control named after the file. Activating it calls `onOpen`: opening the file is never the stand-in's business.",
			},
		},
	},
	args: {
		name: "pricing-page.html",
		onOpen: fn(),
		children: (
			<LiveHtmlSlot
				status="loading"
				html=""
				height={160}
				onPlacementChange={fn()}
			/>
		),
	},
	decorators: [
		(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>,
	],
})

export const Default = meta.story({
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("group", { name: "Live view" })).toBeVisible()
		await userEvent.click(
			canvas.getByRole("button", { name: "Open pricing-page.html" }),
		)
		await expect(args.onOpen).toHaveBeenCalledOnce()
	},
})
