import { useEffect } from "react"

import { startCompanionSpokeDriver } from "./companion-spoke-driver"
import type { ConversationRuntimes } from "./conversation-runtimes"
import type { SpokenWords } from "./spoken-words"
import { arrivalsTransport } from "./store-transport"

import { failureReporterIn } from "../failure-report"
import { activeJoinedSpaceId } from "../host"
import type { RosterController } from "../bots/roster-controller"

export type CompanionSpokeDriverMount = {
	runtimes: ConversationRuntimes
	roster: RosterController
	spokenWords: SpokenWords
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
				reportFailure: failureReporterIn("companion-spoke-driver"),
				joinedSpaceId: activeJoinedSpaceId,
			}),
		[runtimes, roster, spokenWords],
	)
}
