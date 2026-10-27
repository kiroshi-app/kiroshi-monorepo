import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectGlazeBorders, slotIn } from "@workspace/storybook/story-utils"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const SIDE = 40

const meta = preview.meta({
	title: "Branding/OutlinedHexagon",
	component: OutlinedHexagon,
	parameters: {
		docs: {
			description: {
				component:
					"The rounded Kiroshi hexagon filled with one colour and wearing the C border inside its outline, so the shape never grows past its box: a translucent edge and a white lip along the top from 20px up, a slightly stronger edge alone below. It fills the positioned box around it; the companion avatar, the subject icon cell and the bot pile draw on it.",
			},
		},
	},
	decorators: [
		(Story) => (
			<span
				style={{
					position: "relative",
					display: "block",
					width: SIDE,
					height: SIDE,
				}}
			>
				<Story />
			</span>
		),
	],
	args: {
		side: SIDE,
		fill: "var(--secondary)",
	},
})

const expectFilledWithTheGlazeBorder = async (
	canvasElement: HTMLElement,
	theme: "light" | "dark",
) => {
	const art = slotIn(canvasElement, "outlined-hexagon")
	const box = art.getBoundingClientRect()
	await expect([box.width, box.height]).toEqual([SIDE, SIDE])
	await expect(art).toHaveAttribute("aria-hidden", "true")
	await expect(slotIn(art, "outlined-hexagon-face").style.fill).toBe(
		"var(--secondary)",
	)
	await expectGlazeBorders(canvasElement, theme)
}

export const FilledWithTheGlazeBorder = meta.story({
	play: ({ canvasElement }) =>
		expectFilledWithTheGlazeBorder(canvasElement, "light"),
})

export const FilledWithTheGlazeBorderDark = meta.story({
	globals: { theme: "dark" },
	play: ({ canvasElement }) =>
		expectFilledWithTheGlazeBorder(canvasElement, "dark"),
})
