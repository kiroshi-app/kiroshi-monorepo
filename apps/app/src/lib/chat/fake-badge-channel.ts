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

type HeldListening = {
	release: () => void
	refuse: (reason: unknown) => void
}

export const createHeldBadgeChannel = () => {
	const channel = createFakeBadgeChannel()
	const held: HeldListening[] = []
	const onReport: BadgeChannel["onReport"] = (listener) =>
		new Promise((resolve, reject) => {
			held.push({
				release: () => channel.onReport(listener).then(resolve, reject),
				refuse: reject,
			})
		})
	return {
		channel: { ...channel, onReport },
		releaseReportListening: () => {
			for (const listening of held.splice(0)) {
				listening.release()
			}
		},
		refuseReportListening: (reason: unknown) => {
			for (const listening of held.splice(0)) {
				listening.refuse(reason)
			}
		},
	}
}

export const settleWindows = () =>
	new Promise<void>((resolve) => setTimeout(resolve, 0))
