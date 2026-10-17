import type { MissionBot } from "@workspace/ui/components/mission"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import type {
	SearchKind,
	SearchPaletteResult,
	SearchRestingGroup,
	SearchResultGroup,
	SearchTab,
} from "@workspace/ui/components/search-palette"
import type { SearchResultIdentity } from "@workspace/ui/components/search-result-row"
import { i18n } from "@workspace/ui/lib/i18n"

import type {
	CatalogueChat,
	CatalogueMission,
	CatalogueRoutine,
} from "./catalogue-contract"
import type { MessageHit } from "./search-contract"
import { markedTitle } from "./search-fold"
import type { SearchRow, SearchTarget } from "./search-navigation"
import type { SearchRead } from "./use-search-reads"

import { rosterTimestamp } from "@/lib/bots/roster-timestamp"
import { faceOfBot, type ThreadFace } from "@/lib/chat/thread-contract"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import { toMissionFace } from "@/lib/missions/mission-thread-model"
import { badgeOfMissionState } from "@/lib/missions/missions-model"

const SHOWN_PER_KIND = 3

export type SearchLookups = {
	faceOf: (botId: string) => ThreadFace | undefined
	conversationOf: (conversationId: string) => Conversation | undefined
	readerName: string
	now: number
}

export type SearchLookupSource = {
	rosters: Record<string, Bot[]>
	conversationRosters: Record<string, Conversation[]>
	readerName: string
	now: number
}

export const createSearchLookups = ({
	rosters,
	conversationRosters,
	readerName,
	now,
}: SearchLookupSource): SearchLookups => {
	const faces = new Map(
		Object.values(rosters).flatMap((bots) =>
			bots.map((bot) => [bot.id, faceOfBot(bot)] as const),
		),
	)
	const conversations = new Map(
		Object.values(conversationRosters).flatMap((rows) =>
			rows.map((conversation) => [conversation.id, conversation] as const),
		),
	)

	return {
		faceOf: (botId) => faces.get(botId),
		conversationOf: (conversationId) => conversations.get(conversationId),
		readerName,
		now,
	}
}

const botFaceOf = (botId: string, lookups: SearchLookups): MissionBot =>
	toMissionFace(lookups.faceOf(botId) ?? { id: botId, name: "" })

const soloPart = () => ({ key: "kind", text: i18n.t("search:solo") })

const rowOfChat = (chat: CatalogueChat): SearchRow | null => {
	if (chat.kind === "topic") {
		return { kind: "conversation", id: chat.conversationId }
	}
	return chat.kind === "main" && chat.botId
		? { kind: "bot", id: chat.botId }
		: null
}

const rowOfRoutine = (
	routine: CatalogueRoutine,
	lookups: SearchLookups,
): SearchRow =>
	lookups.conversationOf(routine.conversationId)
		? { kind: "conversation", id: routine.conversationId }
		: { kind: "bot", id: routine.botId }

const identityOfChat = (
	chat: CatalogueChat,
	lookups: SearchLookups,
): SearchResultIdentity => {
	if (chat.kind === "main" && chat.botId) {
		return { kind: "chat-solo", bot: botFaceOf(chat.botId, lookups) }
	}
	return { kind: "chat-group" }
}

const identityOfMessage = (
	hit: MessageHit,
	lookups: SearchLookups,
): SearchResultIdentity =>
	hit.authorBotId
		? { kind: "message", bot: botFaceOf(hit.authorBotId, lookups) }
		: { kind: "message-from-you", reader: lookups.readerName }

const authorNameOf = (hit: MessageHit, lookups: SearchLookups): string =>
	hit.authorBotId
		? (lookups.faceOf(hit.authorBotId)?.name ?? "")
		: lookups.readerName

const messageRowOf = (
	hit: MessageHit,
	botOfSoloChat: Map<string, string>,
): SearchRow | null => {
	if (hit.conversationKind === "topic") {
		return { kind: "conversation", id: hit.conversationId }
	}
	if (hit.conversationKind === "mission") {
		return null
	}
	const botId = hit.authorBotId ?? botOfSoloChat.get(hit.conversationId)
	return botId ? { kind: "bot", id: botId } : null
}

type ResultOpening = (target: SearchTarget) => void

const toMessageResult = (
	hit: MessageHit,
	row: SearchRow,
	lookups: SearchLookups,
	open: ResultOpening,
): SearchPaletteResult => ({
	id: `message-${hit.messageId}`,
	identity: identityOfMessage(hit, lookups),
	title: hit.snippet.map((part, index) => ({
		key: `${index}`,
		text: part.text,
		isMatch: part.matched,
	})),
	timestamp: rosterTimestamp(hit.createdAt, lookups.now),
	parts: [
		{ key: "author", text: authorNameOf(hit, lookups) },
		hit.conversationKind === "main"
			? soloPart()
			: { key: "conversation", text: hit.conversationTitle },
	],
	onOpen: () =>
		open({
			kind: "chat",
			row,
			spaceId: hit.spaceId,
			landing: {
				conversationId: hit.conversationId,
				messageId: hit.messageId,
				seq: hit.seq,
			},
		}),
})

const toChatResult = (
	chat: CatalogueChat,
	row: SearchRow,
	query: string,
	lookups: SearchLookups,
	open: ResultOpening,
): SearchPaletteResult => ({
	id: `chat-${chat.conversationId}`,
	identity: identityOfChat(chat, lookups),
	title: markedTitle(chat.title, query),
	timestamp: "",
	parts: [
		chat.kind === "main"
			? soloPart()
			: { key: "participants", text: chat.participants.join(", ") },
	],
	onOpen: () => open({ kind: "chat", row, spaceId: chat.spaceId }),
})

const identityOfMission = (
	mission: CatalogueMission,
	lookups: SearchLookups,
): SearchResultIdentity => ({
	kind: "mission",
	bot: botFaceOf(mission.botId, lookups),
	badge: badgeOfMissionState(mission.state) ?? undefined,
	mark: missionTicketPlatform(mission.ticketPlatform).Mark,
})

const toMissionResult = (
	mission: CatalogueMission,
	query: string,
	lookups: SearchLookups,
	open: ResultOpening,
): SearchPaletteResult => ({
	id: `mission-${mission.id}`,
	identity: identityOfMission(mission, lookups),
	title: markedTitle(mission.objective, query),
	timestamp: "",
	identifier: mission.ticketExternalId,
	parts: [{ key: "ticket", text: mission.ticketTitle }],
	onOpen: () =>
		open({
			kind: "mission",
			missionId: mission.id,
			botId: mission.botId,
			spaceId: mission.spaceId,
		}),
})

const toRoutineResult = (
	routine: CatalogueRoutine,
	query: string,
	lookups: SearchLookups,
	open: ResultOpening,
): SearchPaletteResult => ({
	id: `routine-${routine.id}`,
	identity: { kind: "routine", bot: botFaceOf(routine.botId, lookups) },
	title: markedTitle(routine.title, query),
	timestamp: "",
	parts: [{ key: "expression", text: routine.expression ?? "" }],
	onOpen: () =>
		open({
			kind: "routine",
			routineId: routine.id,
			row: rowOfRoutine(routine, lookups),
			conversationId: routine.conversationId,
			spaceId: routine.spaceId,
		}),
})

const soloChatBots = (chats: CatalogueChat[]): Map<string, string> =>
	new Map(
		chats.flatMap((chat) =>
			chat.kind === "main" && chat.botId
				? [[chat.conversationId, chat.botId] as const]
				: [],
		),
	)

const groupOf = (
	kind: SearchResultGroup["kind"],
	results: SearchPaletteResult[],
): SearchResultGroup => ({ kind, total: results.length, results })

export type SearchGrouping = {
	read: SearchRead
	recents: CatalogueChat[]
	query: string
	lookups: SearchLookups
	open: ResultOpening
}

export const toSearchGroups = ({
	read,
	recents,
	query,
	lookups,
	open,
}: SearchGrouping): SearchResultGroup[] => {
	const botOfSoloChat = soloChatBots([...read.chats, ...recents])

	return [
		groupOf(
			"messages",
			read.messages.flatMap((hit) => {
				const row = messageRowOf(hit, botOfSoloChat)
				return row ? [toMessageResult(hit, row, lookups, open)] : []
			}),
		),
		groupOf(
			"chats",
			read.chats.flatMap((chat) => {
				const row = rowOfChat(chat)
				return row ? [toChatResult(chat, row, query, lookups, open)] : []
			}),
		),
		groupOf(
			"missions",
			read.missions.map((mission) =>
				toMissionResult(mission, query, lookups, open),
			),
		),
		groupOf(
			"routines",
			read.routines.map((routine) =>
				toRoutineResult(routine, query, lookups, open),
			),
		),
	]
}

export type SearchResting = {
	read: SearchRead
	recents: CatalogueChat[]
	lookups: SearchLookups
	open: ResultOpening
}

export const toRestingGroups = ({
	read,
	recents,
	lookups,
	open,
}: SearchResting): SearchRestingGroup[] => {
	const groups: SearchRestingGroup[] = [
		{
			kind: "chats",
			results: recents.flatMap((chat) => {
				const row = rowOfChat(chat)
				return row ? [toChatResult(chat, row, "", lookups, open)] : []
			}),
		},
		{
			kind: "missions",
			results: read.missions.map((mission) =>
				toMissionResult(mission, "", lookups, open),
			),
		},
		{
			kind: "routines",
			results: read.routines.map((routine) =>
				toRoutineResult(routine, "", lookups, open),
			),
		},
	]

	return groups.filter((group) => group.results.length > 0)
}

type ShownGroup = {
	kind: SearchKind
	results: SearchPaletteResult[]
}

const shownFor = (
	tab: SearchTab,
	groups: ShownGroup[],
): SearchPaletteResult[] =>
	groups
		.filter((group) => tab === "all" || group.kind === tab)
		.flatMap((group) =>
			tab === "all" ? group.results.slice(0, SHOWN_PER_KIND) : group.results,
		)

export type VisibleOrder = {
	query: string
	tab: SearchTab
	groups: SearchResultGroup[]
	resting: SearchRestingGroup[]
}

export const visibleResults = ({
	query,
	tab,
	groups,
	resting,
}: VisibleOrder): SearchPaletteResult[] =>
	shownFor(tab, query === "" ? resting : groups)
