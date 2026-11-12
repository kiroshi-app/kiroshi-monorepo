import { useState } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"

const layersOf = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll<HTMLElement>(
			'[data-slot="icon-swap"] > span',
		),
	)

const reducesMotion = () =>
	matchMedia("(prefers-reduced-motion: reduce)").matches

const expectHidden = async (layer: HTMLElement) => {
	const style = getComputedStyle(layer)
	await expect(style.opacity).toBe("0")
	await expect(style.scale).toBe(reducesMotion() ? "1" : "0.25")
	await expect(style.filter).toBe(reducesMotion() ? "none" : "blur(4px)")
}

const expectShown = async (layer: HTMLElement) => {
	const style = getComputedStyle(layer)
	await expect(style.opacity).toBe("1")
	await expect(style.filter).toBe("none")
}

const CopyToggle = () => {
	const [isCopied, setCopied] = useState(false)

	return (
		<Button
			aria-label="Copy"
			onClick={() => setCopied((copied) => !copied)}
			size="icon-xs"
			variant="ghost"
		>
			<IconSwap
				icon={<Icons.Copy />}
				isSwapped={isCopied}
				swappedIcon={<Icons.Check />}
			/>
		</Button>
	)
}

const meta = preview.meta({
	title: "Primitives/IconSwap",
	component: IconSwap,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The one crossfade every icon swap goes through: the copy buttons of a code block and a markdown table, and the reveal toggle of a launch variable. Both icons stay mounted on the same grid cell; the incoming one grows from a quarter of its size, fades in and sharpens from a 4px blur while the outgoing one does the reverse, so a swap interrupted halfway turns back instead of restarting. Under `prefers-reduced-motion` the two icons only fade, at full size and sharp.",
			},
		},
	},
	args: {
		icon: <Icons.Copy />,
		swappedIcon: <Icons.Check />,
		isSwapped: false,
	},
})

export const Resting = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Before the swap. Check that only the first icon shows and that the second one waits shrunk, transparent and blurred on the same cell, or only transparent under reduced motion. Pick `Swapped` for the state after.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [icon, swappedIcon] = layersOf(canvasElement)

		await expectShown(icon)
		await expectHidden(swappedIcon)
		if (!isInBrowserRunner()) return
		await withMotionAllowed(() => waitFor(() => expectHidden(swappedIcon)))
	},
})

export const Swapped = meta.story({
	args: { isSwapped: true },
	parameters: {
		docs: {
			description: {
				story:
					"After the swap. Check that the second icon is the one showing at full size and that the first one has left the same way the second arrived. Pick `Resting` for the state before.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [icon, swappedIcon] = layersOf(canvasElement)

		await expectHidden(icon)
		await expectShown(swappedIcon)
	},
})

export const InAButton = meta.story({
	render: () => <CopyToggle />,
	parameters: {
		docs: {
			description: {
				story:
					"The swap the app makes: an icon button that trades its copy icon for a check on press. Press it and check the two icons crossfade in place, with no jump in the button's size.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const button = canvas.getByRole("button", { name: "Copy" })
		const width = button.getBoundingClientRect().width

		await userEvent.click(button)

		const [icon, swappedIcon] = layersOf(canvasElement)
		await expect(icon).toHaveAttribute("data-shown", "false")
		await expect(swappedIcon).toHaveAttribute("data-shown", "true")
		await expect(button.getBoundingClientRect().width).toBe(width)
	},
})
