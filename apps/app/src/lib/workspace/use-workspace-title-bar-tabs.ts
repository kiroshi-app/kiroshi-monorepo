import type { RosterLists } from "./use-roster-lists"
import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"

import { useControllerState } from "../use-controller"
import { useTitleBarTabs } from "../tabs/use-title-bar-tabs"
import type { WorkspaceTabs } from "../tabs/workspace-tabs"

type WorkspaceTitleBarTabsSource = {
	core: WorkspaceCore
	rosterLists: RosterLists
	rosterView: RosterView
	tabs: WorkspaceTabs
}

export const useWorkspaceTitleBarTabs = ({
	core,
	rosterLists,
	rosterView,
	tabs,
}: WorkspaceTitleBarTabsSource) => {
	const { hostStates } = useControllerState(core.roster.controller)
	return useTitleBarTabs({
		tabs,
		hostStates,
		soloThreads: rosterView.soloThreads,
		spaceId: rosterView.rosteredSpaceId,
		bots: rosterLists.rosterBots,
		conversations: rosterLists.rosterConversations,
		readTranscript: core.store.loadPage,
	})
}
