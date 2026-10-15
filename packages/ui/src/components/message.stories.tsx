import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	lineHeightOf,
	listExhaustively,
} from "@workspace/storybook/story-utils"
import {
	Message,
	MessageAuthor,
	MessageContent,
	MessageFooter,
	type MessageFrom,
	MessageHeader,
} from "@workspace/ui/components/message"

const MESSAGE_FROM = listExhaustively<MessageFrom>({
	assistant: true,
	user: true,
})

const AUTHORS: Record<MessageFrom, string> = {
	assistant: "Kiroshi",
	user: "Ada Martin",
}

const SHORT_MESSAGES: Record<MessageFrom, string> = {
	assistant: "Synced. Your three devices are up to date, the queue is empty.",
	user: "Can you sync the Da Lat nest before the standup?",
}

const AUTHORED: { author: MessageAuthor; message: string }[] = [
	{
		author: { id: "bot-atlas", name: "Atlas", isLead: true },
		message:
			"I own this thread. Basile takes the migration, I keep the release notes.",
	},
	{
		author: { id: "bot-basile", name: "Basile" },
		message: "Migration is green on a fresh database. Notes are yours.",
	},
	{
		author: { id: "bot-elia", name: "Elia", isDeleted: true },
		message: "The fixture I left behind still reads the old column names.",
	},
]

const LONG_REPLY =
	"The sync finished, but two devices needed a full pass instead of the usual delta: the Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself. Nothing was lost, and the eleven pending edits were replayed in the order they were written."

const Transcript = ({ children }: { children: ReactNode }) => (
	<div className="mx-auto flex w-full max-w-xl flex-col gap-4">{children}</div>
)

const meta = preview.meta({
	title: "Conversation/Message/Message",
	component: Message,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One row of a conversation: every row reads from the start edge, the user's included, with a single content column holding metadata above the text and a status line under it. `packages/ui/src/components/turn.tsx:464` and `packages/ui/src/components/application-install-turn.tsx:72` are the two callers, and both hand it one `MessageContent` and nothing else. Reach for it whenever a transcript needs a speaker, never to lay out a single standalone block of copy.",
			},
		},
	},
	args: {
		from: "assistant",
		children: SHORT_MESSAGES.assistant,
	},
	argTypes: {
		from: { control: "inline-radio", options: MESSAGE_FROM },
		children: { control: "text" },
	},
	render: ({ children, ...args }) => (
		<Transcript>
			<Message {...args}>
				<MessageContent>
					<MessageHeader>{AUTHORS[args.from]}</MessageHeader>
					<p className="max-w-md">{children}</p>
				</MessageContent>
			</Message>
		</Transcript>
	),
})

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The only visual axis of the component: `from`. `packages/ui/src/components/turn.tsx:334` mounts the reader row and `packages/ui/src/components/turn.tsx:464` the companion one. Check that both rows hug the start edge: `from` names the speaker for assistive technology and no longer flips the row.",
			},
		},
	},
	render: () => (
		<Transcript>
			{MESSAGE_FROM.map((from) => (
				<Message key={from} from={from}>
					<MessageContent>
						<MessageHeader>{AUTHORS[from]}</MessageHeader>
						<p className="max-w-md">{SHORT_MESSAGES[from]}</p>
					</MessageContent>
				</Message>
			))}
		</Transcript>
	),
	play: async ({ canvas }) => {
		const rows = canvas.getAllByRole("article")

		await expect(rows).toHaveLength(MESSAGE_FROM.length)
		await expect(rows[0]).toHaveAccessibleName("assistant message")
		await expect(rows[1]).toHaveAccessibleName("user message")
	},
})

export const WithMetadata = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The author above the text and the status line under it, the two slots `packages/ui/src/components/turn.tsx:474` and `packages/ui/src/components/turn.tsx:514` fill when a turn was stopped or is still waiting to be sent. Check that the metadata stays on the same edge as its message and never pushes the text out of its column.",
			},
		},
	},
	render: () => (
		<Transcript>
			<Message from="user">
				<MessageContent>
					<p className="max-w-md">{SHORT_MESSAGES.user}</p>
					<MessageFooter>Waiting to be sent</MessageFooter>
				</MessageContent>
			</Message>
			<Message from="assistant">
				<MessageContent>
					<MessageHeader>{AUTHORS.assistant}</MessageHeader>
					<p className="max-w-md">{SHORT_MESSAGES.assistant}</p>
					<MessageFooter>Stopped</MessageFooter>
				</MessageContent>
			</Message>
		</Transcript>
	),
})

export const LongContent = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One block long enough to wrap, as `apps/app/src/lib/chat/screen-model.ts:101` hands it over — a row carries exactly one of the blocks `apps/app/src/lib/chat/markdown-blocks.ts:56` split on the blank lines, never two — next to the one-line question that triggered it. Check that the long row wraps inside its own column instead of stretching the transcript, and that the link is the first tab stop — `Variants` covers short copy where wrapping never happens.",
			},
		},
	},
	render: () => (
		<Transcript>
			<Message from="user">
				<MessageContent>
					<p className="max-w-md">{SHORT_MESSAGES.user}</p>
				</MessageContent>
			</Message>
			<Message from="assistant">
				<MessageContent>
					<MessageHeader>{AUTHORS.assistant}</MessageHeader>
					<p className="max-w-md">{LONG_REPLY}</p>
					<MessageFooter>
						<a
							href="#message-sync-log"
							className="underline underline-offset-4"
						>
							Open the sync log
						</a>
					</MessageFooter>
				</MessageContent>
			</Message>
		</Transcript>
	),
	play: async ({ canvas, userEvent }) => {
		const link = canvas.getByRole("link", { name: "Open the sync log" })

		await userEvent.tab()
		await expect(link).toHaveFocus()
	},
})

export const Authors = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A conversation with more than one companion in it, where a row must say who is speaking: `packages/ui/src/components/turn.tsx:390` draws that line from the author `apps/app/src/components/thread-screen.tsx:629` resolves. The name, then a mark for the two things a name alone cannot say — a crown for the companion that leads, a bin for an author deleted since it wrote. Both are icons, and both carry the word behind them where only a reader who hovers or listens finds it, so the line stays short while nothing is left to colour or shape alone. Check that the crown sits on exactly one row, and that the deleted author is dimmed while its message stays as readable as any other.",
			},
		},
	},
	render: () => (
		<Transcript>
			{AUTHORED.map(({ author, message }) => (
				<Message key={author.id} from="assistant">
					<MessageContent>
						<MessageAuthor author={author} />
						<p className="max-w-md">{message}</p>
					</MessageContent>
				</Message>
			))}
		</Transcript>
	),
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvasElement.querySelectorAll('[data-slot="message-author-lead"]'),
		).toHaveLength(1)
		await expect(canvas.getByText("Lead")).toBeInTheDocument()

		const deleted = canvasElement.querySelector(
			'[data-slot="message-author-deleted"]',
		)

		await expect(deleted).toHaveAttribute("title", "Deleted companion")
		await expect(deleted).toHaveTextContent("Deleted companion")
	},
})

const LONG_TITLE = "Release manager for the whole desktop platform"

export const AuthorWithLongTitle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"An author whose title runs far past the width the header once allowed it. Check that the whole title is drawn with no ellipsis while the line has room, on one line beside the name. Pick `Authors` for the everyday line.",
			},
		},
	},
	render: () => (
		<Transcript>
			<Message from="assistant">
				<MessageContent>
					<MessageAuthor
						author={{ id: "bot-atlas", name: "Atlas", title: LONG_TITLE }}
					/>
					<p className="max-w-md">{SHORT_MESSAGES.assistant}</p>
				</MessageContent>
			</Message>
		</Transcript>
	),
	play: async ({ canvasElement }) => {
		const header = canvasElement.querySelector<HTMLElement>(
			'[data-slot="message-author"]',
		)
		const title = header?.querySelector<HTMLElement>(
			'[data-slot="bot-title-badge"]',
		)
		if (!header || !title) throw new Error("The header drew no title")

		await expect(title).toHaveTextContent(LONG_TITLE)
		await expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
		await expect(header.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(header.firstElementChild as Element),
		)
	},
})
