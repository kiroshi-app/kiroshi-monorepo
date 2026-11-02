import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	BAR_AT_NIGHT,
	BREAKFAST_TABLE,
	GARDEN_PATIO,
	LOBBY,
	ROOFTOP_POOL,
	ROOM_DOUBLE,
	ROOM_RIVER_VIEW,
	STAIRCASE,
	SUITE_BALCONY,
} from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { Gallery } from "@workspace/ui/components/answer-blocks/gallery"

const CASA_DO_RIO_PHOTOS = [
	{ src: ROOM_RIVER_VIEW, alt: "A double room facing the river" },
	{ src: ROOM_DOUBLE, alt: "The double room with its tiled floor" },
	{ src: BREAKFAST_TABLE },
	{ src: ROOFTOP_POOL, alt: "The rooftop pool" },
	{ src: LOBBY, alt: "The lobby" },
	{ src: STAIRCASE, alt: "The staircase" },
	{ src: BAR_AT_NIGHT, alt: "The bar at night" },
	{ src: GARDEN_PATIO, alt: "The garden patio" },
	{ src: SUITE_BALCONY, alt: "A suite balcony" },
]

const CAPTION = "9 photos from casadorio.pt · opens in the viewer"

const meta = preview.meta({
	title: "Conversation/Markdown/Gallery",
	component: Gallery,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"Up to five pictures in one large tile and a 2 by 2 grid, the last tile counting what is hidden as +N. Reach for it when the answer shows several pictures of the same thing; `SourcedImage` covers one. Tiles open the viewer only when `onOpen` is passed.",
			},
		},
	},
	args: { images: CASA_DO_RIO_PHOTOS, caption: CAPTION, onOpen: fn() },
	render: (args) => (
		<AgentAnswerFrame intro="Here are the rooms and the terrace, from their site.">
			<Gallery {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 15. Nine pictures, five tiles: the last tile reads +4. The third picture carries no alt text, so it takes the caption as its name. Check a tile hands its index to `onOpen`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotIn(canvasElement, "gallery-more")).toHaveTextContent("+4")
		await expect(canvas.getByText("4 more photos")).toBeInTheDocument()
		await expect(canvas.getAllByRole("img")).toHaveLength(5)
		await expect(canvas.getByRole("img", { name: CAPTION })).toBeVisible()
		const lead = getComputedStyle(
			canvas.getByRole("button", { name: "A double room facing the river" }),
		)
		await expect(lead.borderTopLeftRadius).toBe("12px")
		await expect(lead.borderTopRightRadius).toBe("4px")
		const lastTile = getComputedStyle(
			canvas.getByRole("button", { name: "The lobby 4 more photos" }),
		)
		await expect(lastTile.borderBottomRightRadius).toBe("12px")
		await expect(lastTile.borderTopLeftRadius).toBe("4px")
		await userEvent.click(
			canvas.getByRole("button", { name: "The rooftop pool" }),
		)
		await expect(args.onOpen).toHaveBeenCalledWith(3)
	},
})

export const InNarrowColumn = meta.story({
	render: (args) => (
		<AgentAnswerFrame intro="Here are the rooms." width={320}>
			<Gallery {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column. Check the five tiles shrink to fit and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
