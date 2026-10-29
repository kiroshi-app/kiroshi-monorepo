import type { TabDragThumbnailMessage } from "@workspace/ui/components/tab-drag-thumbnail"

import type { TabBot, TabConversation, TabFaceSources } from "./tab-faces"
import { isListPage, pageOf } from "./tab-pages"

import type {
	DragGhostTab,
	TranscriptMessage,
	TranscriptPage,
	WindowSize,
} from "../bindings"
import type { SoloThreads } from "../bots/roster-line"
import type { TranscriptPort } from "../conversations/transcript-port"
import { isTerminalCompletion } from "../conversations/transcript-state"

const GHOST_THUMBNAIL_KEY = "dragGhostThumbnail"

const SHOWN_MESSAGES = 2

export type GhostThumbnail = {
	tabId: string
	size: WindowSize
	companionName: string
	messages: TabDragThumbnailMessage[]
	faces: TabFaceSources
	isNotAllowed: boolean
}

export type ThumbnailConversation = TabConversation & {
	companionName?: string
}

export type GhostSources = {
	bots: TabBot[]
	conversations: ThumbnailConversation[]
	missionTitles: Readonly<Record<string, string>>
	soloThreads: SoloThreads
	spaceId: string | null
	readTranscript: TranscriptPort["loadPage"]
}

const tabConversationOf = ({
	id,
	name,
	icon,
}: ThumbnailConversation): TabConversation => ({ id, name, icon })

const threadOf = (href: string) => {
	const page = pageOf(href)
	return isListPage(page) ? page.thread : {}
}

const facesOf = (
	href: string,
	{ bots, conversations, missionTitles }: GhostSources,
): TabFaceSources => {
	const { bot, conversation, mission } = threadOf(href)
	return {
		bots: bots.filter((held) => held.id === bot),
		conversations: conversations
			.filter((held) => held.id === conversation)
			.map(tabConversationOf),
		missionTitles:
			mission !== undefined && missionTitles[mission] !== undefined
				? { [mission]: missionTitles[mission] }
				: {},
	}
}

const companionNameOf = (
	href: string,
	{ bots, conversations }: GhostSources,
) => {
	const { bot, conversation } = threadOf(href)
	return (
		bots.find((held) => held.id === bot)?.name ??
		conversations.find((held) => held.id === conversation)?.companionName ??
		""
	)
}

const threadConversationIdOf = (
	href: string,
	{ soloThreads, spaceId }: GhostSources,
) => {
	const { bot, conversation, mission } = threadOf(href)
	if (mission !== undefined) {
		return undefined
	}
	if (conversation !== undefined) {
		return conversation
	}
	return Object.entries(soloThreads).find(
		([, line]) => line.botId === bot && line.spaceId === spaceId,
	)?.[0]
}

const isShownMessage = ({ completion, content }: TranscriptMessage) =>
	isTerminalCompletion(completion) && content.trim() !== ""

const thumbnailMessageOf = ({
	id,
	role,
	content,
}: TranscriptMessage): TabDragThumbnailMessage => ({
	id,
	author: role === "assistant" ? "companion" : "user",
	text: content.trim(),
})

const lastMessagesOf = ({
	messages,
}: TranscriptPage): TabDragThumbnailMessage[] =>
	messages.filter(isShownMessage).slice(-SHOWN_MESSAGES).map(thumbnailMessageOf)

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

const isThumbnailMessage = (value: unknown) =>
	isRecord(value) &&
	typeof value.id === "string" &&
	(value.author === "user" || value.author === "companion") &&
	typeof value.text === "string"

const isSize = (value: unknown) =>
	isRecord(value) &&
	typeof value.width === "number" &&
	typeof value.height === "number"

const isFaces = (value: unknown) =>
	isRecord(value) &&
	Array.isArray(value.bots) &&
	Array.isArray(value.conversations) &&
	isRecord(value.missionTitles)

const isGhostThumbnail = (value: unknown): value is GhostThumbnail =>
	isRecord(value) &&
	typeof value.tabId === "string" &&
	isSize(value.size) &&
	typeof value.companionName === "string" &&
	Array.isArray(value.messages) &&
	value.messages.every(isThumbnailMessage) &&
	isFaces(value.faces) &&
	typeof value.isNotAllowed === "boolean"

const parsed = (value: string | null): unknown => {
	try {
		return JSON.parse(value ?? "")
	} catch {
		return null
	}
}

const writeGhostThumbnail = (thumbnail: GhostThumbnail) => {
	localStorage.setItem(GHOST_THUMBNAIL_KEY, JSON.stringify(thumbnail))
}

export const readGhostThumbnail = (): GhostThumbnail | null => {
	const held = parsed(localStorage.getItem(GHOST_THUMBNAIL_KEY))
	return isGhostThumbnail(held) ? held : null
}

const updateGhostThumbnail = (
	tabId: string,
	update: Partial<Pick<GhostThumbnail, "messages" | "isNotAllowed">>,
) => {
	const held = readGhostThumbnail()
	if (held?.tabId === tabId) {
		writeGhostThumbnail({ ...held, ...update })
	}
}

export const setGhostNotAllowed = (tabId: string, isNotAllowed: boolean) =>
	updateGhostThumbnail(tabId, { isNotAllowed })

const reportMessagesFailure = (reason: unknown) => {
	console.error("the drag ghost could not read the last messages", reason)
}

const loadGhostMessages = (ghost: DragGhostTab, sources: GhostSources) => {
	const conversationId = threadConversationIdOf(ghost.href, sources)
	if (conversationId === undefined) {
		return
	}
	void sources
		.readTranscript(conversationId, null)
		.then(
			(page) =>
				updateGhostThumbnail(ghost.tabId, { messages: lastMessagesOf(page) }),
			reportMessagesFailure,
		)
}

export const drawGhost = (
	ghost: DragGhostTab,
	size: WindowSize,
	sources: GhostSources,
): DragGhostTab => {
	writeGhostThumbnail({
		tabId: ghost.tabId,
		size,
		companionName: companionNameOf(ghost.href, sources),
		messages: [],
		faces: facesOf(ghost.href, sources),
		isNotAllowed: false,
	})
	loadGhostMessages(ghost, sources)
	return ghost
}

export const watchGhostThumbnail = (onChange: () => void) => {
	const listener = ({ key }: StorageEvent) => {
		if (key === GHOST_THUMBNAIL_KEY) {
			onChange()
		}
	}
	window.addEventListener("storage", listener)
	return () => window.removeEventListener("storage", listener)
}
