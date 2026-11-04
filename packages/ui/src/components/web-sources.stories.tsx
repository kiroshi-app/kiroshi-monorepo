import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_FAVICON } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import {
	type WebSource,
	WebSources,
	WebSourcesButton,
	WebSourcesList,
	type WebSourcesProps,
} from "@workspace/ui/components/web-sources"

const LISBON_PAGES: WebSource[] = [
	{
		url: "https://www.visitlisboa.com/en/places/miradouro-de-santa-luzia",
		domain: "visitlisboa.com",
		title: "Miradouro de Santa Luzia, the terrace over Alfama",
	},
	{
		url: "https://www.timeout.com/lisbon/things-to-do/best-viewpoints-in-lisbon",
		domain: "timeout.com",
		title: "The 14 best viewpoints in Lisbon",
	},
	{
		url: "https://en.wikipedia.org/wiki/Alfama",
		domain: "wikipedia.org",
		title: "Alfama, the oldest district of Lisbon",
	},
	{
		url: "https://www.lonelyplanet.com/portugal/lisbon/alfama",
		domain: "lonelyplanet.com",
		title: "Alfama travel guide",
	},
	{
		url: "https://www.cntraveler.com/story/lisbon-alfama-guide",
		domain: "cntraveler.com",
		title: "A local's guide to Alfama",
	},
]

const CASA_DO_RIO_PAGE: WebSource = {
	url: "https://casadorio.pt/en/rooms",
	domain: "casadorio.pt",
	title: "Rooms and suites, Casa do Rio",
}

const INTRO =
	"Santa Luzia is the viewpoint to pick: a short walk up from Alfama, open all day, and the terrace looks straight over the river."

type WebSourcesStoryProps = Omit<WebSourcesProps, "children"> & {
	width?: number
}

const WebSourcesInAnswer = ({ width, ...props }: WebSourcesStoryProps) => (
	<AgentAnswerFrame intro={INTRO} width={width}>
		<WebSources {...props}>
			<WebSourcesButton />
			<WebSourcesList />
		</WebSources>
	</AgentAnswerFrame>
)

const sourcesButtonIn = (root: HTMLElement) =>
	slotIn(root, "web-sources-button")

const rowsIn = (root: HTMLElement) => slotsIn(root, "web-source-row")

const meta = preview.meta({
	title: "Conversation/Message/WebSources",
	component: WebSourcesInAnswer,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The web pages an answer was written from. `WebSources` holds the pages and the open state, controlled through `open` and `onOpenChange` or not; inside it the app places `WebSourcesButton` at the end of the actions row and `WebSourcesList` below that row. Two pages or more fold behind a pill with three favicons and the count; one page is a single pill that opens it; no page renders nothing. A row or the single pill hands its url to `onOpenSource` and never navigates. A page without a favicon, or whose favicon fails, shows the first letter of its domain on a hue drawn from the domain.",
			},
		},
	},
	args: { pages: LISBON_PAGES, onOpenSource: fn() },
})

export const Folded = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 16. Five pages, folded: the pill shows the favicons of the first three, overlapped and ringed in the bubble colour, then 5 sources and a down chevron. Check the button reports aria-expanded false and no row is in the page.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const button = canvas.getByRole("button", { name: "5 sources" })
		await expect(button).toHaveAttribute("aria-expanded", "false")
		await expect(slotsIn(button, "web-source-favicon")).toHaveLength(3)
		await expect(rowsIn(canvasElement)).toHaveLength(0)
		await expect(getComputedStyle(button).height).toBe("28px")
	},
})

export const Open = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 17. The pill pressed open: stronger fill and border, an up chevron, and one row per page below it, each with its favicon, title, domain and an up-right arrow. Check the button reports aria-expanded true and the list holds five rows.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const button = canvas.getByRole("button", { name: "5 sources" })
		await userEvent.click(button)
		await expect(button).toHaveAttribute("aria-expanded", "true")
		await expect(canvas.getByRole("list", { name: "Sources" })).toBeVisible()
		await expect(rowsIn(canvasElement)).toHaveLength(5)
		await userEvent.unhover(button)
	},
})

export const OneSource = meta.story({
	globals: { theme: "dark" },
	args: { pages: [LISBON_PAGES[0] as WebSource] },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 18. One page: a single pill with its favicon, its domain and an up-right arrow, no chevron and no list. Check a click hands the page url to `onOpenSource`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const pill = canvas.getByRole("button", {
			name: "Open Miradouro de Santa Luzia, the terrace over Alfama, visitlisboa.com",
		})
		await expect(pill).not.toHaveAttribute("aria-expanded")
		await expect(pill).toHaveTextContent("visitlisboa.com")
		await userEvent.click(pill)
		await expect(args.onOpenSource).toHaveBeenCalledWith(LISBON_PAGES[0]?.url)
		await expect(rowsIn(canvasElement)).toHaveLength(0)
		await userEvent.unhover(pill)
	},
})

export const OpenSourceFromRow = meta.story({
	tags: ["test-only"],
	args: { defaultOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"Open from the start through `defaultOpen`. Check a row hands its url to `onOpenSource` on a click and on Enter, renders no link, and changes its fill with no transition.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvasElement.querySelector("a")).toBeNull()
		const row = canvas.getByRole("button", {
			name: "Open The 14 best viewpoints in Lisbon, timeout.com",
		})
		await expect(getComputedStyle(row).transitionDuration).toBe("0s")
		await expect(
			getComputedStyle(sourcesButtonIn(canvasElement)).transitionDuration,
		).toBe("0s")
		await userEvent.click(row)
		await expect(args.onOpenSource).toHaveBeenLastCalledWith(
			LISBON_PAGES[1]?.url,
		)
		canvas
			.getByRole("button", {
				name: "Open Alfama, the oldest district of Lisbon, wikipedia.org",
			})
			.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onOpenSource).toHaveBeenLastCalledWith(
			LISBON_PAGES[2]?.url,
		)
	},
})

export const Controlled = meta.story({
	tags: ["test-only"],
	args: { open: true, onOpenChange: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Held open by `open`. Check a click on the pill asks `onOpenChange` for false and the list stays, since the app owns the state.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const button = canvas.getByRole("button", { name: "5 sources" })
		await userEvent.click(button)
		await expect(args.onOpenChange).toHaveBeenCalledWith(
			false,
			expect.anything(),
		)
		await expect(button).toHaveAttribute("aria-expanded", "true")
		await expect(rowsIn(canvasElement)).toHaveLength(5)
	},
})

export const FaviconAndFallbacks = meta.story({
	tags: ["test-only"],
	args: {
		defaultOpen: true,
		pages: [
			{ ...CASA_DO_RIO_PAGE, favicon: CASA_DO_RIO_FAVICON },
			{
				url: "https://example.org/broken",
				domain: "example.org",
				title: "A page whose favicon fails",
				favicon: "data:image/png;base64,AAAA",
			},
			{ url: "https://www.bbc.com/travel", domain: "bbc.com" },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A favicon that loads, one that fails and a page without title. Check the first shows its image, the second falls back to its letter, and the untitled row reads its domain as title with no domain line.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [loaded, broken, untitled] = rowsIn(canvasElement)
		await expect(loaded?.querySelector("img")).not.toBeNull()
		await expect(
			canvas.getByRole("button", {
				name: "Open A page whose favicon fails, example.org",
			}),
		).toBeVisible()
		await waitFor(() =>
			expect(
				slotIn(broken as HTMLElement, "web-source-letter"),
			).toHaveTextContent("E"),
		)
		await expect(untitled).toHaveAccessibleName("Open bbc.com")
		await expect(
			within(untitled as HTMLElement).getAllByText("bbc.com"),
		).toHaveLength(1)
	},
})

const UNBREAKABLE_DOMAIN =
	"averyveryverylongsubdomainthatneverbreaks.example-travel-guides.com"

export const InNarrowColumn = meta.story({
	tags: ["test-only"],
	args: {
		width: 320,
		defaultOpen: true,
		pages: [
			{
				url: "https://example-travel-guides.com/lisbon",
				domain: UNBREAKABLE_DOMAIN,
				title:
					"Every viewpoint in Lisbon ranked by sunset, crowd, distance from the tram and the price of a coffee on its terrace",
			},
			...LISBON_PAGES.slice(1, 3),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with a long title and an unbreakable domain. Check the pill and every row stay inside the column and clamp to one line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
		const frame = slotIn(canvasElement, "agent-answer-frame")
		const right = frame.getBoundingClientRect().right
		for (const part of [
			sourcesButtonIn(canvasElement),
			...rowsIn(canvasElement),
		])
			await expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(
				right,
			)
	},
})

export const OneSourceInNarrowColumn = meta.story({
	tags: ["test-only"],
	args: {
		width: 320,
		pages: [
			{ url: "https://example-travel-guides.com", domain: UNBREAKABLE_DOMAIN },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"One page with an unbreakable domain in a 320 wide column. Check the single pill truncates its domain and stays inside the column.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
		const frame = slotIn(canvasElement, "agent-answer-frame")
		await expect(
			sourcesButtonIn(canvasElement).getBoundingClientRect().right,
		).toBeLessThanOrEqual(frame.getBoundingClientRect().right)
	},
})

export const NoSource = meta.story({
	tags: ["test-only"],
	args: { pages: [] },
	parameters: {
		docs: {
			description: {
				story: "No page. Check neither the pill nor the list renders.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			canvasElement.querySelector('[data-slot="web-sources-button"]'),
		).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="web-sources-list"]'),
		).toBeNull()
	},
})
