import { useCallback, useMemo } from "react"

import type { AppRailSettings } from "@workspace/ui/components/app-rail"

import type { ApplicationScopes } from "./use-application-scopes"
import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"

import { openedServerScope } from "../applications/application-settings"
import { applicationTransport } from "../applications/application-transport"
import { APPLICATIONS_TAB } from "../applications/connection-settings"
import {
	ownerOfScope,
	type ReopenedScope,
} from "../applications/session-reopening"
import { useHistoryView } from "../bots/use-history-view"
import type { OpenSettings } from "../navigation/open-settings"
import type { SettingsNavigation } from "../navigation/use-settings-navigation"
import { toPluginSkills } from "../plugins/plugin-skills"

export const ACCOUNT_TAB = "account"

const railSettingsOf = (
	openSettings: OpenSettings | null,
): AppRailSettings | undefined => {
	if (openSettings?.kind === "user") return "you"
	if (openSettings?.kind === "space") return "space"
	return openSettings?.isFromSpaceSettings ? "space" : undefined
}

type SettingsPanelsInput = {
	core: WorkspaceCore
	navigation: SettingsNavigation
	openSettings: OpenSettings | null
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const useSettingsPanels = ({
	core,
	navigation,
	openSettings,
	rosterView,
	scopes,
}: SettingsPanelsInput) => {
	const {
		applications,
		chat,
		companionPlugin,
		spacePlugin,
		spaces,
		userPlugin,
	} = core
	const { settingsBotId } = rosterView
	const { selectedSpaceId, setOpenedMcpServer } = scopes

	const botHistory = useHistoryView({
		...companionPlugin.state,
		isOpen: openSettings?.kind === "companion",
		onOpenRun: companionPlugin.actions.openFiles,
		onUndoRun: (oldestCommitId, newestCommitId) => {
			companionPlugin.actions.revert(oldestCommitId, newestCommitId)
			if (settingsBotId) chat.controller.redescribe(settingsBotId)
		},
	})

	const spaceHistory = useHistoryView({
		...spacePlugin.state,
		isOpen: openSettings?.kind === "space",
		onOpenRun: spacePlugin.actions.openFiles,
		onUndoRun: spacePlugin.actions.revert,
	})

	const userHistory = useHistoryView({
		...userPlugin.state,
		isOpen: openSettings?.kind === "user",
		onOpenRun: userPlugin.actions.openFiles,
		onUndoRun: userPlugin.actions.revert,
	})

	const companionSkills = toPluginSkills(companionPlugin)
	const spaceSkills = toPluginSkills(spacePlugin)
	const personSkills = toPluginSkills(userPlugin)

	const openApplicationsOf = useCallback(
		(scope: ReopenedScope, server?: string) => {
			setOpenedMcpServer(
				openedServerScope(server ?? null, ownerOfScope(scope, selectedSpaceId)),
			)
			const search = { entry: APPLICATIONS_TAB, application: server }
			if (scope.kind === "user") {
				navigation.openUserSettings(search)
			} else if (scope.kind === "companion") {
				navigation.openCompanionSettings(scope.id, search)
			} else {
				navigation.openSpaceSettings(search)
			}
		},
		[navigation, selectedSpaceId, setOpenedMcpServer],
	)

	const openAccountSettings = () =>
		navigation.openUserSettings({ entry: ACCOUNT_TAB })

	const conversationApplications = useMemo(
		() => ({
			port: applicationTransport,
			curated: applications.state.curated,
			spaces: spaces.state.spaces,
			onOpen: openApplicationsOf,
		}),
		[applications.state.curated, spaces.state.spaces, openApplicationsOf],
	)

	const sessionApplications = useMemo(
		() => ({ spaceId: selectedSpaceId }),
		[selectedSpaceId],
	)

	return {
		botHistory,
		companionSkills,
		conversationApplications,
		openAccountSettings,
		personSkills,
		railSettings: railSettingsOf(openSettings),
		sessionApplications,
		spaceHistory,
		spaceSkills,
		userHistory,
	}
}

export type SettingsPanels = ReturnType<typeof useSettingsPanels>
