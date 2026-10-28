import { expect, waitFor, within } from "storybook/test"

import {
	CompanionStatesRoster,
	playCompanionStatesRoster,
} from "@workspace/storybook/companion-states-roster"
import preview from "@workspace/storybook/preview"
import { drawingOf, recordLitCells } from "@workspace/storybook/story-utils"
import { BLOT_TINTS, hueOf } from "@workspace/ui/components/companion-colour"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"

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
]

const COMPARED_NAME = "Atlas"
const COMPARED_SIZES = [20, 40, 96]
const COLOURS = [undefined, ...BLOT_TINTS]

const drawnCanvases = (root: HTMLElement) =>
	Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas[data-cells]"))

const expectOneDrawing = async (root: HTMLElement, count: number) => {
	const canvases = drawnCanvases(root)
	await expect(canvases).toHaveLength(count)
	await expect(
		new Set(canvases.map((canvas) => canvas.dataset.cells)).size,
	).toBe(1)
	await waitFor(() => expect(drawingOf(canvases[0])).not.toBe(""))
	await expect(new Set(canvases.map(drawingOf)).size).toBe(1)
}

const meta = preview.meta({
	title: "Branding/DitheredFieldAvatar",
	component: DitheredFieldAvatar,
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				component:
					"A companion drawn as a dithered field that fills the whole rounded tile: square cells in the avatar ink tone of the companion hue on the avatar ground tone of that same hue, both read from the tone table per theme, no outline, the shape carried by cell density alone. Every companion shares one screen: each cell is a square of one fixed size, its tone carried by opacity in two steps through error diffusion, so the tile reads in three tones of one hue. The density field is the companion's ASCII glyph silhouette, blurred, over a seeded low noise floor, all seeded on the name. The grid holds the same cell count at every size. At work the field drifts and the state motion passes through it; at rest, and under reduced motion, it holds still.",
			},
		},
	},
})

const STILL_WAIT = 300

const pause = (duration: number) =>
	new Promise((resolve) => setTimeout(resolve, duration))

export const OneScreenForEveryAgent = meta.story({
	render: () => (
		<div aria-label="Companions" className="flex flex-wrap gap-4" role="group">
			{NAMES.map((name, index) => (
				<div className="flex flex-col items-center gap-2" key={name}>
					<DitheredFieldAvatar
						hue={hueOf(COLOURS[index])}
						name={name}
						size={40}
					/>
					<span className="text-muted-foreground text-xs">{name}</span>
				</div>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The avatar as the app draws it, at 40 px: one companion with no colour, which takes the Kiroshi blue, then one per colour. Every tile uses the same screen, so the row reads as one family parted by silhouette and hue. Check that the cells read darker than their ground in light and lighter in dark, that no tile sits on a near-white ground in dark, and that every tile holds still at rest.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvases = drawnCanvases(canvasElement)
		const screens = canvases.map((canvas) => canvas.dataset.screen)

		await expect(canvases).toHaveLength(NAMES.length * 2)
		await expect(new Set(screens).size).toBe(1)
		const before = canvases.map((canvas) => canvas.toDataURL())
		await pause(STILL_WAIT)
		await expect(canvases.map((canvas) => canvas.toDataURL())).toEqual(before)
	},
})

export const EveryState = meta.story({
	render: () => <CompanionStatesRoster Avatar={DitheredFieldAvatar} />,
	parameters: {
		docs: {
			description: {
				story:
					"The square tone screen at work: in the mixed row, companions rest, think, search, write and work side by side, and the field drifts under each state's motion. The radios switch every companion to one state; pick `idle` and every tile holds still, pick `working` and they all move. The ladder below shows the first companion at 16, 40 and 96 px in the same state.",
			},
		},
	},
	play: async (context) => {
		const ladders = within(context.canvasElement).getAllByRole("group", {
			name: "Sizes",
		})
		for (const ladder of ladders)
			await expect(
				within(ladder).getAllByRole("img", { name: "Lyra" }),
			).toHaveLength(3)
		await playCompanionStatesRoster(context)
	},
})

export const OneDrawingAtEverySize = meta.story({
	tags: ["test-only"],
	beforeEach: recordLitCells,
	render: () => (
		<div aria-label="Sizes" className="flex items-end gap-4" role="group">
			{COMPARED_SIZES.map((size) => (
				<DitheredFieldAvatar key={size} name={COMPARED_NAME} size={size} />
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"One companion at 20, 40 and 96 px, the header, the sidebar and the settings sizes. The grid holds the same number of cells at every size and only the cell grows, so the three tiles are one drawing at three scales. Check that the 20 px tile reads as a shrunken 40 px one, not as a coarser mosaic.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectOneDrawing(canvasElement, COMPARED_SIZES.length * 2),
})

export const OneGlyphInEveryColour = meta.story({
	beforeEach: recordLitCells,
	render: () => (
		<div aria-label="Colours" className="flex flex-wrap gap-4" role="group">
			{COLOURS.map((tint) => (
				<DitheredFieldAvatar
					key={tint ?? "none"}
					name={COMPARED_NAME}
					hue={hueOf(tint)}
				/>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"One companion with no colour, then in each of the eight colours, as the Appearance picker lays its swatches. The seed comes from the name alone, so only the field colour changes and the glyph stays the companion's. Check that the nine tiles carry one shape.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectOneDrawing(canvasElement, COLOURS.length * 2),
})

export const GroundInEveryColour = meta.story({
	render: () => (
		<div aria-label="Grounds" className="flex flex-wrap gap-4" role="group">
			{COLOURS.map((tint) => (
				<div className="flex flex-col items-center gap-2" key={tint ?? "none"}>
					<DitheredFieldAvatar
						hue={hueOf(tint)}
						name={COMPARED_NAME}
						size={96}
					/>
					<span className="text-muted-foreground text-xs">
						{tint ?? "untinted"}
					</span>
				</div>
			))}
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The ground of every colour at 96 px, light above and dark below: the avatar ground tone of the companion hue, the uncoloured one the secondary surface mixed with the Kiroshi blue. Check that each ground carries a faint cast of its hue, that no dark tile sits on a near-white ground, and that the cells hold on their ground in both themes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const grounds = Array.from(
			canvasElement.querySelectorAll<HTMLElement>(
				'[data-slot="companion-field"]',
			),
			(avatar) => getComputedStyle(avatar).backgroundColor,
		)
		const light = grounds.slice(0, COLOURS.length)
		const dark = grounds.slice(COLOURS.length)

		await expect(grounds).toHaveLength(COLOURS.length * 2)
		for (const [index, ground] of light.entries())
			await expect(ground).not.toBe(dark[index])
	},
})

export const WithoutGround = meta.story({
	render: () => (
		<div
			aria-label="Without ground"
			className="flex items-end gap-4"
			role="group"
		>
			<DitheredFieldAvatar
				hasGround={false}
				name={COMPARED_NAME}
				size={96}
				state="thinking"
			/>
			<DitheredFieldAvatar hasGround={false} name={COMPARED_NAME} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The field with no ground, as the boot screen draws it: the square cells sit straight on the page background, with no tinted tile and no rounded corner behind or around them. Uncoloured, so the cells are the Kiroshi blue. Check in both themes that the cells read on the bare background and that nothing frames them.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = Array.from(
			canvasElement.querySelectorAll<HTMLElement>(
				'[data-slot="companion-field"]',
			),
		)

		await expect(avatars).toHaveLength(4)
		for (const avatar of avatars) {
			await expect(avatar.style.backgroundColor).toBe("")
			await expect(avatar.style.borderRadius).toBe("")
		}
	},
})
