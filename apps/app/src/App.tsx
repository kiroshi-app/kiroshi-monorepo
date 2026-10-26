import { CompanionMenuProvider } from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { NewDeviceScreen } from "@workspace/ui/components/new-device-screen"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { probeRender } from "@workspace/ui/lib/render-probe"

import { AppDialogs } from "@/components/app-dialogs"
import { StartupScreen } from "@/components/startup-screen"
import { WorkspaceBody } from "@/components/workspace-body"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { SessionApplicationsContext } from "@/lib/applications/use-session-application"
import { ThreadAuthorshipContext } from "@/lib/chat/thread-authorship"
import { ConversationSeatingContext } from "@/lib/conversations/use-conversation-seating"
import { useNewDevice } from "@/lib/devices/use-new-device"
import { isSidebarResizable } from "@/lib/host"
import { useInvokePhaseEnd } from "@/lib/perf/use-invoke-phase-end"
import { useCompanionMenuLookup } from "@/lib/sidebar/companion-menu"
import { useCompanionSelectGuard } from "@/lib/sidebar/companion-select"
import { OpenJoinedHostContext } from "@/lib/spaces/open-joined-host"
import {
	useOpenJoinedHost,
	useSwitcherSpaces,
} from "@/lib/spaces/use-joined-spaces"
import { aboutFieldsOf } from "@/lib/updater/about-fields"
import { useRunningVersion } from "@/lib/updater/use-running-version"
import { useWhatsNew } from "@/lib/updater/use-whats-new"
import { useApplicationScopes } from "@/lib/workspace/use-application-scopes"
import { useRosterLines } from "@/lib/workspace/use-roster-lines"
import { useRosterView } from "@/lib/workspace/use-roster-view"
import { useSettingsPanels } from "@/lib/workspace/use-settings-panels"
import { useSidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import { useSpaceLoading } from "@/lib/workspace/use-space-loading"
import { useSpaceSections } from "@/lib/workspace/use-space-sections"
import { useThreadAuthorship } from "@/lib/workspace/use-thread-authorship"
import { useWorkspaceCore } from "@/lib/workspace/use-workspace-core"
import { useWorkspaceDrivers } from "@/lib/workspace/use-workspace-drivers"
import { useWorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import { useWorkspaceSubscriptions } from "@/lib/workspace/use-workspace-subscriptions"

export function App() {
	probeRender("App")
	const core = useWorkspaceCore()
	const drivers = useWorkspaceDrivers(core)
	const scopes = useApplicationScopes(core)
	const rosterView = useRosterView({
		core,
		drivers,
		openRowId: scopes.openRowId,
	})
	const panels = useSettingsPanels({ core, rosterView, scopes })
	const rosteredHostSpaceId =
		rosterView.rosteredSpaceId &&
		core.roster.controller.hostSpaceIdOf(rosterView.rosteredSpaceId)
	const loadSpaces = useSpaceLoading({ core, scopes })
	useWorkspaceSubscriptions({ core, drivers, rosterView })
	const rosterLines = useRosterLines({ core, drivers, rosterView })
	const sidebarMissions = useSidebarMissions({ core, rosterLines })
	const overlay = useWorkspaceOverlay({ core, rosterLines, rosterView, scopes })
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

	const { preferences, roster, spaces } = core
	const isOpenSpaceRostered =
		rosterView.rosteredSpaceId === scopes.openRowId &&
		!roster.state.isRosterPending

	useInvokePhaseEnd("boot", rosterView.hasLoaded ? "startup screen gone" : null)
	useInvokePhaseEnd(
		"space switch",
		isOpenSpaceRostered ? scopes.openRowId : null,
	)

	if (newDevice) {
		return (
			<>
				<NewDeviceScreen {...newDevice} />
				<NoticeSurface />
			</>
		)
	}

	if (!rosterView.hasLoaded) {
		return (
			<StartupScreen
				hasFailed={spaces.state.hasFailedToLoad || roster.state.hasFailedToLoad}
				onRetry={
					spaces.state.hasFailedToLoad
						? loadSpaces
						: roster.controller.retryLoad
				}
			/>
		)
	}

	const railProps = {
		collapsedSectionIds,
		core,
		drivers,
		overlay,
		panels,
		rosterLines,
		rosterView,
		sidebarMissions,
		sidebarTab,
	}

	return (
		<>
			{panels.openSettings || panels.isCompanionScreenOpen ? (
				<WorkspaceSettings about={about} scopes={scopes} {...railProps} />
			) : (
				<WorkspaceShell
					spaceTint={scopes.selectedSpace?.colour}
					width={preferences.sidebarWidth ?? undefined}
					onWidthChange={overlay.changeSidebarWidth}
					isResizable={isSidebarResizable()}
					sidebar={<WorkspaceSidebar {...railProps} switcher={switcher} />}
				>
					<OpenJoinedHostContext.Provider value={joinedHost}>
						<ConversationSeatingContext.Provider
							value={rosterLines.conversationSeating}
						>
							<CompanionMenuProvider menuFor={companionMenu}>
								<CompanionSelectProvider onSelect={selectCompanion}>
									<SessionApplicationsContext.Provider
										value={panels.sessionApplications}
									>
										<ConversationApplicationsContext.Provider
											value={panels.conversationApplications}
										>
											<ThreadAuthorshipContext.Provider value={authorship}>
												<WorkspaceBody
													activityPanel={overlay.activityPanel}
													attachments={core.attachments}
													bot={rosterView.selected}
													bots={rosterView.bots}
													chat={core.chat}
													conversation={rosterView.selectedConversation}
													conversationRuntimes={core.conversationRuntimes}
													drafts={core.drafts}
													haveSpacesFailed={spaces.state.hasFailedToLoad}
													isConversationSettingsOpen={
														overlay.isThreadConversationSettingsOpen
													}
													isMissionsPanelOpen={
														sidebarTab.openTab === "missions"
													}
													isOverlayOpen={overlay.isOverlayOpen}
													landings={core.messageLandings}
													missions={core.openedMission}
													onboarding={
														preferences.firstRunDone
															? undefined
															: drivers.onboarding
													}
													onOpenConversationSettings={
														roster.controller.editConversation
													}
													onRetrySpaces={loadSpaces}
													onToggleSettings={overlay.toggleSettings}
													readerName={preferences.displayName}
													signIn={drivers.signIn}
													spaceId={rosteredHostSpaceId}
												/>
											</ThreadAuthorshipContext.Provider>
										</ConversationApplicationsContext.Provider>
									</SessionApplicationsContext.Provider>
								</CompanionSelectProvider>
							</CompanionMenuProvider>
						</ConversationSeatingContext.Provider>
					</OpenJoinedHostContext.Provider>
				</WorkspaceShell>
			)}
			<AppDialogs
				core={core}
				overlay={overlay}
				rosterLines={rosterLines}
				rosterView={rosterView}
				whatsNewDialog={whatsNew.dialog}
			/>
		</>
	)
}
