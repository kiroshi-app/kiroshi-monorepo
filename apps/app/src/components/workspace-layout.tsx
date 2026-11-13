import { useState } from "react"

import { CompanionMenuProvider } from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import { NewDeviceScreen } from "@workspace/ui/components/new-device-screen"
import { NoticeSurface } from "@workspace/ui/components/notice-surface"
import { probeRender } from "@workspace/ui/lib/render-probe"

import { AppDialogs } from "@/components/app-dialogs"
import { ClaudeImport } from "@/components/claude-import"
import { OnboardingScreen } from "@/components/onboarding-screen"
import { StartupScreen } from "@/components/startup-screen"
import { WorkspaceFrameOutlet } from "@/components/workspace-frame"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { SessionApplicationsContext } from "@/lib/applications/use-session-application"
import { ThreadAuthorshipContext } from "@/lib/chat/thread-authorship"
import { ConversationSeatingContext } from "@/lib/conversations/use-conversation-seating"
import { onboardingStepOf } from "@/lib/onboarding/onboarding-flow-controller"
import { onboardingScreenStepOf } from "@/lib/onboarding/onboarding-screen"
import { useInvokePhaseEnd } from "@/lib/perf/use-invoke-phase-end"
import { OpenJoinedHostContext } from "@/lib/spaces/open-joined-host"
import { haveLaunchReadsSettled } from "@/lib/workspace/launch-reads"
import { useWorkspaceAssembly } from "@/lib/workspace/use-workspace-assembly"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

export const WorkspaceLayout = () => {
	probeRender("App")
	const workspace = useWorkspaceAssembly()
	const {
		authorship,
		claudeImport,
		companionMenu,
		core,
		drivers,
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
	const { roster, spaces, user } = core
	const [hasLeftLaunchLoader, setHasLeftLaunchLoader] = useState(false)
	const isOpenSpaceRostered =
		rosterView.rosteredSpaceId === scopes.openRowId &&
		!roster.state.isRosterPending

	useInvokePhaseEnd("boot", hasLeftLaunchLoader ? "startup screen gone" : null)
	useInvokePhaseEnd(
		"space switch",
		isOpenSpaceRostered ? scopes.openRowId : null,
	)

	if (!hasLeftLaunchLoader) {
		return (
			<StartupScreen
				agents={rosterView.bots}
				hasFailed={spaces.state.hasFailedToLoad}
				isExiting={haveLaunchReadsSettled({
					hasLoadedPreferences: user.state.hasLoaded,
					roster: roster.state,
				})}
				onExitComplete={() => setHasLeftLaunchLoader(true)}
				onRetry={loadSpaces}
			/>
		)
	}

	if (newDevice) {
		return (
			<>
				<NewDeviceScreen {...newDevice} />
				<NoticeSurface />
			</>
		)
	}

	const onboardingStep = onboardingScreenStepOf(
		onboardingStepOf(core.preferences),
		drivers.onboarding.state,
	)

	if (onboardingStep) {
		return (
			<>
				<OnboardingScreen
					account={core.account}
					flow={drivers.onboarding}
					importScene={claudeImport.scene}
					readerName={core.preferences.displayName}
					step={onboardingStep}
				/>
				<NoticeSurface />
			</>
		)
	}

	if (claudeImport.shown) {
		return (
			<>
				<ClaudeImport {...claudeImport.shown} />
				<NoticeSurface />
			</>
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
										<WorkspaceFrameOutlet />
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
