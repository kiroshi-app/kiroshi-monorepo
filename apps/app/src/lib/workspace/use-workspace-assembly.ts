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
import { useSpaceTint } from "../theme/use-space-tint"
import { aboutFieldsOf } from "../updater/about-fields"
import { useRunningVersion } from "../updater/use-running-version"
import { useWhatsNew } from "../updater/use-whats-new"

export const useWorkspaceAssembly = () => {
	const openSettings = useOpenSettings()
	const navigation = useSettingsNavigation()
	const core = useWorkspaceCore(openSettings)
	const drivers = useWorkspaceDrivers(core)
	const scopes = useApplicationScopes(core)
	useSpaceTint(scopes.spaceTint)
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
	const loadSpaces = useSpaceLoading({ core, scopes })
	useWorkspaceSubscriptions({ core, drivers, rosterView })
	const rosterLines = useRosterLines({
		core,
		drivers,
		rosterView,
		settings: navigation,
	})
	const sidebarMissions = useSidebarMissions({ core, rosterLines })
	const overlay = useWorkspaceOverlay({
		core,
		openSettings,
		rosterLines,
		rosterView,
		scopes,
	})
	const collapsedSectionIds = useSpaceSections({ core, rosterLines })
	const sidebarTab = useSidebarPanelSwitch({ core, sidebarMissions })
	const companionMenu = useCompanionMenuLookup({
		actions: rosterLines.sidebarActions,
		conversationRosters: core.roster.state.conversationRosters,
		openSpaceId: scopes.openRowId,
		rosters: core.roster.state.rosters,
		sectionsBySpaceId: core.sections.state.sections,
		spaces: core.spaces.state.spaces,
	})
	const selectCompanion = useCompanionSelectGuard({
		openSpaceId: scopes.openRowId,
		rosters: core.roster.state.rosters,
		select: core.roster.controller.select,
		leaveMission: core.openedMission.leave,
	})
	const switcher = useSwitcherSpaces(
		core.spaces.state,
		core.joinedSpaces,
		core.invitations,
	)
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
		whatsNew,
	}
}

export type WorkspaceAssembly = ReturnType<typeof useWorkspaceAssembly>
