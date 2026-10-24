import {
	hashKey,
	InfiniteQueryObserver,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useState, useSyncExternalStore } from "react"

import type { ListEnd } from "@workspace/ui/components/list-skeleton"

import {
	type ConversationStateChange,
	createRosterController,
	type RosterController,
} from "./roster-controller"
import { type RosterFrame, rosterFrameReader } from "./roster-frame"
import { type RosterLine, rosterLineKey, type SoloThreads } from "./roster-line"

import { listen, onHostReconnected } from "@/lib/host"
import type { ConversationInPage } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"
import { useListEnd } from "../query/use-list-end"

export type Roster = {
	state: RosterFrame
	controller: RosterController
	listEnd: ListEnd
}

type ConversationStored = {
	spaceId: string | null
	conversation: ConversationInPage
}

type ConversationDeleted = { spaceId: string | null; conversationId: string }

type ConversationStateChanged = ConversationStateChange & {
	spaceId: string | null
}

type CompanionUpdated = { id: string }

type CompanionDeleted = { id: string; spaceId: string }

const NO_SPACE_ROW = ""

const NO_LINE: RosterLine = { spaceId: NO_SPACE_ROW, botId: "" }

const reportUnheardEvent = (reason: unknown) => {
	console.error("roster: a host event could not be listened to", reason)
	return () => undefined
}

const STORED_EVENTS = ["conversation://created", "conversation://updated"]

const listenToRosterChanges = (controller: RosterController) =>
	[
		...STORED_EVENTS.map((event) =>
			listen<ConversationStored>(event, ({ payload }, hostId) =>
				controller.holdPageRow(
					{ hostId, spaceId: payload.spaceId },
					payload.conversation,
				),
			),
		),
		listen<ConversationStateChanged>(
			"conversation://state-changed",
			({ payload }, hostId) =>
				controller.holdHostState({ hostId, spaceId: payload.spaceId }, payload),
		),
		listen<ConversationDeleted>(
			"conversation://deleted",
			({ payload }, hostId) => {
				controller.forgetConversation(payload.conversationId)
				controller.rereadSpaceSoon({ hostId, spaceId: payload.spaceId })
			},
		),
		listen<CompanionUpdated>("companion://updated", ({ payload }) =>
			controller.rereadSpacesOfBotSoon(payload.id),
		),
		listen<CompanionDeleted>("companion://deleted", ({ payload }, hostId) =>
			controller.rereadSpaceSoon({ hostId, spaceId: payload.spaceId }),
		),
	].map((listening) => listening.catch(reportUnheardEvent))

const useRosterRefreshes = (controller: RosterController) => {
	useEffect(() => {
		const listenings = listenToRosterChanges(controller)
		const stopCatchingUp = onHostReconnected(controller.catchUpWithHost)
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
}: RosterFrame): RosterLine | null =>
	spaceRowId === null || selectedBotId === null
		? null
		: { spaceId: spaceRowId, botId: selectedBotId }

const isKnownIn = (soloThreads: SoloThreads, line: RosterLine) =>
	Object.values(soloThreads).some(
		(known) => rosterLineKey(known) === rosterLineKey(line),
	)

const useOpenedSoloThread = (
	controller: RosterController,
	state: RosterFrame,
) => {
	const line = openedLineOf(state)
	useQuery({
		...controller.soloThreadQuery(line ?? NO_LINE),
		enabled: line !== null && !isKnownIn(state.soloThreads, line),
	})
}

export const useRosterReads = (
	controller: RosterController,
	state: RosterFrame,
) => {
	useObservedRosters(controller, Object.keys(state.rosters))
	useOpenedSoloThread(controller, state)
	useRosterRefreshes(controller)
	return useRosterListEnd(controller, state.spaceRowId)
}

export const useRoster = (store: TranscriptStore): Roster => {
	const queryClient = useQueryClient()
	const [controller] = useState(() =>
		createRosterController(store, { queryClient }),
	)
	const [readFrame] = useState(() => rosterFrameReader(controller.getState))
	const state = useSyncExternalStore(controller.subscribe, readFrame)
	const listEnd = useRosterReads(controller, state)
	return { state, controller, listEnd }
}
