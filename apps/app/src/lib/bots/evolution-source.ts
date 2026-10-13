import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { failureReporterIn } from "../failure-report"
import type { EvolvedBundle, RuntimeScope } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"
import {
	botPlugin,
	spacePlugin,
	USER_PLUGIN,
} from "../conversations/plugin-scope"
import type { PluginScope } from "../conversations/store-contract"

type RosterPanel = {
	spaceOfConversation: (conversationId: string) => string | undefined
	hostSpaceIdOf: (spaceRowId: string) => string
	reload: () => Promise<void>
}

export type EvolutionSourceOptions = {
	driver: Pick<ChatDriver, "subscribe">
	roster: RosterPanel
	rereadPlugin: (scope: PluginScope) => void
	reportFailure?: (notice: NoticeMessage) => void
}

export const startEvolutionSource = ({
	driver,
	roster,
	rereadPlugin,
	reportFailure = failureReporterIn("evolution-source"),
}: EvolutionSourceOptions): (() => void) => {
	const readCompanionPanels = (botId: string) => {
		void roster.reload()
		rereadPlugin(botPlugin(botId))
	}

	const readSpacePanel = (conversationId: string) => {
		const spaceRowId = roster.spaceOfConversation(conversationId)
		if (spaceRowId) {
			rereadPlugin(spacePlugin(roster.hostSpaceIdOf(spaceRowId)))
		}
	}

	const readPanels = (scope: RuntimeScope, bundle: EvolvedBundle) => {
		if (bundle === "user") {
			return rereadPlugin(USER_PLUGIN)
		}
		if (bundle === "space") {
			return readSpacePanel(scope.conversationId)
		}
		return readCompanionPanels(scope.botId)
	}

	const reportUnrecorded = (bundle: EvolvedBundle, detail: string) =>
		reportFailure({
			title: i18n.t(`bots:history.recordFailed.title.${bundle}`),
			description: i18n.t("bots:history.recordFailed.description", {
				detail,
			}),
		})

	const detach = driver
		.subscribe(({ scope, event }) => {
			if (!scope) {
				return
			}
			if (event.type === "botEvolved") {
				readPanels(scope, event.bundle)
			}
			if (event.type === "botEvolutionFailed") {
				reportUnrecorded(event.bundle, event.detail)
			}
		})
		.catch(() => undefined)

	return () => {
		void detach.then((stop) => stop?.())
	}
}
