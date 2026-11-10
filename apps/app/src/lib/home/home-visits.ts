import { i18n } from "@workspace/ui/lib/i18n"

import { createRoomLog, type HomeRoomLineModel } from "./home-room-lines"

import type { TranscriptStore } from "@/lib/conversations/store-port"
import { describeFailure, failureReporterIn } from "@/lib/failure-report"

export type HomeArchive = {
	conversationId: string
	lastActiveAt: number
}

export type HomeVisit = {
	openedAt: number
	isSettled: boolean
	archive: HomeArchive | null
	isBandDismissed: boolean
}

export type HomeVisitsState = Readonly<Record<string, HomeVisit>>

export type HomeVisits = {
	open: (botId: string, spaceId: string) => Promise<void>
	dismissBand: (botId: string, spaceId: string | null) => void
	roomLinesOf: (
		botId: string,
		spaceId: string | null,
		workingIds: string[],
	) => HomeRoomLineModel[]
	getState: () => HomeVisitsState
	subscribe: (listener: () => void) => () => void
}

type VisitingStore = Pick<
	TranscriptStore,
	"mainChat" | "renewMainChat" | "loadPage"
>

const reportRenewal = failureReporterIn("home-visits")

export const MAIN_CHAT_PAUSE_MS = 3_600_000

const homeKeyOf = (botId: string, spaceId: string | null) =>
	`${spaceId}:${botId}`

export const visitOf = (
	visits: HomeVisitsState,
	botId: string,
	spaceId: string | null,
): HomeVisit | null =>
	spaceId === null ? null : (visits[homeKeyOf(botId, spaceId)] ?? null)

const raiseRenewalFailure = (reason: unknown) => {
	void reportRenewal({
		title: i18n.t("bots:roster.previewUnreadable"),
		description: describeFailure(reason),
	})
}

export const createHomeVisits = (
	store: VisitingStore,
	now: () => number = () => Date.now(),
): HomeVisits => {
	const openings = new Map<string, Promise<void>>()
	const listeners = new Set<() => void>()
	const roomLog = createRoomLog()
	let visits: HomeVisitsState = {}

	const write = (key: string, visit: HomeVisit) => {
		visits = { ...visits, [key]: visit }
		for (const listener of [...listeners]) {
			listener()
		}
	}

	const update = (key: string, change: Partial<HomeVisit>) => {
		const visit = visits[key]
		if (visit) {
			write(key, { ...visit, ...change })
		}
	}

	const archiveOnOpening = async (
		botId: string,
		spaceId: string,
		previous: HomeArchive | null,
	) => {
		const chat = await store.mainChat(botId, spaceId)
		const { messages } = await store.loadPage(chat.id, null)
		const lastMessage = messages.at(-1)
		if (!lastMessage) {
			return previous
		}
		if (now() - lastMessage.createdAt <= MAIN_CHAT_PAUSE_MS) {
			return null
		}
		await store.renewMainChat(botId, spaceId)
		return { conversationId: chat.id, lastActiveAt: chat.updatedAt }
	}

	const openOnce = async (key: string, botId: string, spaceId: string) => {
		const previous = visits[key] ?? {
			openedAt: now(),
			isSettled: false,
			archive: null,
			isBandDismissed: false,
		}
		write(key, { ...previous, isSettled: false })
		try {
			update(key, {
				archive: await archiveOnOpening(botId, spaceId, previous.archive),
			})
		} catch (reason) {
			raiseRenewalFailure(reason)
		}
		update(key, { isSettled: true })
	}

	const open = (botId: string, spaceId: string) => {
		const key = homeKeyOf(botId, spaceId)
		const held =
			openings.get(key) ??
			openOnce(key, botId, spaceId).finally(() => openings.delete(key))
		openings.set(key, held)
		return held
	}

	return {
		open,
		dismissBand: (botId, spaceId) =>
			update(homeKeyOf(botId, spaceId), { isBandDismissed: true }),
		roomLinesOf: (botId, spaceId, workingIds) =>
			roomLog.linesOf(homeKeyOf(botId, spaceId), workingIds),
		getState: () => visits,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}
