import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"

import type {
	ConversationController,
	ConversationState,
} from "./conversation-controller"
import type { ConversationRuntimes } from "./conversation-runtimes"
import type { ConversationWorker } from "./roster-conversations"
import type { Conversation } from "./store-contract"

import { useControllerState } from "../use-controller"

export type ConversationChat = {
	state: ConversationState
	controller: ConversationController
}

export const useConversation = (
	runtimes: ConversationRuntimes,
	conversation: Conversation,
): ConversationChat => {
	const controller = useMemo(
		() => runtimes.runtimeFor(conversation.id),
		[runtimes, conversation.id],
	)
	const state = useControllerState(controller)

	useEffect(() => {
		void controller.open(conversation)
	}, [controller, conversation])

	useEffect(() => () => controller.leave(), [controller])

	return { state, controller }
}

export type ConversationWorkers = Record<string, ConversationWorker[]>

const NO_WORKERS: ConversationWorker[] = []

export type SubscribableRuntimes = Pick<ConversationRuntimes, "subscribe">

export const useHeldRecord = <Value>(
	runtimes: SubscribableRuntimes,
	conversationIds: string[],
	readFor: (conversationId: string) => Value,
	signOf: (value: Value) => string,
): Record<string, Value> => {
	const held = useRef<{
		signature: string
		record: Record<string, Value>
	} | null>(null)

	return useSyncExternalStore(runtimes.subscribe, () => {
		const rows = conversationIds.map((id): [string, Value] => [id, readFor(id)])
		const signature = rows
			.map(([id, value]) => `${id}:${signOf(value)}`)
			.join("|")
		if (held.current?.signature !== signature) {
			held.current = { signature, record: Object.fromEntries(rows) }
		}
		return held.current.record
	})
}

const workersIn = (
	controller: ConversationController | null,
): ConversationWorker[] => {
	if (!controller) {
		return NO_WORKERS
	}
	const { speakers, waitingBotIds } = controller.getState()
	return [
		...speakers.map(
			({ botId, work }): ConversationWorker => ({ botId, kind: work.kind }),
		),
		...waitingBotIds.map(
			(botId): ConversationWorker => ({ botId, kind: "waiting" }),
		),
	]
}

export const useConversationWorkers = (
	runtimes: ConversationRuntimes,
	conversationIds: string[],
): ConversationWorkers =>
	useHeldRecord(
		runtimes,
		conversationIds,
		(id) => workersIn(runtimes.heldFor(id)),
		(workers) => workers.map(({ botId, kind }) => `${botId}:${kind}`).join(","),
	)
