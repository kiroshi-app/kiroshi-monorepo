type ReopenSignal = "relay" | "socket"

type UnpairedReopen = { signal: ReopenSignal; heardAt: number }

const REOPEN_PAIRING_MS = 10_000

export const createReopenPairing = () => {
	const unpairedReopens = new Map<string, UnpairedReopen>()

	const leaveUnpaired = (id: string, signal: ReopenSignal) => {
		unpairedReopens.set(id, { signal, heardAt: Date.now() })
	}

	const pairsWith = (id: string, signal: ReopenSignal) => {
		const unpaired = unpairedReopens.get(id)
		unpairedReopens.delete(id)
		return (
			unpaired?.signal === signal &&
			Date.now() - unpaired.heardAt <= REOPEN_PAIRING_MS
		)
	}

	const forgetUnpaired = (id: string) => {
		unpairedReopens.delete(id)
	}

	return { leaveUnpaired, pairsWith, forgetUnpaired }
}
