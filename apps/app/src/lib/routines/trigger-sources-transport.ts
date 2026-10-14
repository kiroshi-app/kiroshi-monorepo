import type { BotTriggerSources } from "./trigger-contract"

import { invoke } from "../host"

export const triggerSourcesTransport = {
	sourcesOfSpace: (spaceId: string) =>
		invoke<BotTriggerSources[]>("routine_trigger_sources_of_space", {
			spaceId,
		}),
}
