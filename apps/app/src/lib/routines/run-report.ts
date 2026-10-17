import { i18n } from "@workspace/ui/lib/i18n"

import {
	indexedByTurnId,
	type ReportedRun,
	type ReportedRunsByTurnId,
	type RunReportDraft,
} from "./routine-contract"
import type { ReportedRunsReader } from "./run-port"

import { raiseReportedFailure } from "../failure-report"
import type { TranscriptStore } from "../conversations/store-port"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import { isHostOffline } from "../host/host-offline"

type AssistantTurnDraft = {
	conversationId: string
	botId: string
	text: string
	runtimeSessionId: string | null
}

export type ReportTurnWrites = Pick<
	TranscriptStore,
	| "startTurn"
	| "openAssistantMessage"
	| "appendText"
	| "finalizeMessage"
	| "completeTurn"
>

export type ReportTurnWrite = {
	store: ReportTurnWrites
	draft: AssistantTurnDraft
	newId: () => string
	now: () => number
}

export const writeReportTurn = async ({
	store,
	draft,
	newId,
	now,
}: ReportTurnWrite): Promise<TranscriptMessage> => {
	const reported: TranscriptMessage = {
		id: newId(),
		conversationId: draft.conversationId,
		turnId: newId(),
		seq: 0,
		role: "assistant",
		content: draft.text,
		completion: "complete",
		createdAt: now(),
		authorBotId: draft.botId,
		authorAccountId: null,
		authorName: null,
		repliedToMessageId: null,
		runtimeSessionId: draft.runtimeSessionId,
	}
	await store.startTurn({
		id: reported.turnId,
		conversationId: reported.conversationId,
		startedAt: reported.createdAt,
	})
	await store.openAssistantMessage({
		id: reported.id,
		conversationId: reported.conversationId,
		turnId: reported.turnId,
		authorBotId: reported.authorBotId,
		repliedToMessageId: null,
		createdAt: reported.createdAt,
	})
	await store.appendText(reported.id, reported.content)
	await store.finalizeMessage(reported.id, "complete")
	await store.completeTurn(reported.turnId, now())
	return reported
}

export const causeOf = (
	{ routineTitle, triggerSourceId }: RunReportDraft,
	turnId: string,
): ReportedRun => ({ turnId, routineTitle, triggerSourceId })

export type CauseRead = {
	read: ReportedRunsReader
	conversationId: string
	description: string
}

export const readReportedCauses = async ({
	read,
	conversationId,
	description,
}: CauseRead): Promise<ReportedRunsByTurnId | null> => {
	try {
		return indexedByTurnId(await read(conversationId))
	} catch (reason) {
		if (!isHostOffline(reason)) {
			raiseReportedFailure(
				{
					title: i18n.t("chat:transcript.cause.unavailable.title"),
					description,
				},
				{ raisedIn: "run-report", conversation: conversationId },
			)
		}
		return null
	}
}
