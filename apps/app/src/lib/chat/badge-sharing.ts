import type { BadgeReport, BadgeSource } from "./badge-source"
import type { BotBadge } from "./bot-badge"

export type WindowBadgeReport = BadgeReport & {
	windowLabel: string
}

export type SharedBadges = {
	ownerId: string
	badges: Record<string, BotBadge>
}

type Listening = Promise<() => void>

export type BadgeChannel = {
	share: (shared: SharedBadges) => Promise<void>
	onShared: (listener: (shared: SharedBadges) => void) => Listening
	report: (report: WindowBadgeReport) => Promise<void>
	onReport: (listener: (report: WindowBadgeReport) => void) => Listening
}

type BadgeSharing = {
	source: BadgeSource
	channel: BadgeChannel
	windowLabel: string
	onError: (reason: unknown) => void
}

const hasChanges = ({ changed }: BadgeReport) => Object.keys(changed).length > 0

const stopOnceListening = (
	listening: Listening,
	onError: (reason: unknown) => void,
) =>
	listening.catch((reason: unknown) => {
		onError(reason)
		return () => undefined
	})

export const ownBadges = ({
	source,
	channel,
	onError,
}: BadgeSharing): (() => void) => {
	const ownerId = crypto.randomUUID()
	let isStopped = false
	const share = () => {
		channel.share({ ownerId, badges: source.getBadges() }).catch(onError)
	}
	const startSharing = (stopReports: () => void) => {
		if (isStopped) {
			stopReports()
			return () => undefined
		}
		const stopSharing = source.subscribe(share)
		share()
		return () => {
			stopSharing()
			stopReports()
		}
	}
	const sharing = stopOnceListening(
		channel.onReport(({ windowLabel, ...report }) => {
			source.take(windowLabel, report)
			share()
		}),
		onError,
	).then(startSharing)

	return () => {
		isStopped = true
		void sharing.then((stop) => stop())
	}
}

export const mirrorBadges = ({
	source,
	channel,
	windowLabel,
	onError,
}: BadgeSharing): (() => void) => {
	let sentReadId: string | null | undefined
	let knownOwnerId: string | undefined

	const send = (report: BadgeReport) => {
		sentReadId = report.readId
		channel.report({ windowLabel, ...report }).catch(onError)
	}

	const sendRead = (readId: string | null) => send({ readId, changed: {} })

	const forward = (report: BadgeReport) => {
		if (hasChanges(report) || report.readId !== sentReadId) {
			send(report)
		}
	}

	const followShared = ({ ownerId, badges }: SharedBadges) => {
		source.mirror(badges)
		if (ownerId === knownOwnerId) {
			return
		}
		knownOwnerId = ownerId
		sendRead(sentReadId ?? null)
	}

	const watching = stopOnceListening(
		channel.onShared(followShared).then((stopShared) => {
			const stopReports = source.watchReports(forward)
			return () => {
				stopReports()
				stopShared()
			}
		}),
		onError,
	)

	return () => {
		void watching.then((stop) => stop())
		sendRead(null)
	}
}
