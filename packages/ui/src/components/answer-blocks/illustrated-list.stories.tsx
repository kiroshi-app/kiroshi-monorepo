import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import {
	SANTA_LUZIA,
	SE_CATHEDRAL,
	TIME_OUT_MARKET,
} from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	IllustratedList,
	type IllustratedListItem,
} from "@workspace/ui/components/answer-blocks/illustrated-list"

const FIRST_AFTERNOON: IllustratedListItem[] = [
	{
		id: "santa-luzia",
		title: "Miradouro de Santa Luzia",
		image: { src: SANTA_LUZIA },
		badge: "Best at sunset",
		description: (
			<>
				A tiled terrace over the <strong>Alfama</strong> rooftops and the river.
			</>
		),
		meta: "6 min on foot · Alfama",
	},
	{
		id: "se",
		title: "Sé de Lisboa",
		image: { src: SE_CATHEDRAL, alt: "The twin towers of the cathedral" },
		description: (
			<>
				The oldest church in the city, <strong>free</strong> before noon.
			</>
		),
		meta: "9 min on foot · Sé",
	},
	{
		id: "time-out-market",
		title: "Time Out Market",
		image: { src: TIME_OUT_MARKET, alt: "Stalls under the market roof" },
		description: "Forty food stalls under one roof, busiest after seven.",
		meta: "18 min by tram · Cais do Sodré",
	},
]

const UNBROKEN_TITLE: IllustratedListItem[] = [
	{
		...FIRST_AFTERNOON[0],
		title: "MiradourodeSantaLuziaePortasdoSolsobreAlfama",
		meta: "6 min on foot · Alfama·Castelo·Graça·Mouraria",
	},
	...FIRST_AFTERNOON.slice(1),
]

const meta = preview.meta({
	title: "Conversation/Markdown/IllustratedList",
	component: IllustratedList,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A numbered list of places or things, each with a thumbnail, an optional Space-colour badge, a description that may carry bold, and a meta line. Reach for it when an answer recommends a handful of picks the reader compares by picture; plain markdown lists cover everything without an image.",
			},
		},
	},
	args: { items: FIRST_AFTERNOON },
	render: (args) => (
		<AgentAnswerFrame intro="Three easy stops for your first afternoon, all walkable from the flat.">
			<IllustratedList {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1. Check the rows against the artboard side by side: 96 by 72 thumbnails, hairline dividers, the badge on the first row only. The first thumbnail carries no alt text, so it stays decorative instead of reading the title twice.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("listitem")).toHaveLength(3)
		await expect(canvas.getAllByRole("img")).toHaveLength(2)
		await expect(
			canvas.getByRole("presentation", { hidden: true }),
		).toHaveAttribute("alt", "")
		await expect(
			canvas.getByRole("img", { name: "The twin towers of the cathedral" }),
		).toBeVisible()
		await expect(canvas.getByText("Best at sunset")).toBeVisible()
	},
})

export const InNarrowColumn = meta.story({
	args: { items: UNBROKEN_TITLE },
	render: (args) => (
		<AgentAnswerFrame
			intro="Three easy stops for your first afternoon."
			width={320}
		>
			<IllustratedList {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with an unbroken title and meta line. Check that both wrap inside the card and that nothing scrolls sideways; pick `InAgentAnswer` for the artboard width.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
