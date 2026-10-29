import { keptTabOf, tabKeptIn } from "./tabs-mirror"
import type { Tab } from "./tabs-model"

import type { Json } from "../bindings"
import { emitOnThisComputer, listenOnThisComputer } from "../host"

const DOCK_ANSWER_EVENT = "window://tab-dock-answered"

const DOCK_SETTLE_EVENT = "window://tab-dock-settled"

const DOCK_ANSWER_TIMEOUT_MS = 2000

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

type DockAnswerAwaited = {
	answer: Promise<boolean>
}

type DockMessageHeard = {
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
		() => settled.isTaken,
		reportUnsettled,
	)

export const answerDock = (answer: DockMessage) =>
	emitOnThisComputer(DOCK_ANSWER_EVENT, answer)

export const awaitDockSettle = (windowLabel: string, originTabId: string) =>
	hearFirst(DOCK_SETTLE_EVENT, { windowLabel, originTabId })

export const awaitDockAnswer = async (
	windowLabel: string,
	originTabId: string,
): Promise<DockAnswerAwaited> => {
	const move = { windowLabel, originTabId }
	const { heard, end } = await hearFirst(DOCK_ANSWER_EVENT, move)
	const timeout = setTimeout(() => end(false), DOCK_ANSWER_TIMEOUT_MS)
	return {
		answer: heard.then((isTaken) => {
			clearTimeout(timeout)
			return settleDock({ ...move, isTaken })
		}),
	}
}
