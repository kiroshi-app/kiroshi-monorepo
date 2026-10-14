import {
	hashKey,
	InfiniteQueryObserver,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

import {
	createRosterController,
	type RosterController,
	type RosterState,
} from "./roster-controller"
import { type RosterLine, rosterLineKey, type SoloThreads } from "./roster-line"

import { useController } from "../use-controller"
import { listen, onHostReconnected } from "@/lib/host"
import type { Conversation } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { useListEnd } from "../query/use-list-end"

export type Roster = {
	state: RosterState
	controller: RosterController
	listEnd: ListEnd
}

type ConversationStored = { conversation: Conversation }

type ConversationDeleted = { conversationId: string }

const REFRESHING_EVENTS = [
	"conversation://created",
	"companion://updated",
	"companion://deleted",
]

const NO_SPACE_ROW = ""

const NO_LINE: RosterLine = { spaceId: NO_SPACE_ROW, botId: "" }

const reportUnheardEvent = (reason: unknown) => {
	console.error("roster: a host event could not be listened to", reason)
	return () => undefined
}

const listenToRosterChanges = (
	controller: RosterController,
	refresh: () => void,
) =>
	[
		...REFRESHING_EVENTS.map((event) => listen(event, refresh)),
		listen<ConversationStored>("conversation://updated", ({ payload }) => {
			controller.restateConversation(payload.conversation)
			refresh()
		}),
		listen<ConversationDeleted>("conversation://deleted", ({ payload }) => {
			controller.forgetConversation(payload.conversationId)
			refresh()
		}),
	].map((listening) => listening.catch(reportUnheardEvent))

const useRosterRefreshes = (controller: RosterController) => {
	useEffect(() => {
		const refresh = () => {
			void controller.refresh()
		}
		const listenings = listenToRosterChanges(controller, refresh)
		const stopCatchingUp = onHostReconnected(refresh)
		return () => {
			stopCatchingUp()
			for (const listening of listenings) {
				void listening.then((stop) => stop())
			}
		}
	}, [controller])
}

const useObservedRosters = (
	controller: RosterController,
	spaceRowIds: string[],
) => {
	const queryClient = useQueryClient()
	const rosteredIds = hashKey(spaceRowIds)

	useEffect(() => {
		const ids: string[] = JSON.parse(rosteredIds)
		const stops = ids.map((spaceRowId) =>
			new InfiniteQueryObserver(
				queryClient,
				controller.rosterQuery(spaceRowId),
			).subscribe(() => undefined),
		)
		return () => {
			for (const stop of stops) {
				stop()
			}
		}
	}, [controller, queryClient, rosteredIds])
}

const useRosterListEnd = (
	controller: RosterController,
	spaceRowId: string | null,
) =>
	useListEnd(
		useInfiniteQuery({
			...controller.rosterQuery(spaceRowId ?? NO_SPACE_ROW),
			enabled: spaceRowId !== null,
		}),
	)

const openedLineOf = ({
	spaceRowId,
	selectedBotId,
}: RosterState): RosterLine | null =>
	spaceRowId === null || selectedBotId === null
		? null
		: { spaceId: spaceRowId, botId: selectedBotId }

const isKnownIn = (soloThreads: SoloThreads, line: RosterLine) =>
	Object.values(soloThreads).some(
		(known) => rosterLineKey(known) === rosterLineKey(line),
	)

const useOpenedSoloThread = (
	controller: RosterController,
	state: RosterState,
) => {
	const line = openedLineOf(state)
	useQuery({
		...controller.soloThreadQuery(line ?? NO_LINE),
		enabled: line !== null && !isKnownIn(state.soloThreads, line),
	})
}

export const useRosterReads = (
	controller: RosterController,
	state: RosterState,
) => {
	useObservedRosters(controller, Object.keys(state.rosters))
	useOpenedSoloThread(controller, state)
	useRosterRefreshes(controller)
	return useRosterListEnd(controller, state.spaceRowId)
}

export const useRoster = (store: TranscriptStore): Roster => {
	const queryClient = useQueryClient()
	const roster = useController(() =>
		createRosterController(store, { queryClient }),
	)
	const listEnd = useRosterReads(roster.controller, roster.state)
	return { ...roster, listEnd }
}
