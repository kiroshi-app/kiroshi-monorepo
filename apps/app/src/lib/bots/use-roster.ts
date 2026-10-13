import { useQueries, useQueryClient } from "@tanstack/react-query"

import {
	createRosterController,
	type RosterController,
	type RosterState,
} from "./roster-controller"
import { rosterLinesIn } from "./roster-line"

import { useController } from "../use-controller"
import { conversationQueryKeys } from "../conversations/conversation-query-keys"
import type { TranscriptStore } from "../conversations/store-port"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export type Roster = {
	state: RosterState
	controller: RosterController
}

const ROSTER_KEYS = [conversationQueryKeys.rosters()]

const useRosterInvalidations = () => {
	useInvalidateOnHostEvent("conversation://created", ROSTER_KEYS)
	useInvalidateOnHostEvent("conversation://updated", ROSTER_KEYS)
	useInvalidateOnHostEvent("conversation://deleted", ROSTER_KEYS)
	useInvalidateOnHostEvent("companion://updated", ROSTER_KEYS)
	useInvalidateOnHostEvent("companion://deleted", ROSTER_KEYS)
}

const lastWordQueriesOf = (
	controller: RosterController,
	{ soloThreads, conversationRosters }: RosterState,
) => [
	...Object.entries(soloThreads).map(([conversationId, line]) =>
		controller.lastWordQuery(line.spaceId, conversationId),
	),
	...Object.entries(conversationRosters).flatMap(
		([spaceRowId, conversations]) =>
			conversations.map((conversation) =>
				controller.lastWordQuery(spaceRowId, conversation.id),
			),
	),
]

export const useRosterReads = (
	controller: RosterController,
	state: RosterState,
) => {
	useQueries({
		queries: Object.keys(state.rosters).map((spaceRowId) =>
			controller.rosterQuery(spaceRowId),
		),
	})
	useQueries({
		queries: rosterLinesIn(state.rosters).map((line) =>
			controller.soloThreadQuery(line),
		),
	})
	useQueries({ queries: lastWordQueriesOf(controller, state) })
	useRosterInvalidations()
}

export const useRoster = (store: TranscriptStore): Roster => {
	const queryClient = useQueryClient()
	const roster = useController(() =>
		createRosterController(store, { queryClient }),
	)
	useRosterReads(roster.controller, roster.state)
	return roster
}
