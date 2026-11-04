import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_PAGE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { WebPageCard } from "@workspace/ui/components/answer-blocks/web-page-card"

const meta = preview.meta({
	title: "Conversation/Markdown/WebPageCard",
	component: WebPageCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A preview of a web page the agent read, with its domain, title and an Open as page button. Reach for it when the answer points at one page the reader will want to open whole; an inline link covers a passing reference. The button shows only when `onOpen` is passed.",
			},
		},
	},
	args: {
		domain: "casadorio.pt",
		title: "Casa do Rio · Rooms and rates",
		preview: { src: CASA_DO_RIO_PAGE },
		onOpen: fn(),
	},
	render: (args) => (
		<AgentAnswerFrame intro="The rates for your dates are on their rooms page.">
			<WebPageCard {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 12. A 460 wide card. The preview carries no alt text, so it stays decorative instead of reading the title twice. Check the button reaches `onOpen`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.queryByRole("img")).toBeNull()
		await userEvent.click(canvas.getByRole("button", { name: "Open as page" }))
		await expect(args.onOpen).toHaveBeenCalledOnce()
	},
})

export const ImageMenuSaving = meta.story({
	args: {
		preview: {
			src: CASA_DO_RIO_PAGE,
			alt: "The rooms page of Casa do Rio",
		},
		imageMenu: {
			onSaveToLibrary: fn(),
			onCopyImage: fn(),
			onOpenInViewer: fn(),
		},
		isSavingToLibrary: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The `ImageMenu` open on the preview while it is on its way to the Library. Check Save to Library is disabled while Copy image and Open in viewer still answer.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.pointer({
			keys: "[MouseRight]",
			target: canvas.getByRole("button", {
				name: "The rooms page of Casa do Rio",
			}),
		})
		const menu = within(
			await screen.findByRole("menu", {
				name: "Actions for The rooms page of Casa do Rio",
			}),
		)
		await expect(
			menu.getByRole("menuitem", { name: "Save to Library" }),
		).toHaveAttribute("aria-disabled", "true")
		await expect(
			menu.getByRole("menuitem", { name: "Copy image" }),
		).not.toHaveAttribute("aria-disabled")
		await expect(
			menu.getByRole("menuitem", { name: "Open in viewer" }),
		).not.toHaveAttribute("aria-disabled")
	},
})

export const InNarrowColumn = meta.story({
	args: {
		domain: "reservations.casadorio-lisboa-alfama-riverside.pt",
		title: "CasadoRioRoomsandratesforthefirstweekofMarch",
	},
	render: (args) => (
		<AgentAnswerFrame intro="The rates are on their rooms page." width={320}>
			<WebPageCard {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column, narrower than the 460 card. Check the card shrinks to the column, the domain truncates, the title wraps beside the button, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})

export const WithPreviewAndAltText = meta.story({
	globals: { theme: "dark" },
	args: {
		preview: {
			src: CASA_DO_RIO_PAGE,
			alt: "Casa do Rio rooms page, a river view above the rate table",
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 12. The preview carries alt text, so it reads as an image by that name. Check it spans the card 200 high, cropped to cover, above the footer.",
			},
		},
	},
	play: async ({ canvas }) => {
		const image = canvas.getByRole("img", {
			name: "Casa do Rio rooms page, a river view above the rate table",
		})
		const card = canvas.getByRole("article", {
			name: "Casa do Rio · Rooms and rates",
		})
		const { height, width } = image.getBoundingClientRect()
		await expect(height).toBe(200)
		await expect(width).toBe(card.clientWidth)
		await expect(image).toHaveStyle({ objectFit: "cover" })
		await expect(card.firstElementChild).toBe(image)
	},
})

export const WithoutPreview = meta.story({
	globals: { theme: "dark" },
	args: { preview: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A web page block carries no image. Check the card is the footer alone, with no divider above it and no empty preview area.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("img")).toBeNull()
		const footer = canvas.getByRole("article", {
			name: "Casa do Rio · Rooms and rates",
		}).firstElementChild
		await expect(footer).toHaveStyle({ borderTopWidth: "0px" })
	},
})
