import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import {
	createSpacesController,
	type SpacesController,
	type SpacesState,
} from "./spaces-controller"

import { HOSTING_CHANGED_EVENT } from "../bindings"
import { isDesktopHost } from "../host"
import { useController } from "../use-controller"
import type { TranscriptStore } from "../conversations/store-port"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

export type Spaces = {
	state: SpacesState
	controller: SpacesController
}

export const useSpaces = (store: TranscriptStore): Spaces => {
	const queryClient = useQueryClient()
	const spaces = useController(() =>
		createSpacesController(store, { queryClient }),
	)
	useQuery(spaces.controller.listQuery)
	useInvalidateOnHostEvent(HOSTING_CHANGED_EVENT, [
		spaces.controller.listQuery.queryKey,
	])
	useEffect(
		() => (isDesktopHost() ? spaces.controller.watch() : undefined),
		[spaces.controller],
	)
	return spaces
}
