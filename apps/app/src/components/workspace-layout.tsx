import { Outlet } from "@tanstack/react-router"

import { CompanionMenuProvider } from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { NewDeviceScreen } from "@workspace/ui/components/new-device-screen"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { probeRender } from "@workspace/ui/lib/render-probe"

import { AppDialogs } from "@/components/app-dialogs"
import { StartupScreen } from "@/components/startup-screen"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { SessionApplicationsContext } from "@/lib/applications/use-session-application"
import { ThreadAuthorshipContext } from "@/lib/chat/thread-authorship"
import { ConversationSeatingContext } from "@/lib/conversations/use-conversation-seating"
import { useInvokePhaseEnd } from "@/lib/perf/use-invoke-phase-end"
import { OpenJoinedHostContext } from "@/lib/spaces/open-joined-host"
import { useWorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

export const WorkspaceLayout = () => {
	probeRender("App")
	const workspace = useWorkspaceAssembly()
	const {
		authorship,
		companionMenu,
		core,
		joinedHost,
		loadSpaces,
		newDevice,
		overlay,
		panels,
		rosterLines,
		rosterView,
		scopes,
		selectCompanion,
		whatsNew,
	} = workspace
	const { roster, spaces } = core
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

	return (
		<WorkspaceContext.Provider value={workspace}>
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
										<Outlet />
									</ThreadAuthorshipContext.Provider>
								</ConversationApplicationsContext.Provider>
							</SessionApplicationsContext.Provider>
						</CompanionSelectProvider>
					</CompanionMenuProvider>
				</ConversationSeatingContext.Provider>
			</OpenJoinedHostContext.Provider>
			<AppDialogs
				core={core}
				overlay={overlay}
				whatsNewDialog={whatsNew.dialog}
			/>
		</WorkspaceContext.Provider>
	)
}
