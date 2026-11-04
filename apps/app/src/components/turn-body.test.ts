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

import { AnswerBody } from "@/components/turn-body"
import {
	type AnswerActions,
	AnswerActionsContext,
} from "@/lib/chat/answer-actions"

afterEach(cleanup)

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
	imageActions: { onSaveToLibrary: vi.fn(), onCopyImage: vi.fn() },
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
