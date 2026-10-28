import type {
	MessageStoredListener,
	ReportTurnAnnouncer,
} from "./create-live-listeners"
import type { TranscriptMessage } from "./transcript-contract"

export const createFakeWindowEvents = () => {
	const listeners = new Set<(stored: TranscriptMessage) => void>()
	const deliver: ReportTurnAnnouncer = (stored) => {
		for (const listener of listeners) {
			listener(stored)
		}
	}
	const onMessageStored: MessageStoredListener = async (listener) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}
	return { deliver, onMessageStored }
}
