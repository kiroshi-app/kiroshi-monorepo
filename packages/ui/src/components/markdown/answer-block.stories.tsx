import { expect, fn, type userEvent, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	BAR_AT_NIGHT,
	CASA_DO_RIO_FAVICON,
	CASA_DO_RIO_TERRACE,
	SANTA_LUZIA,
	SE_CATHEDRAL,
} from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"

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

const GALLERY_PARTLY_CAPTIONED = `Three seats that fit the room.

\`\`\`gallery
- image: https://images.example.org/sofa-green.jpg
  alt: Green velvet sofa, three seats
  caption: Green velvet, 1,290 euros
- image: https://images.example.org/armchair-oak.jpg
  alt: Oak armchair with a cane back
- image: https://images.example.org/sofa-grey.jpg
  alt: Grey linen sofa, three seats
  caption: Grey linen, 990 euros
\`\`\``

const GALLERY_WITHOUT_CAPTIONS = `Two sofas that fit the room.

\`\`\`gallery
- image: https://images.example.org/sofa-green.jpg
  alt: Green velvet sofa, three seats
- image: https://images.example.org/sofa-grey.jpg
  alt: Grey linen sofa, three seats
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

export const GalleryCaptionsUnderGrid = meta.story({
	tags: ["test-only"],
	args: { children: GALLERY_PARTLY_CAPTIONED },
	parameters: {
		docs: {
			description: {
				story:
					"A `gallery` block whose middle image has no caption. Check one muted line under the grid joins the captions there are in image order, and no tile draws a caption.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("figcaption")).toHaveTextContent(
			/^Green velvet, 1,290 euros · Grey linen, 990 euros$/,
		)
		await expect(canvasElement.querySelector("figcaption")).toHaveClass(
			"text-muted-foreground",
		)
		await expect(slotsIn(canvasElement, "gallery-image-caption")).toHaveLength(
			0,
		)
	},
})

export const GalleryWithoutCaptions = meta.story({
	tags: ["test-only"],
	args: { children: GALLERY_WITHOUT_CAPTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A `gallery` block without any caption. Check no line runs under the grid.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "gallery")).toBeVisible()
		await expect(canvasElement.querySelector("figcaption")).toBeNull()
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

const IMAGE_MENU_ENTRIES = ["Save to Library", "Copy image", "Open in viewer"]

const IMAGE_MENU_ACTIONS: MarkdownAnswerActions = {
	agentName: "Atlas",
	onPickOption: fn(),
	onUseValues: fn(),
	onOpenImage: fn(),
	onOpenWebPage: fn(),
	imageMenu: { onSaveToLibrary: fn(), onCopyImage: fn() },
}

const openImageMenu = async (
	user: ReturnType<typeof userEvent.setup>,
	image: Element,
	name: string,
) => {
	await user.pointer({ keys: "[MouseRight]", target: image })
	const menu = await within(document.body).findByRole("menu", {
		name: `Actions for ${name}`,
	})
	await expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((entry) => entry.textContent),
	).toEqual(IMAGE_MENU_ENTRIES)
	return within(menu)
}

export const ImageMenuOnGallery = meta.story({
	tags: ["test-only"],
	args: { children: GALLERY, answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A `gallery` block right-clicked on its second tile, the answer carrying `imageMenu`. Check the `ImageMenu` lists Save to Library, Copy image, then Open in viewer, that Copy image hands the tile's viewer image to `imageMenu.onCopyImage`, and that Open in viewer hands every image of the gallery and the tile's index to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const tile = canvas.getByRole("button", {
			name: "Grey linen sofa, three seats",
		})
		const greyLinen = {
			id: "1",
			name: "Grey linen sofa, three seats",
			src: "https://images.example.org/sofa-grey.jpg",
			detail: "Grey linen, 990 euros",
		}

		let menu = await openImageMenu(
			userEvent,
			tile,
			"Grey linen sofa, three seats",
		)
		await userEvent.click(menu.getByRole("menuitem", { name: "Copy image" }))
		await expect(
			args.answerActions?.imageMenu?.onCopyImage,
		).toHaveBeenCalledWith(greyLinen)
		await expect(args.answerActions?.onOpenImage).not.toHaveBeenCalled()

		menu = await openImageMenu(userEvent, tile, "Grey linen sofa, three seats")
		await userEvent.click(
			menu.getByRole("menuitem", { name: "Open in viewer" }),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			[expect.objectContaining({ id: "0" }), greyLinen],
			1,
		)
	},
})

export const ImageMenuOnPlainImage = meta.story({
	tags: ["test-only"],
	args: { children: PLAIN_IMAGE, answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A plain Markdown image right-clicked, the answer carrying `imageMenu`. Check the `ImageMenu` opens on it and Save to Library hands that image to `imageMenu.onSaveToLibrary`, with the id, name, address and detail the viewer gets for it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const menu = await openImageMenu(
			userEvent,
			canvas.getByRole("button", { name: "Green velvet sofa" }),
			"Green velvet sofa",
		)
		await userEvent.click(
			menu.getByRole("menuitem", { name: "Save to Library" }),
		)
		await expect(
			args.answerActions?.imageMenu?.onSaveToLibrary,
		).toHaveBeenCalledWith({
			id: "https://images.example.org/sofa-green.jpg",
			name: "Green velvet sofa",
			src: "https://images.example.org/sofa-green.jpg",
			detail: "",
		})
	},
})

export const ImageMenuOnSourcedImage = meta.story({
	tags: ["test-only"],
	args: { children: SOURCED_IMAGE, answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A sourced image right-clicked, the answer carrying `imageMenu`. Check the `ImageMenu` opens on the picture, that Copy image hands it to `imageMenu.onCopyImage` with the source as its detail, and that Open in viewer hands it alone to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const picture = canvas.getByRole("button", {
			name: "The Lisbon waterfront at dusk",
		})
		const waterfront = {
			id: "https://images.example.org/lisbon-waterfront.jpg",
			name: "The Lisbon waterfront at dusk",
			src: "https://images.example.org/lisbon-waterfront.jpg",
			detail: "Visit Lisboa",
		}

		let menu = await openImageMenu(
			userEvent,
			picture,
			"The Lisbon waterfront at dusk",
		)
		await userEvent.click(menu.getByRole("menuitem", { name: "Copy image" }))
		await expect(
			args.answerActions?.imageMenu?.onCopyImage,
		).toHaveBeenCalledWith(waterfront)

		menu = await openImageMenu(
			userEvent,
			picture,
			"The Lisbon waterfront at dusk",
		)
		await userEvent.click(
			menu.getByRole("menuitem", { name: "Open in viewer" }),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			[waterfront],
			0,
		)
	},
})

export const ImageMenuOnIllustratedList = meta.story({
	tags: ["test-only"],
	args: { children: ILLUSTRATED_LIST, answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"An `illustrated-list` block right-clicked on its second picture, the answer carrying `imageMenu`. Check the `ImageMenu` opens on that picture, that Save to Library hands it to `imageMenu.onSaveToLibrary`, and that Open in viewer hands every picture of the list and its index to `onOpenImage`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const picture = canvas.getByRole("img", { name: "Porto" })
		const porto = {
			id: "1",
			name: "Porto",
			src: "https://images.example.org/porto.jpg",
			detail: "",
		}

		let menu = await openImageMenu(userEvent, picture, "Porto")
		await userEvent.click(
			menu.getByRole("menuitem", { name: "Save to Library" }),
		)
		await expect(
			args.answerActions?.imageMenu?.onSaveToLibrary,
		).toHaveBeenCalledWith(porto)

		menu = await openImageMenu(userEvent, picture, "Porto")
		await userEvent.click(
			menu.getByRole("menuitem", { name: "Open in viewer" }),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledWith(
			[expect.objectContaining({ name: "Lisbon" }), porto],
			1,
		)
	},
})

export const ImageMenuOnWebPagePreview = meta.story({
	tags: ["test-only"],
	args: { children: WEB_PAGE_WITH_PREVIEW, answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A `web-page` block right-clicked on its preview, the answer carrying `imageMenu`. Check the `ImageMenu` opens on the preview, that Copy image hands it to `imageMenu.onCopyImage` with the host as its detail, and that the menu leaves `onOpenWebPage` alone.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const menu = await openImageMenu(
			userEvent,
			canvas.getByRole("img", {
				name: "Terrace of Casa do Rio over the river",
			}),
			"Terrace of Casa do Rio over the river",
		)
		await userEvent.click(menu.getByRole("menuitem", { name: "Copy image" }))
		await expect(
			args.answerActions?.imageMenu?.onCopyImage,
		).toHaveBeenCalledWith({
			id: "https://images.example.org/casa-do-rio.jpg",
			name: "Terrace of Casa do Rio over the river",
			src: "https://images.example.org/casa-do-rio.jpg",
			detail: "casadorio.pt",
		})
		await expect(args.answerActions?.onOpenWebPage).not.toHaveBeenCalled()
	},
})

const savingActionsFor = (savingSrc: string): MarkdownAnswerActions => ({
	...IMAGE_MENU_ACTIONS,
	isSavingImage: (src) => src === savingSrc,
})

const expectSaveDisabled = async (menu: ReturnType<typeof within>) => {
	await expect(
		menu.getByRole("menuitem", { name: "Save to Library" }),
	).toHaveAttribute("aria-disabled", "true")
	await expect(
		menu.getByRole("menuitem", { name: "Copy image" }),
	).not.toHaveAttribute("aria-disabled")
	await expect(
		menu.getByRole("menuitem", { name: "Open in viewer" }),
	).not.toHaveAttribute("aria-disabled")
}

const expectSaveEnabled = async (menu: ReturnType<typeof within>) =>
	expect(
		menu.getByRole("menuitem", { name: "Save to Library" }),
	).not.toHaveAttribute("aria-disabled")

const closeImageMenu = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.keyboard("{Escape}")
	await waitFor(() =>
		expect(within(document.body).queryByRole("menu")).toBe(null),
	)
}

export const ImageMenuSavingOnPlainImage = meta.story({
	tags: ["test-only"],
	args: {
		children: PLAIN_IMAGE,
		answerActions: savingActionsFor(
			"https://images.example.org/sofa-green.jpg",
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A plain Markdown image right-clicked while `isSavingImage` returns true for its address. Check Save to Library is disabled while Copy image and Open in viewer still answer.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expectSaveDisabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("button", { name: "Green velvet sofa" }),
				"Green velvet sofa",
			),
		)
	},
})

export const ImageMenuSavingOnGallery = meta.story({
	tags: ["test-only"],
	args: {
		children: GALLERY,
		answerActions: savingActionsFor("https://images.example.org/sofa-grey.jpg"),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A `gallery` block while `isSavingImage` returns true for its second image. Check Save to Library is disabled on that tile only, and stays enabled on the first.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expectSaveDisabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("button", { name: "Grey linen sofa, three seats" }),
				"Grey linen sofa, three seats",
			),
		)
		await closeImageMenu(userEvent)
		await expectSaveEnabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("button", { name: "Green velvet sofa, three seats" }),
				"Green velvet sofa, three seats",
			),
		)
	},
})

export const ImageMenuSavingOnIllustratedList = meta.story({
	tags: ["test-only"],
	args: {
		children: ILLUSTRATED_LIST,
		answerActions: savingActionsFor("https://images.example.org/porto.jpg"),
	},
	parameters: {
		docs: {
			description: {
				story:
					"An `illustrated-list` block while `isSavingImage` returns true for its second picture. Check Save to Library is disabled on that picture only, and stays enabled on the first.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expectSaveDisabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("img", { name: "Porto" }),
				"Porto",
			),
		)
		await closeImageMenu(userEvent)
		await expectSaveEnabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("img", { name: "Lisbon" }),
				"Lisbon",
			),
		)
	},
})

export const ImageMenuSavingOnWebPagePreview = meta.story({
	tags: ["test-only"],
	args: {
		children: WEB_PAGE_WITH_PREVIEW,
		answerActions: savingActionsFor(
			"https://images.example.org/casa-do-rio.jpg",
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A `web-page` block while `isSavingImage` returns true for its preview. Check Save to Library is disabled while Copy image and Open in viewer still answer.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expectSaveDisabled(
			await openImageMenu(
				userEvent,
				canvas.getByRole("img", {
					name: "Terrace of Casa do Rio over the river",
				}),
				"Terrace of Casa do Rio over the river",
			),
		)
	},
})

const pressContextMenuKey = (element: Element) => {
	const { left, bottom } = element.getBoundingClientRect()
	element.dispatchEvent(
		new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			clientX: left,
			clientY: bottom,
		}),
	)
}

const expectKeyboardImageMenu = async (
	user: ReturnType<typeof userEvent.setup>,
	picture: HTMLElement,
	press: () => Promise<void>,
) => {
	await expect(picture).toHaveFocus()
	await press()
	const menu = await within(document.body).findByRole("menu", {
		name: `Actions for ${picture.getAttribute("aria-label")}`,
	})
	await expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((entry) => entry.textContent),
	).toEqual(IMAGE_MENU_ENTRIES)
	await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
	await user.keyboard("{Escape}")
	await waitFor(() => expect(picture).toHaveFocus())
}

const expectFocusRingFollowing = async (
	picture: HTMLElement,
	rounded: Element,
) => {
	await expect(picture).toHaveAttribute("aria-haspopup", "menu")
	await expect(picture.matches(":focus-visible")).toBe(true)
	await expect(getComputedStyle(picture).outlineStyle).not.toBe("none")
	await expect(getComputedStyle(picture).borderTopLeftRadius).toBe(
		getComputedStyle(rounded).borderTopLeftRadius,
	)
}

const pickFromKeyboard = async (
	user: ReturnType<typeof userEvent.setup>,
	picture: HTMLElement,
	entry: string,
) => {
	await user.keyboard("{Enter}")
	const menu = await within(document.body).findByRole("menu")
	const item = within(menu).getByRole("menuitem", { name: entry })
	await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true))
	while (document.activeElement !== item) await user.keyboard("{ArrowDown}")
	await user.keyboard("{Enter}")
	await waitFor(() => expect(picture).toHaveFocus())
}

export const ImageMenuFromKeyboardOnIllustratedList = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<>
			<div data-testid="with-menu">
				<Markdown answerActions={args.answerActions}>
					{ILLUSTRATED_LIST}
				</Markdown>
			</div>
			<div data-testid="without-menu">
				<Markdown>{ILLUSTRATED_LIST}</Markdown>
			</div>
		</>
	),
	args: { answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"An `illustrated-list` block reached from the keyboard, the answer carrying `imageMenu`, beside the same list without it. Check each picture is one tab stop named by the image and announced as opening a menu, with a focus ring at the picture's radius, that the context-menu key, Shift+F10, Enter and Space open the `ImageMenu` and Escape brings focus back, that Save to Library hands the picture to `imageMenu.onSaveToLibrary`, and that the list without `imageMenu` draws its pictures out of the tab order, boxed as before.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const withMenu = within(canvas.getByTestId("with-menu"))
		const withoutMenu = canvas.getByTestId("without-menu")

		await userEvent.tab()
		await expect(withMenu.getByRole("button", { name: "Lisbon" })).toHaveFocus()
		await userEvent.tab()
		const picture = withMenu.getByRole("button", { name: "Porto" })
		const image = withMenu.getByRole("img", { name: "Porto" })
		await expectFocusRingFollowing(picture, image)

		await expectKeyboardImageMenu(userEvent, picture, async () =>
			pressContextMenuKey(picture),
		)
		await expectKeyboardImageMenu(userEvent, picture, () =>
			userEvent.keyboard("{Enter}"),
		)
		await expectKeyboardImageMenu(userEvent, picture, () =>
			userEvent.keyboard(" "),
		)
		await pickFromKeyboard(userEvent, picture, "Save to Library")
		await expect(
			args.answerActions?.imageMenu?.onSaveToLibrary,
		).toHaveBeenCalledWith({
			id: "1",
			name: "Porto",
			src: "https://images.example.org/porto.jpg",
			detail: "",
		})

		await expect(withoutMenu.querySelector("button")).toBeNull()
		await expect(withoutMenu.querySelector("[tabindex]")).toBeNull()
		const kept = within(withoutMenu).getByRole("img", { name: "Porto" })
		await expect(boxOf(kept)).toEqual(boxOf(image))
	},
})

export const ImageMenuFromKeyboardOnWebPagePreview = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<>
			<div data-testid="with-menu">
				<Markdown answerActions={args.answerActions}>
					{WEB_PAGE_WITH_PREVIEW}
				</Markdown>
			</div>
			<div data-testid="without-menu">
				<Markdown
					answerActions={{ ...IMAGE_MENU_ACTIONS, imageMenu: undefined }}
				>
					{WEB_PAGE_WITH_PREVIEW}
				</Markdown>
			</div>
		</>
	),
	args: { answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A `web-page` block reached from the keyboard, the answer carrying `imageMenu`, beside the same card without it. Check the preview is one tab stop named by the image and announced as opening a menu, with a focus ring at the card's radius, that the context-menu key, Enter and Space open the `ImageMenu` and Escape brings focus back, that Copy image hands the preview to `imageMenu.onCopyImage` and leaves `onOpenWebPage` alone, and that the card without `imageMenu` keeps its preview out of the tab order, boxed as before.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const withMenu = within(canvas.getByTestId("with-menu"))
		const withoutMenu = within(canvas.getByTestId("without-menu"))
		const name = "Terrace of Casa do Rio over the river"

		await userEvent.tab()
		const picture = withMenu.getByRole("button", { name })
		const card = withMenu.getByRole("article")
		await expectFocusRingFollowing(picture, card)

		await expectKeyboardImageMenu(userEvent, picture, async () =>
			pressContextMenuKey(picture),
		)
		await expectKeyboardImageMenu(userEvent, picture, () =>
			userEvent.keyboard("{Enter}"),
		)
		await expectKeyboardImageMenu(userEvent, picture, () =>
			userEvent.keyboard(" "),
		)
		await pickFromKeyboard(userEvent, picture, "Copy image")
		await expect(
			args.answerActions?.imageMenu?.onCopyImage,
		).toHaveBeenCalledWith({
			id: "https://images.example.org/casa-do-rio.jpg",
			name,
			src: "https://images.example.org/casa-do-rio.jpg",
			detail: "casadorio.pt",
		})
		await expect(args.answerActions?.onOpenWebPage).not.toHaveBeenCalled()

		await expect(withoutMenu.queryByRole("button", { name })).toBeNull()
		await expect(boxOf(withoutMenu.getByRole("img", { name }))).toEqual(
			boxOf(withMenu.getByRole("img", { name })),
		)
	},
})

const LINKED_IMAGE =
	"The one I mean: [![Green velvet sofa](https://images.example.org/sofa-green.jpg)](https://shop.example.org/sofa-green)"

const defaultPreventedOf = (eventName: string) => {
	const prevented: boolean[] = []
	const record = (event: Event) => {
		prevented.push(event.defaultPrevented)
		event.preventDefault()
	}
	window.addEventListener(eventName, record)
	return {
		prevented,
		stop: () => window.removeEventListener(eventName, record),
	}
}

export const ImageMenuOnLinkedImage = meta.story({
	tags: ["test-only"],
	render: (args) => (
		<>
			<div data-testid="with-menu">
				<Markdown answerActions={args.answerActions}>{LINKED_IMAGE}</Markdown>
			</div>
			<div data-testid="without-menu">
				<Markdown
					answerActions={{ ...IMAGE_MENU_ACTIONS, imageMenu: undefined }}
				>
					{LINKED_IMAGE}
				</Markdown>
			</div>
		</>
	),
	args: { answerActions: IMAGE_MENU_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"An image inside a Markdown link, the answer carrying `imageMenu`, beside the same answer without it. Check the link stays the image's only focusable element, that a right-click opens the `ImageMenu` and Copy image hands the image to `imageMenu.onCopyImage`, that a left-click still follows the link, and that without `imageMenu` a right-click leaves the platform menu.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const withMenu = canvas.getByTestId("with-menu")
		const withoutMenu = canvas.getByTestId("without-menu")
		const image = within(withMenu).getByRole("img", {
			name: "Green velvet sofa",
		})
		const link = within(withMenu).getByRole("link")

		await expect(link).toContainElement(image)
		await expect(
			withMenu.querySelectorAll("a, button, [tabindex]"),
		).toHaveLength(1)

		const menu = await openImageMenu(userEvent, image, "Green velvet sofa")
		await userEvent.click(menu.getByRole("menuitem", { name: "Copy image" }))
		await expect(
			args.answerActions?.imageMenu?.onCopyImage,
		).toHaveBeenCalledWith({
			id: "https://images.example.org/sofa-green.jpg",
			name: "Green velvet sofa",
			src: "https://images.example.org/sofa-green.jpg",
			detail: "",
		})

		const clicks = defaultPreventedOf("click")
		await userEvent.click(image)
		clicks.stop()
		await expect(clicks.prevented).toEqual([false])
		await expect(args.answerActions?.onOpenImage).not.toHaveBeenCalled()

		const contextMenus = defaultPreventedOf("contextmenu")
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: within(withoutMenu).getByRole("img", {
				name: "Green velvet sofa",
			}),
		})
		contextMenus.stop()
		await expect(contextMenus.prevented).toEqual([false])
		await expect(within(document.body).queryByRole("menu")).toBeNull()
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

const FIXTURE_PICTURES: Readonly<Record<string, string>> = {
	"https://images.example.org/taberna-da-se.jpg": SE_CATHEDRAL,
	"https://images.example.org/cais-22.jpg": CASA_DO_RIO_TERRACE,
	"https://images.example.org/a-baiuca.jpg": BAR_AT_NIGHT,
	"https://images.example.org/senhora-do-monte.jpg": SANTA_LUZIA,
	"https://www.visitlisboa.example/favicon.png": CASA_DO_RIO_FAVICON,
}

const showFixturePicture = (image: Element) => {
	const picture = FIXTURE_PICTURES[image.getAttribute("src") ?? ""]
	if (picture) image.setAttribute("src", picture)
}

const drawFixturePictures = () => {
	const observer = new MutationObserver((mutations) => {
		for (const { target } of mutations) {
			if (target instanceof Element) {
				target.querySelectorAll("img").forEach(showFixturePicture)
			}
		}
	})
	observer.observe(document.body, { childList: true, subtree: true })
	return () => observer.disconnect()
}

const ARTBOARD_ACTIONS: MarkdownAnswerActions = {
	agentName: "Atlas",
	onPickOption: fn(),
	onUseValues: fn(),
	onOpenImage: fn(),
	onOpenWebPage: fn(),
	onToggleChecklistItem: fn(),
	onCopyChecklist: fn(),
	imageMenu: { onSaveToLibrary: fn() },
}

const ILLUSTRATED_LIST_ARTBOARD = `## 🍽️ Three tables for 12, near Alfama

Thursday is the easy night: everyone has landed and nobody has to be up early. I kept places that seat 12 at one table, a short walk from Casa do Rio.

\`\`\`illustrated-list
- title: Taberna da Sé
  image: https://images.example.org/taberna-da-se.jpg
  badge: My pick
  text: A long wooden table in the back room, grilled fish and a fixed menu at €38 a head.
  meta: 6 min on foot · Alfama
- title: Cais 22
  image: https://images.example.org/cais-22.jpg
  text: On the river, **the best view of the three**. Louder, and they want a deposit by Monday.
  meta: 12 min on foot · Riverside
- title: A Baiuca
  image: https://images.example.org/a-baiuca.jpg
  text: Fado from 21:00. Small, so we'd take the whole room.
  meta: 4 min on foot · Alfama
\`\`\`

## 🧭 How I'd pick

- A table where everyone talks: Taberna da Sé.
- A first night to remember: Cais 22, if we pay Monday.

Quick tip: ask for the back room by name when you book; it's the only one that seats 12.`

const ILLUSTRATED_LIST_ITEMS = [
	{
		title: "Taberna da Sé",
		text: "A long wooden table in the back room, grilled fish and a fixed menu at €38 a head.",
		meta: "6 min on foot · Alfama",
	},
	{
		title: "Cais 22",
		text: "On the river, the best view of the three. Louder, and they want a deposit by Monday.",
		meta: "12 min on foot · Riverside",
	},
	{
		title: "A Baiuca",
		text: "Fado from 21:00. Small, so we'd take the whole room.",
		meta: "4 min on foot · Alfama",
	},
]

export const IllustratedListWithBadgeAndMeta = meta.story({
	beforeEach: drawFixturePictures,
	args: {
		children: ILLUSTRATED_LIST_ARTBOARD,
		answerActions: ARTBOARD_ACTIONS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 1. An `illustrated-list` block between its heading and the advice that follows, its items carrying a `badge`, a `meta` line and text written in inline Markdown. Check the two headings, the intro, each item with its picture, text and meta, My pick on Taberna da Sé alone, the bold run of Cais 22 drawn bold, the two bullets and the tip.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", {
				name: "🍽️ Three tables for 12, near Alfama",
			}),
		).toBeVisible()
		await expect(
			canvas.getByText(/^Thursday is the easy night: everyone has landed/),
		).toHaveTextContent(
			"Thursday is the easy night: everyone has landed and nobody has to be up early. I kept places that seat 12 at one table, a short walk from Casa do Rio.",
		)

		const rows = slotIn(canvasElement, "illustrated-list").querySelectorAll(
			"li",
		)
		await expect(rows).toHaveLength(3)
		for (const [index, item] of ILLUSTRATED_LIST_ITEMS.entries()) {
			await expect(canvas.getByRole("img", { name: item.title })).toBeVisible()
			await expect(rows[index]).toHaveTextContent(item.title)
			await expect(rows[index]).toHaveTextContent(item.text)
			await expect(rows[index]).toHaveTextContent(item.meta)
		}
		await expect(rows[0]).toHaveTextContent("My pick")
		await expect(canvas.getAllByText("My pick")).toHaveLength(1)
		await expect(canvas.getByText("the best view of the three").tagName).toBe(
			"STRONG",
		)
		await expect(rows[1]).not.toHaveTextContent("**")

		await expect(
			canvas.getByRole("heading", { name: "🧭 How I'd pick" }),
		).toBeVisible()
		await expect(
			canvas.getAllByRole("listitem").map((bullet) => bullet.textContent),
		).toEqual(
			expect.arrayContaining([
				"A table where everyone talks: Taberna da Sé.",
				"A first night to remember: Cais 22, if we pay Monday.",
			]),
		)
		await expect(
			canvas.getByText(
				"Quick tip: ask for the back room by name when you book; it's the only one that seats 12.",
			),
		).toBeVisible()
	},
})

const OPTIONS_INTRO =
	"Friday ends at 17:00 and the evening is free. Here are four ideas that work for 12 people. Tell me which one you want and I'll book it."

const OPTION_TITLES = [
	"Dinner, all 12 at one table",
	"Drinks on a rooftop",
	"A cooking class together",
	"A quiet night in at the house",
]

const DINNER_TEXT =
	"Taberna da Rua, Alfama. Long table from 20:00, set menu around €45 a head, ten minutes on foot from the house."

const OPTIONS_ARTBOARD = `${OPTIONS_INTRO}

\`\`\`options
question: Four ideas for Friday
subtitle: Open one to see what it involves.
- title: ${OPTION_TITLES[0]}
  text: ${DINNER_TEXT}
- title: ${OPTION_TITLES[1]}
  text: A terrace over Baixa from 19:00, drinks and small plates, no booking past ten people.
- title: ${OPTION_TITLES[2]}
  text: Two hours with a chef near Cais do Sodré, then we eat what we cooked.
- title: ${OPTION_TITLES[3]}
  text: Groceries delivered to Casa do Rio and a long dinner on the terrace.
\`\`\``

export const OptionsWithSubtitle = meta.story({
	args: { children: OPTIONS_ARTBOARD, answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 2. An `options` block with its `question` as title and a `subtitle` under it. Check the intro, the title, the subtitle and the four options in order, and that opening the dinner shows its text and hands its title to `onPickOption`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText(OPTIONS_INTRO)).toBeVisible()
		await expect(canvas.getByText("Four ideas for Friday")).toBeVisible()
		await expect(
			canvas.getByText("Open one to see what it involves."),
		).toBeVisible()
		const options = slotsIn(canvasElement, "options-card-option")
		await expect(options).toHaveLength(4)
		for (const [index, title] of OPTION_TITLES.entries()) {
			await expect(options[index]).toHaveTextContent(title)
		}

		await userEvent.click(
			canvas.getByRole("button", { name: OPTION_TITLES[0] }),
		)
		await expect(await canvas.findByText(DINNER_TEXT)).toBeVisible()
		await expect(args.answerActions?.onPickOption).toHaveBeenCalledWith(
			OPTION_TITLES[0],
		)
	},
})

const CHECKLIST_INTRO =
	"Here it is. Anyone in this conversation can tick a line, and the counter is what the rest of the team reads first."

const CHECKLIST_TITLE = "To sort before Thursday"

const CHECKLIST_ROWS = [
	{ text: "Pay the Casa do Rio deposit", assignee: "you" },
	{ text: "Book the back room at Taberna da Sé", assignee: "Lena" },
	{ text: "Send everyone the flight times", assignee: "Atlas" },
	{ text: "Order lunch for the planning day", assignee: "Tom" },
	{ text: "Print the agenda for the big room", assignee: "Lena" },
	{ text: "Airport transfer for the Berlin two", assignee: "you" },
]

const checklistOf = (doneCount: number) => `${CHECKLIST_INTRO}

\`\`\`checklist
title: ${CHECKLIST_TITLE}
${CHECKLIST_ROWS.map(
	({ text, assignee }, index) =>
		`- text: ${text}\n  done: ${index < doneCount ? "yes" : "no"}\n  assignee: ${assignee}`,
).join("\n")}
\`\`\``

const expectChecklist = async (
	canvasElement: HTMLElement,
	doneCount: number,
) => {
	const counter = slotIn(canvasElement, "checklist-counter")
	await expect(counter).toHaveTextContent(`${doneCount}/6`)
	const rows = slotsIn(canvasElement, "checklist-item")
	await expect(rows).toHaveLength(6)
	for (const [index, row] of rows.entries()) {
		const isDone = index < doneCount
		await expect(row).toHaveTextContent(CHECKLIST_ROWS[index].text)
		await expect(row).toHaveTextContent(CHECKLIST_ROWS[index].assignee)
		await expect(row).toHaveAttribute("aria-checked", `${isDone}`)
		await expect(row.querySelector(".line-through") !== null).toBe(isDone)
	}
}

export const ChecklistPartlyDone = meta.story({
	args: { children: checklistOf(3), answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 3. A `checklist` block, its first three rows `done: yes`. Check the intro, the title and 3/6 show, each row carries its assignee, the done rows are struck through, ticking a row hands the checklist title, the row index and its new state to `onToggleChecklistItem`, and Copy the list hands the list to `onCopyChecklist`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText(CHECKLIST_INTRO)).toBeVisible()
		await expect(canvas.getByText(CHECKLIST_TITLE)).toBeVisible()
		await expectChecklist(canvasElement, 3)

		await userEvent.click(
			canvas.getByRole("checkbox", {
				name: /Order lunch for the planning day/,
			}),
		)
		await expect(
			args.answerActions?.onToggleChecklistItem,
		).toHaveBeenCalledWith(CHECKLIST_TITLE, 3, true)
		await expect(slotIn(canvasElement, "checklist-counter")).toHaveTextContent(
			"4/6",
		)

		await userEvent.click(canvas.getByRole("button", { name: "Copy the list" }))
		await expect(args.answerActions?.onCopyChecklist).toHaveBeenCalledWith(
			expect.stringContaining("- [x] Order lunch for the planning day · Tom"),
		)
	},
})

export const ChecklistAllDone = meta.story({
	args: { children: checklistOf(6), answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 4. The same `checklist` block with every row `done: yes`. Check the intro, the title, 6/6, every row struck through with its assignee, and Copy the list still shows.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText(CHECKLIST_INTRO)).toBeVisible()
		await expect(canvas.getByText(CHECKLIST_TITLE)).toBeVisible()
		await expectChecklist(canvasElement, 6)
		await expect(
			canvas.getByRole("button", { name: "Copy the list" }),
		).toBeVisible()
	},
})

const SOURCED_IMAGE_IMAGE = "https://images.example.org/senhora-do-monte.jpg"

const SOURCED_IMAGE_INTRO =
	"Sunset from the Miradouro da Senhora do Monte, on Thursday before dinner. It's ten minutes up from the house and the whole city turns orange."

const SOURCED_IMAGE_ARTBOARD = `## 🌅 Miradouro da Senhora do Monte

${SOURCED_IMAGE_INTRO}

![The Miradouro da Senhora do Monte at sunset](${SOURCED_IMAGE_IMAGE})

Source: [visitlisboa.example](https://www.visitlisboa.example/en/places/senhora-do-monte)
Title: Miradouro da Senhora do Monte
Favicon: https://www.visitlisboa.example/favicon.png
Status: Free
Chip: Walk: 10 min uphill
Chip: Sunset 18:52

- Leave at 18:15 to get a spot on the wall.
- Walk down to dinner: Taberna da Sé is 15 minutes, all downhill.`

export const SourcedImageWithSourceDetails = meta.story({
	beforeEach: drawFixturePictures,
	args: { children: SOURCED_IMAGE_ARTBOARD, answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 5. A sourced image whose `Source:` line is followed by its `Title:`, `Favicon:`, `Status:` and `Chip:` lines, between a heading and two bullets. Check the heading, the intro, the domain with its favicon, the title, the Free status, both chips and both bullets show with none of the field lines left, Save hands the image to `imageMenu.onSaveToLibrary`, and the picture still opens.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("heading", {
				name: "🌅 Miradouro da Senhora do Monte",
			}),
		).toBeVisible()
		await expect(canvas.getByText(SOURCED_IMAGE_INTRO)).toBeVisible()

		const figure = slotIn(canvasElement, "sourced-image")
		await expect(figure).toHaveTextContent("visitlisboa.example")
		await expect(
			Array.from(figure.querySelectorAll("img"), (image) =>
				image.getAttribute("src"),
			),
		).toEqual([SANTA_LUZIA, CASA_DO_RIO_FAVICON])
		await expect(figure.querySelector("figcaption p")).toHaveTextContent(
			"Miradouro da Senhora do Monte",
		)
		await expect(
			slotIn(canvasElement, "sourced-image-status"),
		).toHaveTextContent("Free")
		await expect(canvas.getByText("Walk: 10 min uphill")).toBeVisible()
		await expect(canvas.getByText("Sunset 18:52")).toBeVisible()
		await expect(
			canvas.queryByText(/^(?:Source|Title|Chip|Status):/),
		).toBeNull()
		await expect(
			canvas.getByText("Leave at 18:15 to get a spot on the wall."),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Walk down to dinner: Taberna da Sé is 15 minutes, all downhill.",
			),
		).toBeVisible()

		await userEvent.click(
			canvas.getByRole("button", { name: "Save the image" }),
		)
		await expect(
			args.answerActions?.imageMenu?.onSaveToLibrary,
		).toHaveBeenCalledWith({
			id: SOURCED_IMAGE_IMAGE,
			name: "The Miradouro da Senhora do Monte at sunset",
			src: SOURCED_IMAGE_IMAGE,
			detail: "visitlisboa.example",
		})
		await expect(args.answerActions?.onOpenImage).not.toHaveBeenCalled()

		await userEvent.click(
			canvas.getByRole("button", {
				name: "The Miradouro da Senhora do Monte at sunset",
			}),
		)
		await expect(args.answerActions?.onOpenImage).toHaveBeenCalledOnce()
	},
})

const BUDGET_TOTAL = "1200 * nights + 45 * people * nights + flight * people"

const INTERACTIVE_INTRO =
	"It moves with headcount and nights, so I made you a small calculator. Move the sliders, the total follows."

const INTERACTIVE_SOURCE = "Prices from the house listing and Taberna da Rua."

const INTERACTIVE_ARTBOARD = `${INTERACTIVE_INTRO}

\`\`\`interactive
title: Offsite budget
result: ${BUDGET_TOTAL}
result-label: Total for the trip
currency: EUR
note: {(${BUDGET_TOTAL}) / people} a head
meter: (${BUDGET_TOTAL}) / 10000
meter-caption: {10000 - (${BUDGET_TOTAL})} under the €10k budget
source: ${INTERACTIVE_SOURCE}
- name: people
  label: People
  min: 4
  max: 20
  step: 1
  default: 12
- name: nights
  label: Nights
  min: 1
  max: 7
  step: 1
  default: 3
- name: flight
  label: Flight per person
  min: 60
  max: 400
  step: 10
  default: 180
  currency: EUR
- row: House, 3 nights
  value: 1200 * nights
- row: Dinners
  value: 45 * people * nights
- row: Flights
  value: flight * people
\`\`\``

const breakdownOf = (canvasElement: HTMLElement) =>
	Array.from(
		slotIn(canvasElement, "interactive-view-result").querySelectorAll(
			"dl > div",
		),
		(row) => row.textContent,
	)

export const InteractiveBudgetWithBreakdown = meta.story({
	args: { children: INTERACTIVE_ARTBOARD, answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 9. An `interactive` block with its own `title`, a `currency`, a `note`, a `meter` with its caption, three breakdown `row` items and a `source`. Check the intro, the title, the caption, €7,380, €615 a head, the meter caption, each breakdown value and the source show, the flight slider alone reads in euros, and one more person moves the total, the note, the meter caption and the breakdown together.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText(INTERACTIVE_INTRO)).toBeVisible()
		const result = slotIn(canvasElement, "interactive-view-result")
		const total = slotIn(canvasElement, "interactive-view-total")
		await expect(
			canvas.getByRole("heading", { name: "Offsite budget" }),
		).toBeVisible()
		await expect(result).toHaveTextContent("Total for the trip")
		await expect(total).toHaveTextContent("€7,380")
		await expect(result).toHaveTextContent("€615 a head")
		await expect(result).toHaveTextContent("€2,620 under the €10k budget")
		await expect(breakdownOf(canvasElement)).toEqual([
			"House, 3 nights€3,600",
			"Dinners€1,620",
			"Flights€2,160",
		])
		await expect(canvas.getByText(INTERACTIVE_SOURCE)).toBeVisible()
		await expect(
			slotsIn(canvasElement, "interactive-view-slider-value").map(
				(value) => value.textContent,
			),
		).toEqual(["12", "3", "€180"])

		canvas.getByRole("slider", { name: "People" }).focus()
		await userEvent.keyboard("{ArrowRight}")
		await waitFor(() => expect(total).toHaveTextContent("€7,695"))
		await expect(result).toHaveTextContent("€591.92 a head")
		await expect(result).toHaveTextContent("€2,305 under the €10k budget")
		await expect(breakdownOf(canvasElement)).toEqual([
			"House, 3 nights€3,600",
			"Dinners€1,755",
			"Flights€2,340",
		])
	},
})

const CALLOUTS_INTRO = "Two things, one that can wait and one that can't."

const CALLOUTS_OUTRO = "Want me to move everyone's arrival to Thursday?"

const NOTE_BODY =
	"Taberna da Rua keeps the long table for us until Wednesday 18:00. After that it goes to the next group."

const WARNING_BODY =
	"Ground staff walk out from 06:00 to 12:00 on 13 November. Flights landing then may be cancelled, so book arrivals for Thursday evening."

const CALLOUTS_ARTBOARD = `${CALLOUTS_INTRO}

> [!NOTE] The table is held until Wednesday
> ${NOTE_BODY}

> [!WARNING] Strike at Lisbon airport on Friday morning
> ${WARNING_BODY}

${CALLOUTS_OUTRO}`

export const CalloutsWithTitles = meta.story({
	args: { children: CALLOUTS_ARTBOARD, answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 10. A `> [!NOTE]` and a `> [!WARNING]` callout, each titled by the text after its marker, between an intro and a question. Check each callout keeps its tone, shows its own title instead of Note or Warning, and keeps its body, with the intro and the question around them.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText(CALLOUTS_INTRO)).toBeVisible()
		const [note, warning] = canvas.getAllByRole("note")
		await expect(note).toHaveAttribute("data-tone", "note")
		await expect(note).toHaveTextContent("The table is held until Wednesday")
		await expect(note).toHaveTextContent(NOTE_BODY)
		await expect(warning).toHaveAttribute("data-tone", "warning")
		await expect(warning).toHaveTextContent(
			"Strike at Lisbon airport on Friday morning",
		)
		await expect(warning).toHaveTextContent(WARNING_BODY)
		await expect(canvas.queryByText(/^(?:Note|Warning)$/)).toBeNull()
		await expect(canvas.queryByText(/\[!/)).toBeNull()
		await expect(canvas.getByText(CALLOUTS_OUTRO)).toBeVisible()
	},
})

const COLLAPSIBLE_INTRO =
	"Three parts, and the house takes half. Open one to see how I got there."

const HOUSE_BODY =
	"€1,200 a night for three nights, cleaning included. Six bedrooms, so two people share in each. A second house nearby was €900 a night but sleeps eight, and splitting the team across two places loses the evenings together."

const COLLAPSIBLE_ARTBOARD = `${COLLAPSIBLE_INTRO}

\`\`\`collapsible
title: The house, €3,600
value: 49%

${HOUSE_BODY}

title: Flights, €2,160
value: 29%

Twelve returns at €180, booked together so everyone lands on Thursday.

title: Dinners, €1,620
value: 22%

Three dinners for twelve at about €45 a head, Taberna da Rua on the first night.
\`\`\``

export const CollapsibleSectionsWithValues = meta.story({
	args: { children: COLLAPSIBLE_ARTBOARD, answerActions: ARTBOARD_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Final page, Markdown 11. A `collapsible` block of three sections, each a `title`, a `value` and a Markdown body. Check the intro, one card of three rows with their label and value in order, and that opening The house shows its body.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText(COLLAPSIBLE_INTRO)).toBeVisible()
		await expect(slotsIn(canvasElement, "collapsible-sections")).toHaveLength(1)
		await expect(
			slotsIn(canvasElement, "collapsible-sections-head").map(
				(head) => head.textContent,
			),
		).toEqual([
			"The house, €3,60049%",
			"Flights, €2,16029%",
			"Dinners, €1,62022%",
		])

		await userEvent.click(
			canvas.getByRole("button", { name: /The house, €3,600/ }),
		)
		await expect(await canvas.findByText(HOUSE_BODY)).toBeVisible()
	},
})
