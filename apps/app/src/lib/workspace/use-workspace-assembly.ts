import { useRouter } from "@tanstack/react-router"
import { useMemo } from "react"

import { useApplicationScopes } from "./use-application-scopes"
import { useRosterLines } from "./use-roster-lines"
import { useRosterView } from "./use-roster-view"
import { useSettingsPanels } from "./use-settings-panels"
import { useSidebarMissions } from "./use-sidebar-missions"
import { useSidebarPanelSwitch } from "./use-sidebar-panel-switch"
import { useSpaceLoading } from "./use-space-loading"
import { useSpaceSections } from "./use-space-sections"
import { useThreadAuthorship } from "./use-thread-authorship"
import { useWorkspaceCore } from "./use-workspace-core"
import { useWorkspaceDrivers } from "./use-workspace-drivers"
import { useWorkspaceOverlay } from "./use-workspace-overlay"
import { useWorkspaceSubscriptions } from "./use-workspace-subscriptions"

import { useNewDevice } from "../devices/use-new-device"
import { useOpenSettings } from "../navigation/open-settings"
import { useSettingsNavigation } from "../navigation/use-settings-navigation"
import { useCompanionMenuLookup } from "../sidebar/companion-menu"
import { useCompanionSelectGuard } from "../sidebar/companion-select"
import {
	useOpenJoinedHost,
	useSwitcherSpaces,
} from "../spaces/use-joined-spaces"
import { useNewTabClicks } from "../tabs/new-tab-clicks"
import { useTabKeys } from "../tabs/use-tab-keys"
import { useTabThreadSync } from "../tabs/use-tab-thread-sync"
import { useSpaceTint } from "../theme/use-space-tint"
import { aboutFieldsOf } from "../updater/about-fields"
import { useRunningVersion } from "../updater/use-running-version"
import { useWhatsNew } from "../updater/use-whats-new"

export const useWorkspaceAssembly = () => {
	const openSettings = useOpenSettings()
	const core = useWorkspaceCore(openSettings)
	const threadHolder = useMemo(
		() => ({
			roster: core.roster.controller,
			openedMission: core.openedMission,
		}),
		[core.roster.controller, core.openedMission],
	)
	const navigation = useSettingsNavigation(threadHolder)
	const { tabs } = useRouter().options.context
	const drivers = useWorkspaceDrivers(core, tabs.isMainWindow)
	const scopes = useApplicationScopes(core)
	useSpaceTint(scopes.spaceHue)
	const rosterView = useRosterView({
		core,
		drivers,
		openRowId: scopes.openRowId,
		openSettings,
	})
	const panels = useSettingsPanels({
		core,
		navigation,
		openSettings,
		rosterView,
		scopes,
	})
	const rosteredHostSpaceId =
		rosterView.rosteredSpaceId &&
		core.roster.controller.hostSpaceIdOf(rosterView.rosteredSpaceId)
	const loadSpaces = useSpaceLoading({
		core,
		scopes,
		isMainWindow: tabs.isMainWindow,
		reopenedSpaceId: tabs.reopenedSpaceId,
	})
	useTabKeys(tabs)
	useNewTabClicks(tabs)
	useTabThreadSync({
		tabs,
		roster: core.roster.controller,
		selected: core.roster.state,
		openedMission: core.openedMission,
		openSpaceId: scopes.openRowId,
		isOpenSpaceRostered:
			rosterView.hasLoaded &&
			rosterView.rosteredSpaceId === scopes.openRowId &&
			!core.roster.state.isRosterPending,
	})
	useWorkspaceSubscriptions({ core, drivers, rosterView })
	const rosterLines = useRosterLines({
		core,
		drivers,
		rosterView,
		settings: navigation,
	})
	const sidebarMissions = useSidebarMissions({
		core,
		rosterLines,
		navigation,
	})
	const overlay = useWorkspaceOverlay({
		core,
		navigation,
		openSettings,
		rosterLines,
		rosterView,
		scopes,
	})
	const collapsedSectionIds = useSpaceSections({ core, rosterLines })
	const sidebarTab = useSidebarPanelSwitch({
		core,
		sidebarMissions,
		tabs,
	})
	const selectCompanion = useCompanionSelectGuard({
		openSpaceId: scopes.openRowId,
		rosters: core.roster.state.rosters,
		select: core.roster.controller.select,
		leaveMission: core.openedMission.leave,
		openThreadInNewTab: navigation.openThreadInNewTab,
	})
	const switcher = useSwitcherSpaces(
		core.spaces.state,
		core.joinedSpaces,
		core.invitations,
	)
	const companionMenu = useCompanionMenuLookup({
		actions: rosterLines.sidebarActions,
		conversationRosters: core.roster.state.conversationRosters,
		openSpaceId: scopes.openRowId,
		rosters: core.roster.state.rosters,
		sectionsBySpaceId: core.sections.state.sections,
		spaces: switcher.ownedSpaces,
	})
	const authorship = useThreadAuthorship(core)
	const joinedHost = useOpenJoinedHost(
		core.spaces.state.selectedSpaceId,
		core.joinedSpaces,
	)
	const newDevice = useNewDevice(core.account)
	const runningVersion = useRunningVersion()
	const whatsNew = useWhatsNew({ user: core.user, runningVersion })
	const about = aboutFieldsOf({
		updater: drivers.updater,
		user: core.user,
		runningVersion,
		onWhatsNew: whatsNew.openFromAbout,
	})

	return {
		about,
		authorship,
		collapsedSectionIds,
		companionMenu,
		core,
		drivers,
		joinedHost,
		loadSpaces,
		navigation,
		newDevice,
		overlay,
		panels,
		rosterLines,
		rosterView,
		rosteredHostSpaceId,
		scopes,
		selectCompanion,
		sidebarMissions,
		sidebarTab,
		switcher,
		tabs,
		whatsNew,
	}
}

export type WorkspaceAssembly = ReturnType<typeof useWorkspaceAssembly>
