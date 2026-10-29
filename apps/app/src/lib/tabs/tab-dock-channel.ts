import { keptTabOf, tabKeptIn } from "./tabs-mirror"
import type { Tab } from "./tabs-model"

import type { Json } from "../bindings"
import { emitOnThisComputer, listenOnThisComputer } from "../host"

const DOCK_ANSWER_EVENT = "window://tab-dock-answered"

const DOCK_ANSWER_TIMEOUT_MS = 2000

export type DockedTab = {
	originTabId: string
	tab: Tab
}

export type DockAnswer = {
	windowLabel: string
	originTabId: string
	isTaken: boolean
}

export type DockAnswerAwaited = {
	answer: Promise<boolean>
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

export const answerDock = (answer: DockAnswer) =>
	emitOnThisComputer(DOCK_ANSWER_EVENT, answer)

export const awaitDockAnswer = async (
	windowLabel: string,
	originTabId: string,
): Promise<DockAnswerAwaited> => {
	let settle: (isTaken: boolean) => void = () => undefined
	const answering = new Promise<boolean>((resolve) => {
		settle = resolve
	})
	const stopListening = await listenOnThisComputer<DockAnswer>(
		DOCK_ANSWER_EVENT,
		({ payload }) => {
			if (
				payload.windowLabel === windowLabel &&
				payload.originTabId === originTabId
			) {
				settle(payload.isTaken)
			}
		},
	)
	const timeout = setTimeout(() => settle(false), DOCK_ANSWER_TIMEOUT_MS)
	return {
		answer: answering.finally(() => {
			clearTimeout(timeout)
			stopListening()
		}),
	}
}
