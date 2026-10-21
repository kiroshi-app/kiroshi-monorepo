import type { SessionFrame } from "./providers/provider"

export const HEARTBEAT_INTERVAL_MS = 10_000

const HEARTBEAT: SessionFrame = { type: "heartbeat" }

type WriteFrame = (session: string, frame: SessionFrame) => void

type Beating = {
	queries: number
	timer: ReturnType<typeof setInterval>
}

export const createHeartbeats = (write: WriteFrame, intervalMs: number) => {
	const beating = new Map<string, Beating>()

	const stop = (session: string) => {
		const beat = beating.get(session)
		if (!beat) {
			return
		}
		clearInterval(beat.timer)
		beating.delete(session)
	}

	const queried = (session: string) => {
		const beat = beating.get(session)
		if (beat) {
			beat.queries += 1
			return
		}
		const timer = setInterval(() => write(session, HEARTBEAT), intervalMs)
		beating.set(session, { queries: 1, timer })
	}

	const answered = (session: string) => {
		const beat = beating.get(session)
		if (!beat) {
			return
		}
		beat.queries -= 1
		if (beat.queries === 0) {
			stop(session)
		}
	}

	const observe = (session: string, frame: SessionFrame) => {
		if (frame.type === "result") {
			answered(session)
		}
		if (frame.type === "closed") {
			stop(session)
		}
	}

	return { queried, observe, stop }
}
