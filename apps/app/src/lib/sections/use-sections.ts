import { useQueries, useQueryClient } from "@tanstack/react-query"

import {
	type BotSections,
	createSectionsController,
	type SectionsController,
	type SectionsState,
} from "./sections-controller"

import { useController } from "../use-controller"
import type { TranscriptStore } from "../conversations/store-port"

export type Sections = {
	state: SectionsState
	controller: SectionsController
}

export const useSectionReads = (
	controller: SectionsController,
	state: SectionsState,
) => {
	useQueries({
		queries: Object.keys(state.sections).map((spaceId) =>
			controller.listQuery(spaceId),
		),
	})
}

export const useSections = (
	store: TranscriptStore,
	bots: BotSections,
): Sections => {
	const queryClient = useQueryClient()
	const sections = useController(() =>
		createSectionsController(store, bots, { queryClient }),
	)
	useSectionReads(sections.controller, sections.state)
	return sections
}
