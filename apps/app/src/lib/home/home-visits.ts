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

export const createHomeVisits = (store: VisitingStore): HomeVisits => {
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

	const archivedBy = async (botId: string, spaceId: string) => {
		const previous = await store.mainChat(botId, spaceId)
		const { messages } = await store.loadPage(previous.id, null)
		if (messages.length === 0) {
			return null
		}
		await store.renewMainChat(botId, spaceId)
		return { conversationId: previous.id, lastActiveAt: previous.updatedAt }
	}

	const openOnce = async (key: string, botId: string, spaceId: string) => {
		write(key, {
			openedAt: Date.now(),
			isSettled: false,
			archive: null,
			isBandDismissed: false,
		})
		try {
			update(key, { archive: await archivedBy(botId, spaceId) })
		} catch (reason) {
			raiseRenewalFailure(reason)
		}
		update(key, { isSettled: true })
	}

	const open = (botId: string, spaceId: string) => {
		const key = homeKeyOf(botId, spaceId)
		const held = openings.get(key) ?? openOnce(key, botId, spaceId)
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
