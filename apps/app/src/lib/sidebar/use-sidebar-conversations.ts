import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar-model"

import type { Section } from "@/lib/conversations/store-contract"
import { soloThreadRowsOf } from "@/lib/sidebar/solo-thread-rows"
import { useSharedStructure } from "@/lib/use-shared-structure"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

const NO_SECTIONS: Section[] = []

const NO_ROWS: never[] = []

type SpaceRows = {
	agents: AppSidebarBot[]
	conversations: AppSidebarConversation[]
	spaceId: string | null
}

const useConversationsOf = ({ agents, conversations, spaceId }: SpaceRows) => {
	const { core, rosterView } = useWorkspace()
	const { sections } = core.sections.state

	return {
		conversations: useSharedStructure([
			...conversations,
			...soloThreadRowsOf({
				agents,
				soloThreads: rosterView.soloThreads,
				spaceId,
			}),
		]),
		sections:
			spaceId === null ? NO_SECTIONS : (sections[spaceId] ?? NO_SECTIONS),
	}
}

export const useSidebarConversations = () => {
	const { rosterView } = useWorkspace()
	const { rosterLists } = useWorkspaceFrame()

	return useConversationsOf({
		agents: rosterLists.rosterBots,
		conversations: rosterLists.rosterConversations,
		spaceId: rosterView.rosteredSpaceId,
	})
}

export const useSpaceSidebarConversations = (spaceId: string) => {
	const { rosterLists } = useWorkspaceFrame()

	return useConversationsOf({
		agents: rosterLists.rosterBotsBySpace[spaceId] ?? NO_ROWS,
		conversations: rosterLists.rosterConversationsBySpace[spaceId] ?? NO_ROWS,
		spaceId,
	})
}
