import { useEffect } from "react"

import { startReportRelay } from "./report-relay"

import { failureReporterIn } from "../failure-report"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type ReportRelayMount = {
	driver: ChatDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
	isDriverWindow: boolean
}

export const useReportRelay = ({
	driver,
	store,
	runtimes,
	isDriverWindow,
}: ReportRelayMount) => {
	useEffect(() => {
		if (!isDriverWindow) {
			return
		}
		return startReportRelay({
			driver,
			store,
			runtimes,
			reportFailure: failureReporterIn("report-relay"),
		})
	}, [driver, store, runtimes, isDriverWindow])
}
