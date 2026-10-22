import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { centredInWindowOf, slotIn } from "@workspace/storybook/story-utils"
import { AppBootNotice } from "@workspace/ui/components/app-boot-notice"
import { BRAND_NAME } from "@workspace/ui/components/app-icon-mark"

const meta = preview.meta({
	title: "Feedback/AppBootNotice",
	component: AppBootNotice,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a desktop window shows when its very first read fails: the same window-filling surface as the boot screen, holding a single notice and the one action that can still help. It takes the window because there is no shell to put it in yet — the record never answered, so there is nothing to draw a sidebar from. Once the app is running, a failed read belongs to a notice inside the screen it broke, not to this one.",
			},
		},
	},
	args: {
		title: "Couldn’t load your spaces",
		description: "Your companions are still there.",
		onRetry: fn(),
	},
	argTypes: {
		title: { control: "text" },
		description: { control: "text" },
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The launch failure. Check that the notice sits centred in the window with no shell around it, that it stops growing on a wide window, that Retry is the first stop on Tab, and that the window still drags from the background while Retry stays clickable.",
			},
		},
	},
	play: async ({ canvas, canvasElement, args }) => {
		const surface = slotIn(canvasElement, "app-boot-notice")

		await expect(surface.clientHeight).toBe(window.innerHeight)
		await expect(surface).toHaveAttribute("data-tauri-drag-region", "deep")
		await expect(canvas.getByRole("img", { name: BRAND_NAME })).toBeVisible()

		await userEvent.tab()

		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(retry).toHaveFocus()

		await userEvent.click(retry)

		await expect(args.onRetry).toHaveBeenCalled()
	},
})

export const CentredIn700pxWindow = meta.story({
	...centredInWindowOf(700),
})

export const CentredIn1100pxWindow = meta.story({
	...centredInWindowOf(1100),
})
