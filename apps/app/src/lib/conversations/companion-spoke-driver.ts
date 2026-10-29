import { i18n } from "@workspace/ui/lib/i18n"

import type { ConversationRuntimes } from "./conversation-runtimes"
import { isRefusedWrite } from "./refused-write"
import type { SpokenWords } from "./spoken-words"
import type { Conversation } from "./store-contract"
import type { CompanionSpoke } from "./transcript-contract"

import {
	describeFailure,
	type ReporterFacts,
	type UnreportedFailureNotice,
} from "../failure-report"
import { rowIdsIn } from "../chat/badge-source"
import type { ConversationSource } from "../host/conversation-provenance"
import type { ReportTurnWrites } from "../routines/run-report"

type CompanionSpokePort = {
	onCompanionSpoke: (
		listener: (spoken: CompanionSpoke, side: ConversationSource) => void,
	) => Promise<() => void>
	serveAwaitedRuns: () => Promise<unknown>
}

type RosteredConversation = {
	id: string
}

type SpokenRosterPort = {
	getState: () => {
		conversationRosters: Record<string, RosteredConversation[]>
		hasFailedToLoad: boolean
	}
	reload: () => Promise<void>
}

type ThisComputerPort = {
	conversation: (conversationId: string) => Promise<Conversation | null>
	missionThread: (conversationId: string) => Promise<Conversation>
	writes: () => ReportTurnWrites
}

export type CompanionSpokeDriverOptions = {
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	roster: SpokenRosterPort
	companions: CompanionSpokePort
	spokenWords: Pick<SpokenWords, "announce">
	thisComputer: ThisComputerPort
	relayed: Set<string>
	reportFailure: (
		notice: UnreportedFailureNotice,
		facts?: ReporterFacts,
	) => unknown
}

type WriteSpoken = (spoken: CompanionSpoke, key: string) => Promise<boolean>

const SEPARATOR = "\u0000"

const keyOf = ({ conversationId, authorBotId, text }: CompanionSpoke) =>
	[conversationId, authorBotId, text].join(SEPARATOR)

const causeOf = (thrown: unknown) =>
	isRefusedWrite(thrown) ? thrown.cause : thrown

const isUnknownConversation = (thrown: unknown): boolean => {
	const cause = causeOf(thrown)
	return (
		typeof cause === "object" &&
		cause !== null &&
		"kind" in cause &&
		cause.kind === "unknownConversation"
	)
}

const refusedAnswerOf = (thrown: unknown) =>
	isRefusedWrite(thrown)
		? `${thrown.command} answered ${thrown.message}`
		: describeFailure(thrown)

const logSkipped = (
	{ conversationId, authorBotId }: CompanionSpoke,
	reason: string,
) => {
	console.info(
		[
			"companion spoke driver: wrote nothing for a word of a conversation gone from its side",
			`conversation: ${conversationId}`,
			`bot: ${authorBotId}`,
			`reason: ${reason}`,
		].join(" | "),
	)
}

const factsOf = (
	{ conversationId, authorBotId }: CompanionSpoke,
	thrown: unknown,
): ReporterFacts => ({
	conversation: conversationId,
	botId: authorBotId,
	...(isRefusedWrite(thrown)
		? { command: thrown.command, turn: thrown.turn }
		: {}),
})

export const startCompanionSpokeDriver = ({
	runtimes,
	roster,
	companions,
	spokenWords,
	thisComputer,
	relayed,
	reportFailure,
}: CompanionSpokeDriverOptions): (() => void) => {
	let isStopped = false

	const raiseFailure = (thrown: unknown, facts?: ReporterFacts) => {
		console.error("companion spoke driver:", thrown)
		reportFailure(
			{
				title: i18n.t("chat:screen.transport.writeFailed", {
					detail: describeFailure(thrown),
				}),
			},
			facts,
		)
	}

	const relayInMissionThread = async (spoken: CompanionSpoke) => {
		const thread = await thisComputer.missionThread(spoken.conversationId)
		const runtime = runtimes.runtimeFor(spoken.conversationId)
		await runtime.open(thread)
		return runtime.relaySpoken(spoken, {
			conversation: thread,
			writes: thisComputer.writes(),
		})
	}

	const relayOnThisComputer = async (spoken: CompanionSpoke) => {
		const conversation = await thisComputer.conversation(spoken.conversationId)
		if (!conversation) {
			return relayInMissionThread(spoken)
		}
		return runtimes
			.runtimeFor(spoken.conversationId)
			.relaySpoken(spoken, { conversation, writes: thisComputer.writes() })
	}

	const writeOnThisComputer: WriteSpoken = async (spoken, key) => {
		try {
			return await relayOnThisComputer(spoken)
		} catch (thrown) {
			if (isUnknownConversation(thrown)) {
				logSkipped(spoken, refusedAnswerOf(thrown))
				return false
			}
			relayed.delete(key)
			raiseFailure(thrown, factsOf(spoken, thrown))
			return false
		}
	}

	const isRostered = (conversationId: string) =>
		rowIdsIn(roster.getState().conversationRosters).includes(conversationId)

	const rosterShows = async (conversationId: string) => {
		if (isRostered(conversationId)) {
			return true
		}

		await roster.reload()

		if (roster.getState().hasFailedToLoad) {
			reportFailure({ title: i18n.t("bots:roster.unavailable") })
			return false
		}

		return true
	}

	const leaveToJoinedHost: WriteSpoken = async () => true

	const writerOf = (side: ConversationSource): WriteSpoken =>
		side === null ? writeOnThisComputer : leaveToJoinedHost

	const relayAndAnnounce = async (
		spoken: CompanionSpoke,
		key: string,
		write: WriteSpoken,
	) => {
		const isShown = await rosterShows(spoken.conversationId)
		const isWritten = await write(spoken, key)

		if (!isShown || !isWritten) {
			return
		}

		spokenWords.announce({
			conversationId: spoken.conversationId,
			authorBotId: spoken.authorBotId,
		})
	}

	const take = (spoken: CompanionSpoke, side: ConversationSource) => {
		const key = keyOf(spoken)

		if (isStopped || relayed.has(key)) {
			return
		}

		relayed.add(key)
		void relayAndAnnounce(spoken, key, writerOf(side))
	}

	const listening = companions.onCompanionSpoke(take).catch((reason) => {
		raiseFailure(reason)
		return () => undefined
	})

	void companions.serveAwaitedRuns().catch(raiseFailure)

	return () => {
		isStopped = true
		void listening.then((stop) => stop())
	}
}
