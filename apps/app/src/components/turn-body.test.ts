// @vitest-environment happy-dom

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import "@workspace/ui/lib/i18n"

import { AnswerBody, TurnBody } from "@/components/turn-body"
import {
	type AnswerActions,
	AnswerActionsContext,
} from "@/lib/chat/answer-actions"
import {
	attachmentBlock,
	messageWithAttachments,
} from "@/lib/chat/message-attachments"
import { openAttachment } from "@/lib/links/open-attachment"

vi.mock("@/lib/links/open-attachment", () => ({ openAttachment: vi.fn() }))

vi.mock("@/lib/host", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/host")>()),
	assetSrc: (path: string) => `host-file://${encodeURIComponent(path)}`,
}))

afterEach(() => {
	cleanup()
	vi.mocked(openAttachment).mockClear()
})

const fenced = (label: string, body: string) =>
	`Here it is.\n\n\`\`\`${label}\n${body}\n\`\`\``

type ImageSurface = {
	surface: string
	text: string
	name: string
	src: string
}

const SOURCED_IMAGE: ImageSurface = {
	surface: "a sourced image",
	text: "![The Lisbon waterfront](https://images.example.org/lisbon.jpg)\n\nSource: [Visit Lisboa](https://www.visitlisboa.com/en)",
	name: "The Lisbon waterfront",
	src: "https://images.example.org/lisbon.jpg",
}

const IMAGE_SURFACES: ImageSurface[] = [
	{
		surface: "a gallery",
		text: fenced(
			"gallery",
			`- image: https://images.example.org/green.jpg
  alt: Green velvet sofa
- image: https://images.example.org/grey.jpg
  alt: Grey linen sofa`,
		),
		name: "Grey linen sofa",
		src: "https://images.example.org/grey.jpg",
	},
	{
		surface: "an inline markdown image",
		text: "Here: ![A green sofa](https://images.example.org/sofa.jpg)",
		name: "A green sofa",
		src: "https://images.example.org/sofa.jpg",
	},
	SOURCED_IMAGE,
	{
		surface: "an illustrated list",
		text: fenced(
			"illustrated-list",
			`- title: Lisbon
  image: https://images.example.org/lisbon.jpg
- title: Porto
  image: https://images.example.org/porto.jpg`,
		),
		name: "Porto",
		src: "https://images.example.org/porto.jpg",
	},
	{
		surface: "a web page card",
		text: fenced(
			"web-page",
			`url: https://www.casadorio.pt/rooms
title: Casa do Rio
image: https://images.example.org/casa-do-rio.jpg
alt: Terrace of Casa do Rio`,
		),
		name: "Terrace of Casa do Rio",
		src: "https://images.example.org/casa-do-rio.jpg",
	},
]

const IMAGE_MENU_ENTRIES = ["Save to Library", "Copy image", "Open in viewer"]

const actionsSpy = (): AnswerActions => ({
	insert: vi.fn(),
	openImage: vi.fn(),
	imageActions: {
		onSaveToLibrary: vi.fn(),
		onCopyImage: vi.fn(),
		isSavingImage: () => false,
	},
})

const renderAnswer = (text: string, actions: AnswerActions) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(AnswerBody, {
				attachments: [],
				text,
				agentName: "Ada",
				isWriting: false,
			}),
		),
	)

const imageNamed = (name: string) =>
	screen.queryByRole("button", { name }) ?? screen.getByRole("img", { name })

const openImageMenuOf = async (name: string) => {
	await act(async () => {
		fireEvent.contextMenu(imageNamed(name))
	})
	return screen.findByRole("menu", { name: `Actions for ${name}` })
}

const pickInImageMenuOf = async (name: string, entry: string) => {
	const menu = await openImageMenuOf(name)
	await act(async () => {
		fireEvent.click(within(menu).getByRole("menuitem", { name: entry }), {
			detail: 1,
		})
	})
}

describe.each(IMAGE_SURFACES)(
	"the image menu of $surface in an answer",
	({ text, name, src }) => {
		it("opens on right-click with the image actions", async () => {
			renderAnswer(text, actionsSpy())

			const menu = await openImageMenuOf(name)

			expect(
				within(menu)
					.getAllByRole("menuitem")
					.map((item) => item.textContent),
			).toEqual(IMAGE_MENU_ENTRIES)
		})

		it.each([
			["Save to Library", "onSaveToLibrary"],
			["Copy image", "onCopyImage"],
		] as const)("hands the image to %s", async (entry, handler) => {
			const actions = actionsSpy()
			renderAnswer(text, actions)

			await pickInImageMenuOf(name, entry)

			expect(actions.imageActions[handler]).toHaveBeenCalledWith(
				expect.objectContaining({ name, src }),
			)
		})

		it("opens the image in the answer image viewer", async () => {
			const actions = actionsSpy()
			renderAnswer(text, actions)

			await pickInImageMenuOf(name, "Open in viewer")

			expect(actions.openImage).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ name, src })]),
				expect.any(Number),
			)
		})
	},
)

describe("the Save button of a sourced image in an answer", () => {
	it("saves the image to the Library", async () => {
		const actions = actionsSpy()
		renderAnswer(SOURCED_IMAGE.text, actions)

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "Save the image" }))
		})

		expect(actions.imageActions.onSaveToLibrary).toHaveBeenCalledWith(
			expect.objectContaining({
				name: SOURCED_IMAGE.name,
				src: SOURCED_IMAGE.src,
			}),
		)
	})
})

const MESSAGE_ATTACHMENTS = [
	{
		id: "/attachments/porto.jpg",
		name: "porto.jpg",
		previewUrl: "blob:porto",
	},
	{ id: "/attachments/brief.pdf", name: "brief.pdf" },
	{
		id: "/attachments/lisbon.jpg",
		name: "lisbon.jpg",
		previewUrl: "blob:lisbon",
	},
]

const renderMessage = (actions: AnswerActions | null) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(TurnBody, { attachments: MESSAGE_ATTACHMENTS, text: "" }),
		),
	)

const clickAttachment = (name: string) =>
	act(async () => {
		fireEvent.click(screen.getByRole("button", { name: `Open ${name}` }))
	})

describe("a left-click on an attachment of a message", () => {
	it("opens the message images in the viewer at the clicked image", async () => {
		const actions = actionsSpy()
		renderMessage(actions)

		await clickAttachment("lisbon.jpg")

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({ name: "porto.jpg", src: "blob:porto" }),
				expect.objectContaining({ name: "lisbon.jpg", src: "blob:lisbon" }),
			],
			1,
		)
		expect(openAttachment).not.toHaveBeenCalled()
	})

	it("opens a non-image attachment in its default app", async () => {
		const actions = actionsSpy()
		renderMessage(actions)

		await clickAttachment("brief.pdf")

		expect(openAttachment).toHaveBeenCalledWith("/attachments/brief.pdf")
		expect(actions.openImage).not.toHaveBeenCalled()
	})

	it("opens an image attachment in its default app outside a thread", async () => {
		renderMessage(null)

		await clickAttachment("lisbon.jpg")

		expect(openAttachment).toHaveBeenCalledWith("/attachments/lisbon.jpg")
	})
})

const STORE =
	"/Users/reader/Library/Application Support/com.kiroshi.app/attachments/conv-1"
const CITED_IMAGE = `${STORE}/0b1e7c52-6a1f-4c7e-9d3a-2f8e4b6c1a90.png`
const CITED_FILE = `${STORE}/5d2a9f31-8c4b-4e6d-a1f0-7b3c9e2d4a68.pdf`
const OUTSIDE_THE_STORE = "/Users/reader/Downloads/brief.pdf"

const renderCitation = (text: string, actions: AnswerActions | null) =>
	render(
		createElement(
			AnswerActionsContext,
			{ value: actions },
			createElement(TurnBody, { attachments: [], text }),
		),
	)

const click = (element: HTMLElement) =>
	act(async () => {
		fireEvent.click(element, { detail: 1 })
	})

describe("a file an agent cites in its answer", () => {
	it("shows a cited image in place, resolved through the host file route", async () => {
		renderCitation(`The chart: ![Harbour chart](<${CITED_IMAGE}>)`, null)

		const image = await screen.findByRole("img", { name: "Harbour chart" })

		expect(image.getAttribute("src")).toBe(
			`host-file://${encodeURIComponent(CITED_IMAGE)}`,
		)
	})

	it("opens a clicked cited image in the viewer", async () => {
		const actions = actionsSpy()
		renderCitation(`![Harbour chart](<${CITED_IMAGE}>)`, actions)

		await click(await screen.findByRole("button", { name: "Harbour chart" }))

		expect(actions.openImage).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					src: `host-file://${encodeURIComponent(CITED_IMAGE)}`,
					path: CITED_IMAGE,
				}),
			],
			0,
		)
		expect(openAttachment).not.toHaveBeenCalled()
	})

	it("opens a clicked cited file in its default app", async () => {
		const actions = actionsSpy()
		renderCitation(`Read [the brief](<${CITED_FILE}>) first.`, actions)

		await click(screen.getByRole("button", { name: "Open the brief" }))

		expect(openAttachment).toHaveBeenCalledWith(CITED_FILE)
		expect(actions.openImage).not.toHaveBeenCalled()
	})

	it("opens nothing for a path outside the attachment store", async () => {
		const actions = actionsSpy()
		renderCitation(`Read [the brief](<${OUTSIDE_THE_STORE}>) first.`, actions)

		await click(screen.getByRole("button", { name: "Open the brief" }))

		expect(openAttachment).not.toHaveBeenCalled()
		expect(actions.openImage).not.toHaveBeenCalled()
	})

	it("keeps an image outside the attachment store as its label", async () => {
		renderCitation(`![Harbour chart](<${OUTSIDE_THE_STORE}.png>)`, null)

		expect(await screen.findByText("Harbour chart")).toBeTruthy()
		expect(screen.queryByRole("img")).toBeNull()
	})
})

describe("a stored message carrying the attachments block", () => {
	it("still shows its files as chips in the attachments row", () => {
		const stored = `Have a look\n\n${attachmentBlock(
			[CITED_IMAGE, CITED_FILE],
			new Date("2026-09-18T10:15:30Z"),
		)}`
		render(createElement(TurnBody, messageWithAttachments(stored)))

		expect(
			screen.getByRole("button", {
				name: `Open ${CITED_FILE.split("/").at(-1)}`,
			}),
		).toBeTruthy()
		expect(
			screen.getByRole("button", {
				name: `Open ${CITED_IMAGE.split("/").at(-1)}`,
			}),
		).toBeTruthy()
		expect(screen.getByText("Have a look")).toBeTruthy()
		expect(screen.queryByText(/Attached to this message/)).toBeNull()
	})
})
