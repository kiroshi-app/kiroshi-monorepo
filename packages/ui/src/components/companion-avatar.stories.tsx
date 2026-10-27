import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { resolvedChannelsOf } from "@workspace/storybook/story-utils"
import {
	type CompanionAvatarInput,
	companionAvatar,
	type Srgb,
} from "@workspace/ui/components/companion-avatar"
import { BLOT_TINTS, hueOf } from "@workspace/ui/components/companion-colour"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const NAMES = [
	"Lyra",
	"Orion",
	"Nova",
	"Mira",
	"Vega",
	"Juno",
	"Castor",
	"Altair",
	"Atlas",
	"Kiroshi",
]

const COMPANIONS = NAMES.flatMap((name) =>
	[undefined, ...BLOT_TINTS].map((tint) => ({ name, tint, hue: hueOf(tint) })),
)

const CHANNEL_STEP = 1

const eightBitOf = ({ red, green, blue }: Srgb) =>
	[red, green, blue].map((channel) => Math.round(channel * 255))

const expectSameColour = async (browser: number[], module: Srgb) => {
	for (const [index, channel] of eightBitOf(module).entries())
		await expect(Math.abs(channel - browser[index])).toBeLessThanOrEqual(
			CHANNEL_STEP,
		)
}

const meta = preview.meta({
	title: "Branding/CompanionAvatar",
	component: DitheredFieldAvatar,
	tags: ["test-only"],
	globals: { theme_layout: "side-by-side" },
})

export const ModuleColourMatchesTheBrowser = meta.story({
	render: () => (
		<div aria-label="Companions" className="flex flex-wrap gap-2" role="group">
			{COMPANIONS.map(({ name, tint }) => (
				<DitheredFieldAvatar
					key={`${name} ${tint ?? "untinted"}`}
					name={name}
					size={24}
					hue={hueOf(tint)}
				/>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Ten companions, untinted then in every colour, light and dark. For each tile the play resolves the cell colour the canvas draws and the ground colour the browser paints, and checks that the avatar module computes the same two colours numerically, within one 8-bit channel step.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const tiles = Array.from(
			canvasElement.querySelectorAll<HTMLElement>(
				'[data-slot="companion-field"]',
			),
		)
		await expect(tiles).toHaveLength(COMPANIONS.length * 2)
		for (const [index, tile] of tiles.entries()) {
			const canvas = tile.querySelector("canvas") as HTMLCanvasElement
			const { name, hue } = COMPANIONS[index % COMPANIONS.length]
			const input: CompanionAvatarInput = {
				name,
				hue,
				state: "idle",
				time: 0,
				theme: schemeOf(tile),
			}
			const { cellColour, groundColour } = companionAvatar(input)
			await expectSameColour(
				resolvedChannelsOf(getComputedStyle(canvas).color, tile),
				cellColour,
			)
			await expectSameColour(
				resolvedChannelsOf(getComputedStyle(tile).backgroundColor, tile),
				groundColour,
			)
		}
	},
})
