import type { BadgeChannel } from "./badge-sharing"

type Listeners<Payload> = Set<(payload: Payload) => void>

const deliverTo =
	<Payload>(listeners: Listeners<Payload>) =>
	async (payload: Payload) => {
		await Promise.resolve()
		for (const listener of [...listeners]) {
			listener(structuredClone(payload))
		}
	}

const listenOn =
	<Payload>(listeners: Listeners<Payload>) =>
	async (listener: (payload: Payload) => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}

export const createFakeBadgeChannel = (): BadgeChannel => {
	const shared: Listeners<Parameters<BadgeChannel["share"]>[0]> = new Set()
	const reported: Listeners<Parameters<BadgeChannel["report"]>[0]> = new Set()
	return {
		share: deliverTo(shared),
		onShared: listenOn(shared),
		report: deliverTo(reported),
		onReport: listenOn(reported),
	}
}

export const settleWindows = () =>
	new Promise<void>((resolve) => setTimeout(resolve, 0))
