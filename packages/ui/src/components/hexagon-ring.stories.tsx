import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { HexagonRing } from "@workspace/ui/components/hexagon-ring"

type PlayContext = { canvasElement: HTMLElement }

const describedAs = (story: string) => ({ docs: { description: { story } } })

const provesInk =
	(ink: string) =>
	async ({ canvasElement }: PlayContext) => {
		const ring = within(canvasElement).getByRole("img", { name: "Kiroshi" })
		await expect(getComputedStyle(ring).color).toBe(ink)
	}

const meta = preview.meta({
	title: "Branding/HexagonRing",
	component: HexagonRing,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The Kiroshi logo: a hexagonal ring in pure black on light and pure white on dark, the one brand fill with no token. Pass `label` when nothing next to it names Kiroshi, so it reads as one image; leave it out when a heading already says Kiroshi, and the ring stays decorative. The caller sizes it: a square box draws the 333 by 302 ring centred in it.",
			},
		},
	},
	args: { label: "Kiroshi", className: "size-24" },
})

export const Default = meta.story({
	parameters: describedAs(
		"The ring at 96 pixels as WindowRecoveryScreen draws it, named Kiroshi. Check it is pure black.",
	),
	play: provesInk("rgb(0, 0, 0)"),
})

export const Dark = Default.extend({
	globals: { theme: "dark" },
	parameters: describedAs("The ring on the dark scheme: pure white."),
	play: provesInk("rgb(255, 255, 255)"),
})
