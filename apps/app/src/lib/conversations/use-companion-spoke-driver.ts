import { useEffect } from "react"

import { startCompanionSpokeDriver } from "./companion-spoke-driver"
import type { ConversationRuntimes } from "./conversation-runtimes"
import { readConversationInEverySpace } from "./read-conversation"
import type { SpokenWords } from "./spoken-words"
import {
	arrivalsTransport,
	conversationReadsOn,
	reportTurnWritesOn,
} from "./store-transport"

import { failureReporterIn } from "../failure-report"
import type { RosterController } from "../bots/roster-controller"

export type CompanionSpokeDriverMount = {
	runtimes: ConversationRuntimes
	roster: RosterController
	spokenWords: SpokenWords
}

const THIS_COMPUTER = null

const thisComputer = {
	conversation: (conversationId: string) =>
		readConversationInEverySpace(
			conversationReadsOn(THIS_COMPUTER),
			conversationId,
		),
	writes: () => reportTurnWritesOn(THIS_COMPUTER),
}

export const useCompanionSpokeDriver = ({
	runtimes,
	roster,
	spokenWords,
}: CompanionSpokeDriverMount) => {
	useEffect(
		() =>
			startCompanionSpokeDriver({
				runtimes,
				roster,
				companions: arrivalsTransport,
				spokenWords,
				thisComputer,
				reportFailure: failureReporterIn("companion-spoke-driver"),
			}),
		[runtimes, roster, spokenWords],
	)
}
