const PENDING_LANDING_TIMEOUT_MS = 5000

type Subscribe = (listener: () => void) => () => void

type PendingLanding = {
	isReady: () => boolean
	land: () => void
	giveUp: () => void
}

const keepNothing = () => undefined

export const createPendingLandings = (subscribe: Subscribe) => {
	let clicks = 0
	let dropWaiting: () => void = keepNothing

	const drop = () => {
		clicks += 1
		dropWaiting()
	}

	const claim = () => {
		drop()
		const claimed = clicks
		return () => claimed === clicks
	}

	const wait = ({ isReady, land, giveUp }: PendingLanding) => {
		const stop = () => {
			clearTimeout(timer)
			unsubscribe()
			dropWaiting = keepNothing
		}
		const timer = setTimeout(() => {
			stop()
			giveUp()
		}, PENDING_LANDING_TIMEOUT_MS)
		const unsubscribe = subscribe(() => {
			if (isReady()) {
				stop()
				land()
			}
		})
		dropWaiting = stop
	}

	return { claim, wait, drop }
}
