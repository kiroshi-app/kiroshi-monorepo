import type {
	LibraryDocumentAgent,
	LibraryDocumentEdit,
	LibraryDocumentFinished,
	LibraryDocumentPerson,
	LibraryDocumentWriter,
} from "@workspace/ui/components/library-document-agents"

import type { LibraryWriter } from "../bindings"
import type { Bot } from "../conversations/store-contract"
import { avatarSrc } from "../host/index"

export const LIBRARY_DOCUMENT_PRESENCE_EVENT = "library://document-presence"

export const LIBRARY_DOCUMENT_WRITER_FINISHED_EVENT =
	"library://document-writer-finished"

export type AgentSeat = {
	id: string
	name: string | null
	startCaret: string
	caret: string
	firstSeenAt: number
	lastSeenAt: number
}

export type CaretPlacedDocument = {
	markdown: string
	offsetOf: (caret: string) => number | null
}

type WritersInput = {
	seats: AgentSeat[]
	bots: Bot[]
	document: CaretPlacedDocument
	title: string
}

type FinishedInput = {
	seat: AgentSeat
	bots: Bot[]
	document: CaretPlacedDocument
}

type Span = {
	start: number
	end: number
}

const HEADING = /^#{1,6}\s+(.+)$/

const SENTENCE_END = /(?<=[.!?…])\s+/

export const seatsAfter = (
	seats: AgentSeat[],
	writers: LibraryWriter[],
	seenAt: number,
): AgentSeat[] =>
	writers
		.filter(({ kind }) => kind === "agent")
		.map(({ id, name, caret }) => {
			const seated = seats.find((seat) => seat.id === id)
			return {
				id,
				name,
				caret,
				startCaret: seated?.startCaret ?? caret,
				firstSeenAt: seated?.firstSeenAt ?? seenAt,
				lastSeenAt: seenAt,
			}
		})

export const peopleOf = (
	seats: LibraryWriter[],
	document: CaretPlacedDocument,
): LibraryDocumentPerson[] =>
	seats.flatMap(({ id, name, caret }) => {
		const offset = document.offsetOf(caret)
		return offset === null ? [] : [{ id, name: name ?? "", caret: offset }]
	})

export const agentNameOf = (id: string, fallback: string, bots: Bot[]) =>
	bots.find((bot) => bot.id === id)?.name ?? fallback

const agentOf = (seat: AgentSeat, bots: Bot[]): LibraryDocumentAgent => {
	const bot = bots.find(({ id }) => id === seat.id)
	return {
		id: seat.id,
		name: bot?.name ?? seat.name ?? "",
		hue: bot?.avatarBlot,
		image: avatarSrc(bot?.avatarImagePath ?? null),
	}
}

const sectionBefore = (markdown: string, offset: number) =>
	markdown
		.slice(0, offset)
		.split("\n")
		.reverse()
		.map((line) => HEADING.exec(line)?.[1])
		.find((heading) => heading !== undefined)

const sentenceCountOf = (text: string) =>
	text.split(SENTENCE_END).filter((sentence) => sentence.trim() !== "").length

const elapsedSecondsOf = (seat: AgentSeat) =>
	Math.round((seat.lastSeenAt - seat.firstSeenAt) / 1000)

const spanOf = (
	seat: AgentSeat,
	document: CaretPlacedDocument,
): Span | null => {
	const start = document.offsetOf(seat.startCaret)
	const end = document.offsetOf(seat.caret)
	return start === null || end === null ? null : { start, end }
}

export const writersOf = ({
	seats,
	bots,
	document,
	title,
}: WritersInput): LibraryDocumentWriter[] =>
	seats.flatMap((seat) => {
		const span = spanOf(seat, document)
		if (!span) {
			return []
		}
		return [
			{
				agent: agentOf(seat, bots),
				...span,
				elapsedSeconds: elapsedSecondsOf(seat),
				sentenceCount: sentenceCountOf(
					document.markdown.slice(span.start, span.end),
				),
				section: sectionBefore(document.markdown, span.start) ?? title,
			},
		]
	})

export const finishedOf = ({
	seat,
	bots,
	document,
}: FinishedInput): LibraryDocumentFinished | undefined => {
	const span = spanOf(seat, document)
	if (!span) {
		return undefined
	}
	return {
		edits: [{ agent: agentOf(seat, bots), ...span }],
		sentenceCount: sentenceCountOf(
			document.markdown.slice(span.start, span.end),
		),
		elapsedSeconds: elapsedSecondsOf(seat),
	}
}

export const withoutEdits = (markdown: string, edits: LibraryDocumentEdit[]) =>
	[...edits]
		.sort((first, second) => second.start - first.start)
		.reduce(
			(text, { start, end }) => text.slice(0, start) + text.slice(end),
			markdown,
		)
