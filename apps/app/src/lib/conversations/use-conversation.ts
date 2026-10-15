import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"

import type {
	ConversationController,
	ConversationState,
	SpeakingBot,
} from "./conversation-controller"
import type { ConversationRuntimes } from "./conversation-runtimes"
import {
	type ConversationWorker,
	type StoredConversation,
	storedSpeakerIdsOf,
} from "./roster-conversations"
import type { Conversation } from "./store-contract"

import { useControllerState } from "../use-controller"
import { workingFor } from "../chat/working-kind"

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

const NO_SPEAKERS: SpeakingBot[] = []

const NO_WAITING: string[] = []

const UNHEARD_KIND = workingFor([], false).kind

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

const heardSpeakersIn = (
	speakers: SpeakingBot[],
	storedIds: string[] | undefined,
): SpeakingBot[] =>
	storedIds === undefined
		? speakers
		: speakers.filter(
				({ botId, isForeign }) => !isForeign || storedIds.includes(botId),
			)

const workersIn = (
	conversation: StoredConversation | undefined,
	controller: ConversationController | null,
): ConversationWorker[] => {
	const storedIds = conversation && storedSpeakerIdsOf(conversation)
	const held = controller?.getState()
	const heard = heardSpeakersIn(held?.speakers ?? NO_SPEAKERS, storedIds)
	const unheardIds = (storedIds ?? []).filter(
		(botId) => !heard.some((speaking) => speaking.botId === botId),
	)
	return [
		...heard.map(
			({ botId, work }): ConversationWorker => ({ botId, kind: work.kind }),
		),
		...unheardIds.map(
			(botId): ConversationWorker => ({ botId, kind: UNHEARD_KIND }),
		),
		...(held?.waitingBotIds ?? NO_WAITING).map(
			(botId): ConversationWorker => ({ botId, kind: "waiting" }),
		),
	]
}

export const useConversationWorkers = (
	runtimes: ConversationRuntimes,
	conversations: StoredConversation[],
): ConversationWorkers => {
	const rows = new Map(conversations.map((row) => [row.id, row]))
	return useHeldRecord(
		runtimes,
		[...rows.keys()],
		(id) => workersIn(rows.get(id), runtimes.heldFor(id)),
		(workers) => workers.map(({ botId, kind }) => `${botId}:${kind}`).join(","),
	)
}
