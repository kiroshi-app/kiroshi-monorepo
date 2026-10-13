import { useCallback, useMemo } from "react"

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
import { applicationToOpenIn } from "../applications/settings-target"
import { useHistoryView } from "../bots/use-history-view"
import { toPluginSkills } from "../plugins/plugin-skills"

const ACCOUNT_TAB = "account"

const MEMBERS_TAB = "members"

type SettingsPanelsInput = {
	core: WorkspaceCore
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const useSettingsPanels = ({
	core,
	rosterView,
	scopes,
}: SettingsPanelsInput) => {
	const {
		applications,
		chat,
		companionPlugin,
		roster,
		spacePlugin,
		spaces,
		user,
		userPlugin,
	} = core
	const { isEditing, settingsBotId } = rosterView
	const {
		isSpaceEditing,
		selectedSpaceId,
		setOpenedMcpServer,
		setSettingsApplication,
		setSettingsTab,
		settingsApplication,
	} = scopes

	const botHistory = useHistoryView({
		...companionPlugin.state,
		isOpen: isEditing,
		onOpenRun: companionPlugin.actions.openFiles,
		onUndoRun: (oldestCommitId, newestCommitId) => {
			companionPlugin.actions.revert(oldestCommitId, newestCommitId)
			if (settingsBotId) chat.controller.redescribe(settingsBotId)
		},
	})

	const spaceHistory = useHistoryView({
		...spacePlugin.state,
		isOpen: isSpaceEditing,
		onOpenRun: spacePlugin.actions.openFiles,
		onUndoRun: spacePlugin.actions.revert,
	})

	const userHistory = useHistoryView({
		...userPlugin.state,
		isOpen: user.state.isSettingsOpen,
		onOpenRun: userPlugin.actions.openFiles,
		onUndoRun: userPlugin.actions.revert,
	})

	const companionSkills = toPluginSkills(companionPlugin)
	const spaceSkills = toPluginSkills(spacePlugin)
	const personSkills = toPluginSkills(userPlugin)

	const applicationToOpenOn = (scope: ReopenedScope) =>
		applicationToOpenIn(scope, settingsApplication)

	const closeSettingsTab = () => {
		setSettingsTab(undefined)
		setSettingsApplication(undefined)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the setters come from useState in useApplicationScopes and never change
	const openApplicationsOf = useCallback(
		(scope: ReopenedScope, server?: string) => {
			setSettingsTab(APPLICATIONS_TAB)
			setSettingsApplication(
				server ? { scope, application: server } : undefined,
			)
			setOpenedMcpServer(
				openedServerScope(server ?? null, ownerOfScope(scope, selectedSpaceId)),
			)
			if (scope.kind === "user") {
				user.controller.setSettingsOpen(true)
			} else if (scope.kind === "companion") {
				roster.controller.edit(scope.id)
			} else {
				spaces.controller.setSettingsOpen(true)
			}
		},
		[roster.controller, spaces.controller, user.controller, selectedSpaceId],
	)

	const openAccountSettings = () => {
		setSettingsTab(ACCOUNT_TAB)
		user.controller.setSettingsOpen(true)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the setter comes from useState in useApplicationScopes and never changes
	const openSpaceMembers = useCallback(() => {
		setSettingsTab(MEMBERS_TAB)
		spaces.controller.setSettingsOpen(true)
	}, [spaces.controller])

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
		applicationToOpenOn,
		botHistory,
		closeSettingsTab,
		companionSkills,
		conversationApplications,
		openAccountSettings,
		openSpaceMembers,
		personSkills,
		sessionApplications,
		spaceHistory,
		spaceSkills,
		userHistory,
	}
}

export type SettingsPanels = ReturnType<typeof useSettingsPanels>
