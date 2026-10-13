import { renderHook } from "@testing-library/react"

import {
	createRosterController,
	type RosterControllerOptions,
} from "./roster-controller"
import { useRosterReads } from "./use-roster"

import { useControllerState } from "../use-controller"
import type { TranscriptStore } from "../conversations/store-port"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

export const mountRoster = (
	store: TranscriptStore,
	options: Omit<RosterControllerOptions, "queryClient"> = {},
) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const controller = createRosterController(store, { queryClient, ...options })
	renderHook(() => useRosterReads(controller, useControllerState(controller)), {
		wrapper,
	})
	return controller
}
