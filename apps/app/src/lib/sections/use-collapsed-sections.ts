import {
	type CollapsedSectionsController,
	type CollapsedSectionsState,
	createCollapsedSectionsController,
	type SectionSpaces,
} from "./collapsed-sections-controller"

import { useController } from "../use-controller"
import type { TranscriptStore } from "../conversations/store-port"

export type CollapsedSections = {
	state: CollapsedSectionsState
	controller: CollapsedSectionsController
}

export const useCollapsedSections = (
	store: TranscriptStore,
	spaces: SectionSpaces,
): CollapsedSections =>
	useController(() => createCollapsedSectionsController(store, spaces))
