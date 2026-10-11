import {
	type NoticeMessage,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { EvolvedBundle, RuntimeScope } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"
import {
	botPlugin,
	isSamePluginScope,
	spacePlugin as spacePluginScope,
} from "../conversations/plugin-scope"
import type { PluginScope } from "../conversations/store-contract"

type PluginPanel = {
	getState: () => { scope: PluginScope | null }
	reload: () => void
}

type RosterPanel = {
	spaceOfConversation: (conversationId: string) => string | undefined
	hostSpaceIdOf: (spaceRowId: string) => string
	reload: () => Promise<void>
}

export type EvolutionSourceOptions = {
	driver: Pick<ChatDriver, "subscribe">
	roster: RosterPanel
	companionPlugin: PluginPanel
	userPlugin: Pick<PluginPanel, "reload">
	spacePlugin: PluginPanel
	reportFailure?: (notice: NoticeMessage) => void
}

export const startEvolutionSource = ({
	driver,
	roster,
	companionPlugin,
	userPlugin,
	spacePlugin,
	reportFailure = raiseFailureNotice,
}: EvolutionSourceOptions): (() => void) => {
	const readOpenPanel = (panel: PluginPanel, scope: PluginScope) => {
		if (isSamePluginScope(panel.getState().scope, scope)) {
			panel.reload()
		}
	}

	const readCompanionPanels = (botId: string) => {
		void roster.reload()
		readOpenPanel(companionPlugin, botPlugin(botId))
	}

	const readSpacePanel = (conversationId: string) => {
		const spaceRowId = roster.spaceOfConversation(conversationId)
		if (spaceRowId) {
			readOpenPanel(
				spacePlugin,
				spacePluginScope(roster.hostSpaceIdOf(spaceRowId)),
			)
		}
	}

	const readPanels = (scope: RuntimeScope, bundle: EvolvedBundle) => {
		if (bundle === "user") {
			return userPlugin.reload()
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
