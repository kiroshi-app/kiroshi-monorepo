import { AppSidebar } from "@workspace/ui/components/app-sidebar"
import { CompanionMenuProvider } from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"
import { probeRender } from "@workspace/ui/lib/render-probe"

import { AppDialogs } from "@/components/app-dialogs"
import { StartupScreen } from "@/components/startup-screen"
import { titleBarWindowControls } from "@/components/window-caption-controls"
import { WorkspaceBody } from "@/components/workspace-body"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { SessionApplicationsContext } from "@/lib/applications/use-session-application"
import { ThreadAuthorshipContext } from "@/lib/chat/thread-authorship"
import { ConversationSeatingContext } from "@/lib/conversations/use-conversation-seating"
import { hasOverlayWindowControls, isSidebarResizable } from "@/lib/host"
import { useInvokePhaseEnd } from "@/lib/perf/use-invoke-phase-end"
import { useCompanionMenuLookup } from "@/lib/sidebar/companion-menu"
import { useCompanionSelectGuard } from "@/lib/sidebar/companion-select"
import { OpenJoinedHostContext } from "@/lib/spaces/open-joined-host"
import {
	useOpenJoinedHost,
	useSwitcherSpaces,
} from "@/lib/spaces/use-joined-spaces"
import { useApplicationScopes } from "@/lib/workspace/use-application-scopes"
import { useRosterLines } from "@/lib/workspace/use-roster-lines"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
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
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})
	const overlay = useWorkspaceOverlay({ core, rosterLines, rosterView, scopes })
	const collapsedSectionIds = useSpaceSections({ core, rosterLines })
	const sidebarTab = useSidebarPanelSwitch({
		core,
		sidebarMissions,
		sidebarRosters: {
			botsBySpaceId: rosterLists.rosterBotsBySpace,
			conversationsBySpaceId: rosterLists.rosterConversationsBySpace,
			sectionsBySpaceId: core.sections.state.sections,
			collapsedSectionIds,
		},
	})
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

	const { preferences, roster, spaces } = core
	const isOpenSpaceRostered =
		rosterView.rosteredSpaceId === scopes.openRowId &&
		!roster.state.isRosterPending

	useInvokePhaseEnd("boot", rosterView.hasLoaded ? "startup screen gone" : null)
	useInvokePhaseEnd(
		"space switch",
		isOpenSpaceRostered ? scopes.openRowId : null,
	)

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

	return (
		<>
			<WorkspaceShell
				spaceTint={scopes.selectedSpace?.colour}
				width={preferences.sidebarWidth ?? undefined}
				onWidthChange={overlay.changeSidebarWidth}
				isResizable={isSidebarResizable()}
				sidebar={
					<AppSidebar
						data-tauri-drag-region="deep"
						insetWindowControls={hasOverlayWindowControls()}
						windowControls={titleBarWindowControls()}
						bots={rosterLines.rosterBots}
						haveBotsFailedToLoad={roster.state.hasFailedToLoad}
						rosterSkeleton={rosterLists.rosterSkeleton}
						rosterListEnd={roster.listEnd}
						botsBySpaceId={rosterLists.rosterBotsBySpace}
						conversations={rosterLists.rosterConversations}
						conversationsBySpaceId={rosterLists.rosterConversationsBySpace}
						badgesBySpaceId={rosterLists.badgesBySpaceId}
						railDots={rosterLists.railSignals}
						missionsBySpaceId={sidebarMissions.panelsBySpaceId}
						openPanel={sidebarTab.openTab}
						onOpenPanelChange={sidebarTab.openSidebarTab}
						collapsedSectionIds={collapsedSectionIds}
						sectionsBySpaceId={core.sections.state.sections}
						updateBadge={rosterLines.updateBadge}
						isSpaceSwitchingEnabled={!overlay.isOverlayOpen}
						onOpenSearch={overlay.search.open}
						{...rosterLines.sidebarActions}
						onCreateConversation={rosterLines.startConversation}
						selectedBotId={rosterView.selectedBotId ?? undefined}
						selectedConversationId={
							rosterView.selectedConversationId ?? undefined
						}
						selectedSpaceId={switcher.selectedSpaceId ?? undefined}
						spaces={switcher.spaces}
						hostBySpaceId={switcher.hostBySpaceId}
						invitations={switcher.invitations}
						onAcceptInvitation={switcher.onAcceptInvitation}
						onDeclineInvitation={switcher.onDeclineInvitation}
						onRetryInvitation={switcher.onRetryInvitation}
						onSpaceSwitcherOpenChange={switcher.onSpaceSwitcherOpenChange}
						onShare={panels.openSpaceMembers}
						user={overlay.userSettings}
					/>
				}
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
												isMissionsPanelOpen={sidebarTab.openTab === "missions"}
												isOverlayOpen={overlay.isOverlayOpen}
												isSettingsOpen={overlay.isThreadSettingsOpen}
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
			<AppDialogs
				core={core}
				overlay={overlay}
				panels={panels}
				rosterLines={rosterLines}
				rosterLists={rosterLists}
				rosterView={rosterView}
				scopes={scopes}
			/>
		</>
	)
}
