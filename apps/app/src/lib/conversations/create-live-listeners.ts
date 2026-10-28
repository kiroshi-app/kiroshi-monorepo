import { transcriptEventsTransport } from "./store-transport"
import type { TranscriptMessage } from "./transcript-contract"

import { drivesRealHost, onHostReconnected } from "../host"

export type MessageStoredListener = (
	listener: (stored: TranscriptMessage) => void,
) => Promise<() => void>

export type ReportTurnAnnouncer = (reported: TranscriptMessage) => void

export type ReconnectionListener = (listener: () => void) => () => void

export const createMessageStoredListener = (): MessageStoredListener =>
	drivesRealHost()
		? transcriptEventsTransport.onMessageStored
		: async () => () => undefined

const logUnannounced = (reason: unknown) => {
	console.error(
		"transcript: the report turn could not be announced to the other windows",
		reason,
	)
}

export const createReportTurnAnnouncer = (): ReportTurnAnnouncer =>
	drivesRealHost()
		? (reported) => {
				transcriptEventsTransport
					.announceReportTurn(reported)
					.catch(logUnannounced)
			}
		: () => undefined

export const createReconnectionListener = (): ReconnectionListener =>
	drivesRealHost() ? onHostReconnected : () => () => undefined
