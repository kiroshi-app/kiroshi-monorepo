import { useEffect, useState } from "react"

import { startCompanionSpokeDriver } from "./companion-spoke-driver"
import type { ConversationRuntimes } from "./conversation-runtimes"
import { readConversationInEverySpace } from "./read-conversation"
import type { SpokenWords } from "./spoken-words"
import {
	arrivalsTransport,
	conversationReadsOn,
	missionThreadReadOn,
	reportTurnWritesOn,
} from "./store-transport"

import { failureReporterIn } from "../failure-report"
import type { RosterController } from "../bots/roster-controller"

export type CompanionSpokeDriverMount = {
	runtimes: ConversationRuntimes
	roster: RosterController
	spokenWords: SpokenWords
	isDriverWindow: boolean
}

const THIS_COMPUTER = null

const thisComputer = {
	conversation: (conversationId: string) =>
		readConversationInEverySpace(
			conversationReadsOn(THIS_COMPUTER),
			conversationId,
		),
	missionThread: missionThreadReadOn(THIS_COMPUTER),
	writes: () => reportTurnWritesOn(THIS_COMPUTER),
}

export const useCompanionSpokeDriver = ({
	runtimes,
	roster,
	spokenWords,
	isDriverWindow,
}: CompanionSpokeDriverMount) => {
	const [relayed] = useState(() => new Set<string>())

	useEffect(() => {
		if (!isDriverWindow) {
			return
		}
		return startCompanionSpokeDriver({
			runtimes,
			roster,
			companions: arrivalsTransport,
			spokenWords,
			thisComputer,
			relayed,
			reportFailure: failureReporterIn("companion-spoke-driver"),
		})
	}, [runtimes, roster, spokenWords, isDriverWindow, relayed])
}
