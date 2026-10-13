import { useQuery, useQueryClient } from "@tanstack/react-query"

import {
	createSpacesController,
	type SpacesController,
	type SpacesState,
} from "./spaces-controller"

import { useController } from "../use-controller"
import type { TranscriptStore } from "../conversations/store-port"

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
	return spaces
}
