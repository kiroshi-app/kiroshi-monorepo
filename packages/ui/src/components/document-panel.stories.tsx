import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { DocumentCard } from "@workspace/ui/components/document-card"
import {
	DOCUMENT_CARD_BODY,
	DOCUMENT_CARD_DETAIL,
	DOCUMENT_CARD_EXCERPT,
	DOCUMENT_CARD_TITLE,
	DOCUMENT_CARD_WRITERS,
} from "@workspace/ui/components/document-card.fixtures"
import { DocumentPanel } from "@workspace/ui/components/document-panel"
import { LIBRARY_AGENTS } from "@workspace/ui/components/library.fixtures"
import { LibraryDocumentPresence } from "@workspace/ui/components/library-document-agents"
import { LibraryDocumentBody } from "@workspace/ui/components/library-document-view"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import type { RosterBot } from "@workspace/ui/components/roster"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"

const ATLAS: RosterBot = {
	id: LIBRARY_AGENTS.atlas.id,
	name: LIBRARY_AGENTS.atlas.name,
	blot: BLOT_HUES.blue,
}

const onOpenCard = fn()

const ROWS: TranscriptItem[] = [
	{
		key: "question",
		render: () => <UserTurn>Draft the spring launch brief.</UserTurn>,
	},
	{
		key: "answer",
		render: () => (
			<AssistantTurn identity={ATLAS}>
				<DocumentCard
					detail={DOCUMENT_CARD_DETAIL}
					excerpt={DOCUMENT_CARD_EXCERPT}
					isSelected
					onOpen={onOpenCard}
					title={DOCUMENT_CARD_TITLE}
					writer={{ kind: "agent", agent: LIBRARY_AGENTS.atlas }}
				>
					<LibraryDocumentBody body={DOCUMENT_CARD_BODY} />
				</DocumentCard>
			</AssistantTurn>
		),
	},
]

const meta = preview.meta({
	title: "Navigation/DocumentPanel",
	component: DocumentPanel,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A Library document opened beside the thread, 600 wide and full height. The bar carries the document's title, the presence chip of whoever writes in it, Open in Library and Close; the column below scrolls and holds the title, then the editor, which the app passes as children. ThreadLayout takes it through its `aside` slot.",
			},
		},
	},
	args: {
		title: DOCUMENT_CARD_TITLE,
		presence: <LibraryDocumentPresence writers={DOCUMENT_CARD_WRITERS} />,
		onOpenInLibrary: fn(),
		onClose: fn(),
		children: (
			<LibraryDocumentBody
				body={DOCUMENT_CARD_BODY}
				writers={DOCUMENT_CARD_WRITERS}
			/>
		),
	},
	render: (args) => (
		<div className="flex h-200 w-320" {...hueScopeOf("blue")}>
			<ThreadLayout
				aside={<DocumentPanel {...args} />}
				composer={<PromptInput onSubmit={fn()} />}
				rows={ROWS}
			>
				{null}
			</ThreadLayout>
		</div>
	),
})

export const InThread = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The document of a card open beside the conversation that posted it, as artboard 2d draws it. Check that the card wears the Space accent ring, that the panel sits at the end of the thread at full height, that the bar shows one agent writing, and that Open in Library and Close call their callbacks.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const panel = canvas.getByRole("complementary", {
			name: DOCUMENT_CARD_TITLE,
		})
		const thread = canvasElement.querySelector<HTMLElement>(
			'[data-slot="chat-layout"]',
		)
		if (!thread) throw new Error("No thread drawn")
		const panelBox = panel.getBoundingClientRect()
		await expect(panelBox.width).toBe(600)
		await expect(panelBox.left).toBe(thread.getBoundingClientRect().right)
		await expect(panelBox.height).toBe(thread.getBoundingClientRect().height)

		const card = canvasElement.querySelector<HTMLElement>(
			'[data-slot="document-card"]',
		)
		await expect(card).toHaveAttribute("data-selected", "true")
		await expect(card ? getComputedStyle(card).boxShadow : "none").not.toBe(
			"none",
		)

		await expect(canvas.getByText("1 agent writing")).toBeVisible()
		await userEvent.click(
			canvas.getByRole("button", { name: "Open in Library" }),
		)
		await expect(args.onOpenInLibrary).toHaveBeenCalledOnce()
		await userEvent.click(canvas.getByRole("button", { name: "Close" }))
		await expect(args.onClose).toHaveBeenCalledOnce()
	},
})
