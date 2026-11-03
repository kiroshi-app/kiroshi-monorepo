import { useEffect } from "react"

import { startReportRelay } from "./report-relay"

import { failureReporterIn } from "../failure-report"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import { missionRunTransport } from "../missions/missions-transport"

export type ReportRelayMount = {
	driver: ChatDriver
	runtimes: ConversationRuntimes
	isDriverWindow: boolean
}

export const useReportRelay = ({
	driver,
	runtimes,
	isDriverWindow,
}: ReportRelayMount) => {
	useEffect(() => {
		if (!isDriverWindow) {
			return
		}
		return startReportRelay({
			driver,
			store: { mainChat: missionRunTransport.mainChat },
			runtimes,
			reportFailure: failureReporterIn("report-relay"),
		})
	}, [driver, runtimes, isDriverWindow])
}
