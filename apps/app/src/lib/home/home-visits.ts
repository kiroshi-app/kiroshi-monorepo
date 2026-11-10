import { createRoomLog, type HomeRoomLineModel } from "./home-room-lines"

export type HomeVisit = {
	openedAt: number
	isBandDismissed: boolean
}

export type HomeVisitsState = Readonly<Record<string, HomeVisit>>

export type HomeVisits = {
	open: (botId: string, spaceId: string) => void
	dismissBand: (botId: string, spaceId: string | null) => void
	roomLinesOf: (
		botId: string,
		spaceId: string | null,
		workingIds: string[],
	) => HomeRoomLineModel[]
	getState: () => HomeVisitsState
	subscribe: (listener: () => void) => () => void
}

const homeKeyOf = (botId: string, spaceId: string | null) =>
	`${spaceId}:${botId}`

export const visitOf = (
	visits: HomeVisitsState,
	botId: string,
	spaceId: string | null,
): HomeVisit | null =>
	spaceId === null ? null : (visits[homeKeyOf(botId, spaceId)] ?? null)

export const createHomeVisits = (): HomeVisits => {
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

	return {
		open: (botId, spaceId) => {
			const key = homeKeyOf(botId, spaceId)
			if (!visits[key]) {
				write(key, { openedAt: Date.now(), isBandDismissed: false })
			}
		},
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
