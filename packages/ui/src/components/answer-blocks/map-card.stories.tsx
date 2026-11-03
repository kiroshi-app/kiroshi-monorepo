import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import { MapCard } from "@workspace/ui/components/answer-blocks/map-card"

const CASA_DO_RIO = {
	id: "casa-do-rio",
	name: "Casa do Rio",
	latitude: 38.7105,
	longitude: -9.1302,
}

const TIME_OUT_MARKET = {
	id: "time-out-market",
	name: "Time Out Market",
	latitude: 38.7069,
	longitude: -9.1459,
}

const meta = preview.meta({
	title: "Conversation/Markdown/MapCard",
	component: MapCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The places an answer names, drawn from their coordinates on a plain surface, with the route through them in order. The start pin wears the foreground, the destination the Space colour. Nothing is fetched to draw it; Open in Maps shows only when `link` is passed.",
			},
		},
	},
	args: {
		title: "1.9 km · 25 min walk",
		subtitle: "Alfama, Lisbon · © OpenStreetMap contributors",
		area: "Rio Tejo",
		link: "https://www.openstreetmap.org/directions?from=38.7105,-9.1302&to=38.7069,-9.1459",
		places: [CASA_DO_RIO, TIME_OUT_MARKET],
	},
	render: (args) => (
		<AgentAnswerFrame intro="From the guesthouse to the market, along the river.">
			<MapCard {...args} />
		</AgentAnswerFrame>
	),
})

const surfaceOf = (root: HTMLElement) => {
	const surface = root.querySelector(
		'[data-slot="map-card"]',
	)?.firstElementChild
	if (!surface) throw new Error("The map card draws no surface")
	return surface
}

const expectPinsInside = async (root: HTMLElement) => {
	const bounds = surfaceOf(root).getBoundingClientRect()
	for (const pin of root.querySelectorAll("li")) {
		const box = pin.getBoundingClientRect()
		await expect(box.left).toBeGreaterThanOrEqual(bounds.left)
		await expect(box.right).toBeLessThanOrEqual(bounds.right)
		await expect(box.top).toBeGreaterThanOrEqual(bounds.top)
		await expect(box.bottom).toBeLessThanOrEqual(bounds.bottom)
	}
}

export const WithRoute = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Markdown 14. Check the surface is 300 high, the route is one dotted line from the start pin to the destination pin, both pins sit inside the surface, each glyph wears its own chip colour on the dark disc, and Open in Maps carries the link.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(surfaceOf(canvasElement).getBoundingClientRect().height).toBe(
			300,
		)
		await expect(canvasElement.querySelectorAll("line")).toHaveLength(1)
		await expectPinsInside(canvasElement)
		for (const pin of canvasElement.querySelectorAll("li")) {
			const disc = pin.firstElementChild
			if (!disc) throw new Error("The pin draws no disc")
			await expect(getComputedStyle(disc).color).toBe(
				getComputedStyle(pin).backgroundColor,
			)
		}
		await expect(
			canvas.getByRole("link", { name: "Open in Maps" }),
		).toHaveAttribute("href", args.link)
	},
})

export const OnePlaceWithoutLink = meta.story({
	globals: { theme: "dark" },
	args: {
		title: "Casa do Rio",
		link: undefined,
		places: [CASA_DO_RIO],
	},
	parameters: {
		docs: {
			description: {
				story:
					"One place and no link: the pin sits at the centre in the Space colour, no route, no Open in Maps.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector("line")).toBeNull()
		await expect(canvas.queryByRole("link")).toBeNull()
		await expectPinsInside(canvasElement)
	},
})

export const InNarrowColumn = meta.story({
	args: {
		title: "1.9 km · 25 min walk along the river through Alfama and Baixa",
		subtitle:
			"Alfama, Baixa and Cais do Sodré, Lisbon · © OpenStreetMap contributors",
		places: [
			{ ...CASA_DO_RIO, name: "Casa do Rio guesthouse, Rua de São Miguel" },
			{ ...TIME_OUT_MARKET, name: "Time Out Market, Mercado da Ribeira" },
		],
	},
	render: (args) => (
		<AgentAnswerFrame intro="From the guesthouse to the market." width={320}>
			<MapCard {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column and long names. Check the pins truncate inside the surface, the footer truncates beside Open in Maps, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
		await expectPinsInside(canvasElement)
	},
})
