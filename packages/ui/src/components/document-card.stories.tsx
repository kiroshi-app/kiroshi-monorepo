import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import { DocumentCard } from "@workspace/ui/components/document-card"
import {
	DOCUMENT_CARD_BODY,
	DOCUMENT_CARD_DETAIL,
	DOCUMENT_CARD_EXCERPT,
	DOCUMENT_CARD_TITLE,
	DOCUMENT_CARD_WRITERS,
} from "@workspace/ui/components/document-card.fixtures"
import { LIBRARY_AGENTS } from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentBody } from "@workspace/ui/components/library-document-view"

const LONG_TITLE =
	"Spring launch brief for every team of the Space, with the copy, the screenshots and the release notes"

const meta = preview.meta({
	title: "Conversation/Message/DocumentCard",
	component: DocumentCard,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A Library document posted in a conversation. Folded, it shows its head, a three-line excerpt and two actions: Show, a disclosure that unfolds the read-only document in place, and Open, which hands the document to `onOpen`. The unfolded body is a slot the app fills with the read-only document; `isSelected` draws the Space accent ring while the document is open in DocumentPanel.",
			},
		},
	},
	args: {
		title: DOCUMENT_CARD_TITLE,
		detail: DOCUMENT_CARD_DETAIL,
		excerpt: DOCUMENT_CARD_EXCERPT,
		onOpen: fn(),
		children: <LibraryDocumentBody body={DOCUMENT_CARD_BODY} />,
	},
	render: (args) => (
		<div className="w-140 bg-background p-6" {...hueScopeOf("blue")}>
			<DocumentCard {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A document an agent posted, folded, as artboard 2b draws it. Check the clamped excerpt, that Show is a collapsed disclosure controlling the body, and that Open calls `onOpen`. Pick `UnfoldedLive` for the document read in place while an agent writes in it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const show = canvas.getByRole("button", { name: "Show" })
		await expect(show).toHaveAttribute("aria-expanded", "false")
		const body = document.getElementById(
			show.getAttribute("aria-controls") ?? "",
		)
		await expect(body).toHaveTextContent(DOCUMENT_CARD_EXCERPT)
		await expect(canvas.getByText(DOCUMENT_CARD_DETAIL)).toBeVisible()

		await userEvent.click(canvas.getByRole("button", { name: "Open" }))
		await expect(args.onOpen).toHaveBeenCalledOnce()
	},
})

export const UnfoldedLive = meta.story({
	args: {
		writer: { kind: "agent", agent: LIBRARY_AGENTS.atlas },
		children: (
			<LibraryDocumentBody
				body={DOCUMENT_CARD_BODY}
				writers={DOCUMENT_CARD_WRITERS}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The card unfolded in place while Atlas writes in the document, as artboard 2c draws it. Check that Show turned into an expanded Hide, that the detail line reads the live copy, that the writer chip sits in the head and that the agent caret with its name tag ends the run being written. Pick `Default` for the folded card.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Show" }))

		const hide = canvas.getByRole("button", { name: "Hide" })
		await expect(hide).toHaveAttribute("aria-expanded", "true")
		await expect(
			canvas.getByText("Document · read-only here · updates live"),
		).toBeVisible()

		const body = document.getElementById(
			hide.getAttribute("aria-controls") ?? "",
		)
		if (!body) throw new Error("Hide controls no body")
		await expect(within(body).getByText("Before the 14th")).toBeVisible()
		await expect(
			body.querySelector('[data-slot="library-document-caret"]'),
		).not.toBeNull()

		const chip = canvasElement.querySelector<HTMLElement>(
			'[data-slot="document-card-writer"]',
		)
		await expect(chip).toHaveTextContent("Atlas is writing")
	},
})

export const LongContent = meta.story({
	args: {
		title: LONG_TITLE,
		writer: { kind: "person", name: "Ada Martin" },
	},
	render: (args) => (
		<div className="w-80 bg-background p-4" {...hueScopeOf("blue")}>
			<DocumentCard {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A title far longer than the card, in a 320 wide container, with a person writing. Check that the title holds one line and ends on an ellipsis, that the writer chip keeps its place, and that nothing overflows the card.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const title = canvas.getByRole("heading", { name: LONG_TITLE })
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(getComputedStyle(title).textOverflow).toBe("ellipsis")

		const card = canvasElement.querySelector<HTMLElement>(
			'[data-slot="document-card"]',
		)
		if (!card) throw new Error("No card drawn")
		await expect(card.scrollWidth).toBe(card.clientWidth)
		await expect(canvas.getByText("Ada Martin is writing")).toBeVisible()
	},
})
