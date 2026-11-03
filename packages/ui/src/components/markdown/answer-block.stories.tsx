import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { Markdown } from "@workspace/ui/components/markdown"

const OPTIONS = `Two ways forward, pick the one that fits.

\`\`\`options
question: How should the migration ship?
- title: One release
  text: A single downtime window of about ten minutes, nothing to keep in sync.
- title: Dual write
  text: No downtime, two weeks of writing to both tables before the switch.
\`\`\``

const INTERACTIVE = `Move the sliders, the payment follows.

\`\`\`interactive
result: amount * rate / 1200 / (1 - (1 + rate / 1200) ^ -(years * 12))
result-label: Monthly payment in euros
- name: amount
  label: Amount borrowed
  min: 10000
  max: 500000
  step: 1000
  default: 200000
- name: rate
  label: Yearly rate in percent
  min: 0.5
  max: 8
  step: 0.1
  default: 3.5
- name: years
  label: Length in years
  min: 5
  max: 30
  step: 1
  default: 20
\`\`\``

const NOT_DEFINED = `The share per extra person, past the four already paid for.

\`\`\`interactive
result: 1200 / (people - 4)
result-label: Euros per extra person
- name: people
  label: People
  min: 2
  max: 12
  step: 1
  default: 4
\`\`\``

const COLLAPSIBLE = `Two tests still fail, the full list is below.

\`\`\`collapsible
title: Full list of the 14 failing tests

- \`sync dedupes on the client id\`
- \`sync keeps the newest edit\`
- and twelve more of the same file.
\`\`\``

const CALLOUTS = `The export is ready.

> [!NOTE]
> The export keeps the archived rooms too.

> [!WARNING]
> This deletes every message of the room. This can't be undone.`

const GALLERY = `Two sofas that fit the room.

\`\`\`gallery
- image: https://images.example.org/sofa-green.jpg
  alt: Green velvet sofa, three seats
  caption: Green velvet, 1,290 euros
- image: https://images.example.org/sofa-grey.jpg
  alt: Grey linen sofa, three seats
  caption: Grey linen, 990 euros
\`\`\``

const ILLUSTRATED_LIST = `Three cities for the offsite.

\`\`\`illustrated-list
- title: Lisbon
  image: https://images.example.org/lisbon.jpg
  text: Mild winters and the cheapest flights of the three.
- title: Porto
  image: https://images.example.org/porto.jpg
  text: Smaller, quieter, two hours north by train.
\`\`\``

const SOURCED_IMAGE = `This is the waterfront the hotel faces.

![The Lisbon waterfront at dusk](https://images.example.org/lisbon-waterfront.jpg)

Source: [Visit Lisboa](https://www.visitlisboa.com/en/places/waterfront)`

const WEB_PAGE_URL = "https://www.casadorio.pt/rooms"

const WEB_PAGE_WITH_PREVIEW = `The guesthouse I found, rooms and rates on one page.

\`\`\`web-page
url: ${WEB_PAGE_URL}
title: Casa do Rio, rooms and rates
description: Eight rooms on the river, breakfast included.
image: https://images.example.org/casa-do-rio.jpg
alt: Terrace of Casa do Rio over the river
\`\`\``

const WEB_PAGE_WITHOUT_PREVIEW = `The guesthouse I found, rooms and rates on one page.

\`\`\`web-page
url: ${WEB_PAGE_URL}
title: Casa do Rio, rooms and rates
description: Eight rooms on the river, breakfast included.
\`\`\``

const VIDEO_WITH_MARKER = `The tour they sent, the terrace comes at 2:16.

\`\`\`video
url: https://media.casadorio.pt/casa-do-rio-tour.mp4
title: casa-do-rio-tour.mp4
duration: 4:32
source: casadorio.pt
poster: https://images.example.org/casa-do-rio-tour.jpg
marker: 2:16
marker-label: Terrace
\`\`\``

const VIDEO_WITHOUT_POSTER = `The tour they sent.

\`\`\`video
url: https://media.casadorio.pt/casa-do-rio-tour.mp4
title: casa-do-rio-tour.mp4
duration: 4:32
\`\`\``

const MAP_LINK =
	"https://www.openstreetmap.org/directions?from=38.7105,-9.1302&to=38.7069,-9.1459"

const MAP_WITH_ROUTE = `From the guesthouse to the market, along the river.

\`\`\`map
title: 1.9 km · 25 min walk
subtitle: Alfama, Lisbon · © OpenStreetMap contributors
area: Rio Tejo
link: ${MAP_LINK}
- name: Casa do Rio
  lat: 38.7105
  lon: -9.1302
- name: Time Out Market
  lat: 38.7069
  lon: -9.1459
\`\`\``

const MAP_WITH_ONE_PLACE = `The guesthouse sits on the river.

\`\`\`map
title: Casa do Rio
subtitle: Alfama, Lisbon · © OpenStreetMap contributors
area: Rio Tejo
- name: Casa do Rio
  lat: 38.7105
  lon: -9.1302
\`\`\``

const BROKEN = `Two ways forward.

\`\`\`options
- title: One release
  text: Ten minutes of downtime.
  price: 0 euros
\`\`\``

const meta = preview.meta({
	title: "Conversation/Markdown/AnswerBlocks",
	component: Markdown,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The rich blocks of `docs/chat/rich-answer-blocks.md` as an agent answer writes them, routed by `Markdown` to their components: a fenced block by its label, the callouts and the sourced image from their GFM shape. A block that breaks its syntax is drawn as its source in a plain fence, never partly. While `isWriting` is on and a block's fence is still open, its pending frame holds the place. `answerActions` carries what a block does to the conversation: the option picked, the slider values used, the image opened, the web page opened.",
			},
		},
	},
	args: {
		children: OPTIONS,
		answerActions: {
			agentName: "Atlas",
			onPickOption: fn(),
			onUseValues: fn(),
			onOpenImage: fn(),
			onOpenWebPage: fn(),
		},
	},
	decorators: [(Story) => <div className="w-170 max-w-full">{Story()}</div>],
})

export const OptionsCardInAnswer = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An `options` block: the question heads the card, each option folds its text. Check that opening an option hands its title to `onPickOption`, and that nothing else is sent.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Dual write" }))
		await expect(args.answerActions?.onPickOption).toHaveBeenCalledWith(
			"Dual write",
		)
	},
})

export const InteractiveViewInAnswer = meta.story({
	args: { children: INTERACTIVE },
	parameters: {
		docs: {
			description: {
				story:
					"An `interactive` block: one slider per item, the result computed by the block's own parser and rounded to two decimals at most. Check the default payment reads 1,159.92, that a slider moves it, and that Use these values hands the values and the result to `onUseValues`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const total = slotIn(canvasElement, "interactive-view-total")
		await expect(total).toHaveTextContent("1,159.92")

		canvas.getByRole("slider", { name: "Length in years" }).focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(total).not.toHaveTextContent("1,159.92"))

		await userEvent.click(
			canvas.getByRole("button", { name: "Use these values" }),
		)
		await expect(args.answerActions?.onUseValues).toHaveBeenCalledWith(
			expect.stringContaining("Length in years: 21"),
		)
	},
})

export const InteractiveResultNotDefined = meta.story({
	args: { children: NOT_DEFINED },
	parameters: {
		docs: {
			description: {
				story:
					"A valid formula with no finite value at the current sliders, here a division by zero at four people. Check the sliders stay live, the result reads Not defined for these values, and moving a slider brings a number back.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const total = slotIn(canvasElement, "interactive-view-total")
		await expect(total).toHaveTextContent("Not defined for these values")

		canvas.getByRole("slider", { name: "People" }).focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(total).toHaveTextContent("1,200"))
	},
})

export const CollapsibleInAnswer = meta.story({
	args: { children: COLLAPSIBLE },
	parameters: {
		docs: {
			description: {
				story:
					"A `collapsible` block: its title shown closed, the Markdown after the first blank line inside. Check a click on the title opens the list.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const head = canvas.getByRole("button", {
			name: "Full list of the 14 failing tests",
		})
		await userEvent.click(head)
		await expect(head).toHaveAttribute("aria-expanded", "true")
	},
})

export const CalloutsInAnswer = meta.story({
	args: { children: CALLOUTS },
	parameters: {
		docs: {
			description: {
				story:
					"A `> [!NOTE]` and a `> [!WARNING]` quote drawn as their callouts, the marker line gone. Check the note and the warning keep their own tone.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [note, warning] = canvas.getAllByRole("note")
		await expect(note).toHaveAttribute("data-tone", "note")
		await expect(warning).toHaveAttribute("data-tone", "warning")
		await expect(canvas.queryByText(/\[!NOTE\]/)).toBeNull()
	},
})

export const PendingWhileWriting = meta.story({
	args: {
		children: INTERACTIVE.replace(/\n```$/, ""),
		isWriting: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Work 6: the agent is still writing the block, its fence not closed yet, so the pending frame holds its place. The block replaces it once the fence closes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "rich-block-pending")).toHaveAttribute(
			"aria-busy",
			"true",
		)
	},
})

export const BrokenBlockAsSource = meta.story({
	args: { children: BROKEN },
	parameters: {
		docs: {
			description: {
				story:
					"An `options` block with a field it does not take: it is drawn as its source in a plain fence, nothing of the card drawn.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "markdown-fence")).toHaveTextContent(
			"price: 0 euros",
		)
		await expect(
			canvasElement.querySelector('[data-slot="options-card"]'),
		).toBeNull()
	},
})

export const GalleryInAnswer = meta.story({
	tags: ["test-only"],
	args: { children: GALLERY },
	parameters: {
		docs: {
			description: {
				story:
					"A `gallery` block. Check a tile hands every image of the gallery and its index to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Grey linen sofa, three seats" }),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ detail: "Grey linen, 990 euros" }),
			]),
			1,
		)
	},
})

export const WebPageWithPreviewInAnswer = meta.story({
	args: { children: WEB_PAGE_WITH_PREVIEW },
	parameters: {
		docs: {
			description: {
				story:
					"A `web-page` block with `image` and `alt`: the card shows the preview, the host without `www.` and the title, never the description. Check Open as page hands the page URL to `onOpenWebPage`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotIn(canvasElement, "web-page-card")).toHaveTextContent(
			"casadorio.pt",
		)
		await expect(
			canvas.getByRole("img", {
				name: "Terrace of Casa do Rio over the river",
			}),
		).toBeInTheDocument()
		await expect(
			canvasElement.querySelector('[data-slot="markdown-fence"]'),
		).toBeNull()

		await userEvent.click(canvas.getByRole("button", { name: "Open as page" }))
		await expect(args.answerActions?.onOpenWebPage).toHaveBeenCalledWith(
			WEB_PAGE_URL,
		)
	},
})

export const WebPageWithoutPreviewInAnswer = meta.story({
	args: { children: WEB_PAGE_WITHOUT_PREVIEW },
	parameters: {
		docs: {
			description: {
				story:
					"A `web-page` block without `image`: the card draws no preview. Check Open as page hands the page URL to `onOpenWebPage`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotIn(canvasElement, "web-page-card")).toHaveTextContent(
			"Casa do Rio, rooms and rates",
		)
		await expect(canvasElement.querySelector("img")).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="markdown-fence"]'),
		).toBeNull()

		await userEvent.click(canvas.getByRole("button", { name: "Open as page" }))
		await expect(args.answerActions?.onOpenWebPage).toHaveBeenCalledWith(
			WEB_PAGE_URL,
		)
	},
})

const expectInstantColours = async (element: HTMLElement) => {
	await expect(getComputedStyle(element).transitionDuration).toBe("0s")
}

const expectInside = async (inner: Element, outer: Element) => {
	const box = inner.getBoundingClientRect()
	const bounds = outer.getBoundingClientRect()
	await expect(box.left).toBeGreaterThanOrEqual(bounds.left)
	await expect(box.right).toBeLessThanOrEqual(bounds.right)
	await expect(box.top).toBeGreaterThanOrEqual(bounds.top)
	await expect(box.bottom).toBeLessThanOrEqual(bounds.bottom)
}

export const VideoPausedWithMarkerInAnswer = meta.story({
	globals: { theme: "dark" },
	args: { children: VIDEO_WITH_MARKER },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Markdown 13. A `video` block with a poster and a marker: the player is paused at 0:00, the Space coloured marker sits at 2:16 of 4:32, the caption joins title, source and marker label. Check the marker seeks to its time.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(
			canvasElement.querySelector('[data-slot="markdown-fence"]'),
		).toBeNull()
		await expect(slotIn(canvasElement, "video-player")).toHaveTextContent(
			"casa-do-rio-tour.mp4 · casadorio.pt · Terrace",
		)
		const play = canvas.getByRole("button", {
			name: "Play casa-do-rio-tour.mp4",
		})
		const marker = canvas.getByRole("button", { name: "Go to 2:16" })
		await expectInstantColours(play)
		await expectInstantColours(marker)

		await userEvent.click(marker)
		const video = canvasElement.querySelector("video")
		await expect(video?.currentTime).toBe(136)
		await expect(canvas.getByText("2:16")).toBeInTheDocument()
	},
})

export const VideoWithoutPosterOrMarkerInAnswer = meta.story({
	globals: { theme: "dark" },
	args: { children: VIDEO_WITHOUT_POSTER },
	parameters: {
		docs: {
			description: {
				story:
					"A `video` block with only its address, title and duration: the player shows the slate, the track carries no marker, the caption is the title alone.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector("video")).not.toHaveAttribute(
			"poster",
		)
		await expect(canvas.queryByRole("button", { name: /^Go to/ })).toBeNull()
		await expect(slotIn(canvasElement, "video-player")).toHaveTextContent(
			"0:004:32casa-do-rio-tour.mp4",
		)
	},
})

export const MapWithRouteInAnswer = meta.story({
	globals: { theme: "dark" },
	args: { children: MAP_WITH_ROUTE },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Markdown 14. A `map` block with two places and a link: the start pin on the foreground, the destination pin in the Space colour, the dotted route between them, Open in Maps on the footer. Check every pin stays inside the map surface and nothing is fetched.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = slotIn(canvasElement, "map-card")
		const surface = card.firstElementChild
		if (!surface) throw new Error("The map card draws no surface")
		const pins = canvas.getAllByRole("listitem")
		await expect(pins.map((pin) => pin.textContent)).toEqual([
			"Casa do Rio",
			"Time Out Market",
		])
		for (const pin of pins) await expectInside(pin, surface)
		await expect(card.querySelectorAll("line")).toHaveLength(1)
		await expect(card.querySelector("img, iframe")).toBeNull()

		const open = canvas.getByRole("link", { name: "Open in Maps" })
		await expect(open).toHaveAttribute("href", MAP_LINK)
		await expectInstantColours(open)
	},
})

export const MapWithOnePlaceInAnswer = meta.story({
	globals: { theme: "dark" },
	args: { children: MAP_WITH_ONE_PLACE },
	parameters: {
		docs: {
			description: {
				story:
					"A `map` block with one place and no link: the pin sits at the centre in the Space colour, no route, no Open in Maps.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const card = slotIn(canvasElement, "map-card")
		await expect(canvas.getAllByRole("listitem")).toHaveLength(1)
		await expect(card.querySelector("line")).toBeNull()
		await expect(canvas.queryByRole("link")).toBeNull()
	},
})

export const IllustratedListInAnswer = meta.story({
	tags: ["test-only"],
	args: { children: ILLUSTRATED_LIST },
	parameters: {
		docs: {
			description: {
				story:
					"An `illustrated-list` block: one row per item, the title naming its picture.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: "Porto" })).toBeVisible()
	},
})

export const SourcedImageInAnswer = meta.story({
	tags: ["test-only"],
	args: { children: SOURCED_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"A GFM image alone on its line followed by its `Source:` line, drawn as one sourced image naming the source. Check Enter on it hands that image to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(slotIn(canvasElement, "sourced-image")).toHaveTextContent(
			"Visit Lisboa",
		)
		await expect(canvas.queryByText(/^Source:/)).toBeNull()

		canvas
			.getByRole("button", { name: "The Lisbon waterfront at dusk" })
			.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					name: "The Lisbon waterfront at dusk",
					detail: "Visit Lisboa",
				}),
			],
			0,
		)
	},
})

const PLAIN_IMAGE = `The sofa I mean: ![Green velvet sofa](https://images.example.org/sofa-green.jpg)`

export const PlainImageInAnswer = meta.story({
	tags: ["test-only"],
	args: { children: PLAIN_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"A plain Markdown image in an answer. Check a click hands that image alone to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Green velvet sofa" }),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					name: "Green velvet sofa",
					src: "https://images.example.org/sofa-green.jpg",
				}),
			],
			0,
		)
	},
})

const boxOf = (element: Element) => {
	const { width, height } = element.getBoundingClientRect()
	return { width, height }
}

export const ImagesLookTheSameWhenOpenable = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<>
			<div data-testid="openable">
				<Markdown answerActions={args.answerActions}>
					{`${SOURCED_IMAGE}\n\n${PLAIN_IMAGE}`}
				</Markdown>
			</div>
			<div data-testid="static">
				<Markdown>{`${SOURCED_IMAGE}\n\n${PLAIN_IMAGE}`}</Markdown>
			</div>
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same answer with and without answer actions. Check the button around each image changes neither the box of the sourced image, nor the box of the plain image, nor the height of the answer.",
			},
		},
	},
	play: async ({ canvas }) => {
		const openable = canvas.getByTestId("openable")
		const plain = canvas.getByTestId("static")
		await expect(openable.querySelectorAll("button")).toHaveLength(2)
		await expect(plain.querySelector("button")).toBeNull()

		for (const selector of ['[data-slot="sourced-image"]', "p img"]) {
			const shown = openable.querySelector(selector)
			const kept = plain.querySelector(selector)
			if (!shown || !kept) throw new Error(`Nothing here draws ${selector}`)
			await expect(boxOf(shown)).toEqual(boxOf(kept))
		}
		await expect(boxOf(openable).height).toBe(boxOf(plain).height)
	},
})
