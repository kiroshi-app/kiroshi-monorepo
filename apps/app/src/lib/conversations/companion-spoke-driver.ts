import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ConversationRuntimes } from "./conversation-runtimes"
import type { SpokenWords } from "./spoken-words"
import type { CompanionSpoke } from "./transcript-contract"

import { rowIdsIn } from "../chat/badge-source"

type CompanionSpokePort = {
	onCompanionSpoke: (
		listener: (spoken: CompanionSpoke) => void,
	) => Promise<() => void>
}

type RosteredConversation = {
	id: string
}

type SpokenRosterPort = {
	getState: () => {
		conversationRosters: Record<string, RosteredConversation[]>
		hasFailedToLoad: boolean
	}
	reload: () => Promise<void>
}

export type CompanionSpokeDriverOptions = {
	runtimes: Pick<ConversationRuntimes, "runtimeFor">
	roster: SpokenRosterPort
	companions: CompanionSpokePort
	spokenWords: Pick<SpokenWords, "announce">
	reportFailure: (notice: NoticeMessage) => void
	joinedSpaceId: () => string | null
}

const SEPARATOR = "\u0000"

const keyOf = ({ conversationId, authorBotId, text }: CompanionSpoke) =>
	[conversationId, authorBotId, text].join(SEPARATOR)

const detailOf = (thrown: unknown) =>
	thrown instanceof Error ? thrown.message : String(thrown)

export const startCompanionSpokeDriver = ({
	runtimes,
	roster,
	companions,
	spokenWords,
	reportFailure,
	joinedSpaceId,
}: CompanionSpokeDriverOptions): (() => void) => {
	const relayed = new Set<string>()
	let isStopped = false

	const raiseFailure = (thrown: unknown) => {
		console.error("companion spoke driver:", thrown)
		reportFailure({
			title: i18n.t("chat:screen.transport.writeFailed", {
				detail: detailOf(thrown),
			}),
		})
	}

	const relay = async (spoken: CompanionSpoke, key: string) => {
		try {
			return await runtimes
				.runtimeFor(spoken.conversationId)
				.relaySpoken(spoken)
		} catch (thrown) {
			relayed.delete(key)
			raiseFailure(thrown)
			return false
		}
	}

	const isRostered = (conversationId: string) =>
		rowIdsIn(roster.getState().conversationRosters).includes(conversationId)

	const rosterShows = async (conversationId: string) => {
		if (isRostered(conversationId)) {
			return true
		}

		await roster.reload()

		if (roster.getState().hasFailedToLoad) {
			reportFailure({ title: i18n.t("bots:roster.unavailable") })
			return false
		}

		return true
	}

	const isWrittenByJoinedHost = () => joinedSpaceId() !== null

	const relayAndAnnounce = async (spoken: CompanionSpoke, key: string) => {
		const isShown = await rosterShows(spoken.conversationId)
		const isWritten = isWrittenByJoinedHost() || (await relay(spoken, key))

		if (!isShown || !isWritten) {
			return
		}

		spokenWords.announce({
			conversationId: spoken.conversationId,
			authorBotId: spoken.authorBotId,
		})
	}

	const take = (spoken: CompanionSpoke) => {
		const key = keyOf(spoken)

		if (isStopped || relayed.has(key)) {
			return
		}

		relayed.add(key)
		void relayAndAnnounce(spoken, key)
	}

	const listening = companions.onCompanionSpoke(take).catch((reason) => {
		raiseFailure(reason)
		return () => undefined
	})

	return () => {
		isStopped = true
		void listening.then((stop) => stop())
	}
}
