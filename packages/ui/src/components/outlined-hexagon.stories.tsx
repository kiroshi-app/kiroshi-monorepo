import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const SIDE = 40

const meta = preview.meta({
	title: "Branding/OutlinedHexagon",
	component: OutlinedHexagon,
	parameters: {
		docs: {
			description: {
				component:
					"The rounded Kiroshi hexagon filled with one colour and edged by a 1px hairline drawn inside the outline, so the shape never grows past its box. It fills the positioned box around it; the subject icon cell, the bot pile and the AvatarGroup counter draw on it.",
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
		path: roundedHexagonPath({
			halfWidth: SIDE / 2,
			halfHeight: (OUTER.halfHeight * SIDE) / (OUTER.halfWidth * 2),
		}),
		fill: "var(--secondary)",
	},
})

export const FilledWithAnInsideHairline = meta.story({
	play: async ({ canvasElement }) => {
		const art = slotIn(canvasElement, "outlined-hexagon")
		const face = slotIn(art, "outlined-hexagon-face")
		const box = art.getBoundingClientRect()
		await expect([box.width, box.height]).toEqual([SIDE, SIDE])
		await expect(art).toHaveAttribute("aria-hidden", "true")
		await expect(face).toHaveAttribute("stroke-width", "2")
		await expect(face.getAttribute("clip-path")).toMatch(/^url\(#/)
		await expect(face.style.stroke).toBe("var(--image-outline)")
	},
})
