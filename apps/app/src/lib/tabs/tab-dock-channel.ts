import { keptTabOf, tabKeptIn } from "./tabs-mirror"
import type { Tab } from "./tabs-model"

import type { Json } from "../bindings"
import { emitOnThisComputer, listenOnThisComputer } from "../host"

const DOCK_ANSWER_EVENT = "window://tab-dock-answered"

const DOCK_SETTLE_EVENT = "window://tab-dock-settled"

const DOCK_OFFER_EVENT = "window://tab-dock-offered"

const DOCK_ANSWER_TIMEOUT_MS = 2000

const DOCK_SETTLE_TIMEOUT_MS = DOCK_ANSWER_TIMEOUT_MS + 1000

export type DockedTab = {
	originTabId: string
	tab: Tab
}

type DockMove = {
	windowLabel: string
	originTabId: string
}

export type DockMessage = DockMove & {
	isTaken: boolean
}

export type DockOffer = {
	windowLabel: string
	originSpaceId: string
	tab: Json
}

export type DockAnswerFailure =
	| "no answer"
	| "refused by the receiver"
	| "settle lost"

type DockOutcome =
	| { isTaken: true }
	| { isTaken: false; failedStep: DockAnswerFailure }

type DockAnswerAwaited = {
	answer: Promise<DockOutcome>
}

export type DockMessageHeard = {
	heard: Promise<boolean>
	end: (isTaken: boolean) => void
}

export const packDockedTab = (tab: Tab): Json => ({
	originTabId: tab.id,
	kept: keptTabOf(tab),
})

export const unpackDockedTab = (packed: Json): DockedTab | null => {
	if (typeof packed !== "object" || packed === null || Array.isArray(packed)) {
		return null
	}
	const { originTabId, kept } = packed
	const tab = tabKeptIn(kept)
	return typeof originTabId === "string" && tab ? { originTabId, tab } : null
}

const isOfMove = (message: DockMessage, move: DockMove) =>
	message.windowLabel === move.windowLabel &&
	message.originTabId === move.originTabId

const hearFirst = async (
	event: string,
	move: DockMove,
): Promise<DockMessageHeard> => {
	let end: (isTaken: boolean) => void = () => undefined
	const hearing = new Promise<boolean>((resolve) => {
		end = resolve
	})
	const stopListening = await listenOnThisComputer<DockMessage>(
		event,
		({ payload }) => {
			if (isOfMove(payload, move)) {
				end(payload.isTaken)
			}
		},
	)
	return { heard: hearing.finally(stopListening), end }
}

const reportUnsettled = (reason: unknown) => {
	console.error("the tab dock could not be settled", reason)
	return false
}

const settleDock = (settled: DockMessage) =>
	emitOnThisComputer(DOCK_SETTLE_EVENT, settled).then(
		() => true,
		reportUnsettled,
	)

const failedAt = (failedStep: DockAnswerFailure): DockOutcome => ({
	isTaken: false,
	failedStep,
})

const outcomeOf = (isTaken: boolean | null, isSettled: boolean) => {
	if (isTaken === null) {
		return failedAt("no answer")
	}
	if (!isTaken) {
		return failedAt("refused by the receiver")
	}
	return isSettled ? { isTaken } : failedAt("settle lost")
}

const answerWithinBound = ({ heard, end }: DockMessageHeard) => {
	let timeout: ReturnType<typeof setTimeout> | undefined
	const unanswered = new Promise<null>((resolve) => {
		timeout = setTimeout(() => resolve(null), DOCK_ANSWER_TIMEOUT_MS)
	})
	return Promise.race([heard, unanswered]).finally(() => {
		clearTimeout(timeout)
		end(false)
	})
}

export const offerDock = (offer: DockOffer) =>
	emitOnThisComputer(DOCK_OFFER_EVENT, offer)

export const watchDockOffers = (
	windowLabel: string,
	hear: (offer: DockOffer) => void,
) =>
	listenOnThisComputer<DockOffer>(DOCK_OFFER_EVENT, ({ payload }) => {
		if (payload.windowLabel === windowLabel) {
			hear(payload)
		}
	})

export const answerDock = (answer: DockMessage) =>
	emitOnThisComputer(DOCK_ANSWER_EVENT, answer)

export const awaitDockSettle = (windowLabel: string, originTabId: string) =>
	hearFirst(DOCK_SETTLE_EVENT, { windowLabel, originTabId })

export const awaitSettleWithinBound = ({ heard, end }: DockMessageHeard) => {
	const timeout = setTimeout(() => end(false), DOCK_SETTLE_TIMEOUT_MS)
	return heard.finally(() => clearTimeout(timeout))
}

export const awaitDockAnswer = async (
	windowLabel: string,
	originTabId: string,
): Promise<DockAnswerAwaited> => {
	const move = { windowLabel, originTabId }
	const hearing = await hearFirst(DOCK_ANSWER_EVENT, move)
	return {
		answer: answerWithinBound(hearing).then(async (isTaken) => {
			const isSettled = await settleDock({ ...move, isTaken: isTaken === true })
			return outcomeOf(isTaken, isSettled)
		}),
	}
}
