import type {
	LibraryDocumentAgent,
	LibraryDocumentWriter,
} from "@workspace/ui/components/library-document-agents"

import type { LibraryWriter } from "../bindings"
import type { Bot } from "../conversations/store-contract"
import { avatarSrc } from "../host/index"

export const LIBRARY_DOCUMENT_PRESENCE_EVENT = "library://document-presence"

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

export const writersOf = ({
	seats,
	bots,
	document,
	title,
}: WritersInput): LibraryDocumentWriter[] =>
	seats.flatMap((seat) => {
		const start = document.offsetOf(seat.startCaret)
		const end = document.offsetOf(seat.caret)
		if (start === null || end === null) {
			return []
		}
		return [
			{
				agent: agentOf(seat, bots),
				start,
				end,
				elapsedSeconds: Math.round((seat.lastSeenAt - seat.firstSeenAt) / 1000),
				sentenceCount: sentenceCountOf(document.markdown.slice(start, end)),
				section: sectionBefore(document.markdown, start) ?? title,
			},
		]
	})
