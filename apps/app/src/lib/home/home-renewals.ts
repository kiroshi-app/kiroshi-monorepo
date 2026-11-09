import { i18n } from "@workspace/ui/lib/i18n"

import type { TranscriptStore } from "@/lib/conversations/store-port"
import { describeFailure, failureReporterIn } from "@/lib/failure-report"

export type HomeArchive = {
	conversationId: string
	lastActiveAt: number
}

export type HomeArchives = Readonly<Record<string, HomeArchive>>

export type HomeRenewals = {
	renew: (botId: string, spaceId: string) => Promise<void>
	getState: () => HomeArchives
	subscribe: (listener: () => void) => () => void
}

type RenewingStore = Pick<TranscriptStore, "mainChat" | "renewMainChat">

const reportRenewal = failureReporterIn("home-renewals")

const homeKeyOf = (botId: string, spaceId: string) => `${spaceId}:${botId}`

export const archiveOf = (
	archives: HomeArchives,
	botId: string,
	spaceId: string | null,
): HomeArchive | null =>
	spaceId === null ? null : (archives[homeKeyOf(botId, spaceId)] ?? null)

const raiseRenewalFailure = (reason: unknown) => {
	void reportRenewal({
		title: i18n.t("bots:roster.previewUnreadable"),
		description: describeFailure(reason),
	})
}

export const createHomeRenewals = (store: RenewingStore): HomeRenewals => {
	const renewals = new Map<string, Promise<void>>()
	const listeners = new Set<() => void>()
	let archives: HomeArchives = {}

	const remember = (key: string, archive: HomeArchive) => {
		archives = { ...archives, [key]: archive }
		for (const listener of [...listeners]) {
			listener()
		}
	}

	const renewOnce = async (botId: string, spaceId: string) => {
		const previous = await store.mainChat(botId, spaceId)
		const fresh = await store.renewMainChat(botId, spaceId)
		if (previous.id !== fresh.id) {
			remember(homeKeyOf(botId, spaceId), {
				conversationId: previous.id,
				lastActiveAt: previous.updatedAt,
			})
		}
	}

	const renew = (botId: string, spaceId: string) => {
		const key = homeKeyOf(botId, spaceId)
		const held =
			renewals.get(key) ?? renewOnce(botId, spaceId).catch(raiseRenewalFailure)
		renewals.set(key, held)
		return held
	}

	return {
		renew,
		getState: () => archives,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}
