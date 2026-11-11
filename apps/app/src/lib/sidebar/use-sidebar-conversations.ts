import type { Section } from "@/lib/conversations/store-contract"
import { soloThreadRowsOf } from "@/lib/sidebar/solo-thread-rows"
import { useSharedStructure } from "@/lib/use-shared-structure"
import { useWorkspace } from "@/lib/workspace/workspace-context"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

const NO_SECTIONS: Section[] = []

const sectionsIn = (
	sectionsBySpaceId: Record<string, Section[]>,
	spaceId: string | null,
) =>
	spaceId === null ? NO_SECTIONS : (sectionsBySpaceId[spaceId] ?? NO_SECTIONS)

export const useSidebarConversations = () => {
	const { core, rosterView } = useWorkspace()
	const { rosterLists } = useWorkspaceFrame()

	return {
		conversations: useSharedStructure([
			...rosterLists.rosterConversations,
			...soloThreadRowsOf({
				agents: rosterLists.rosterBots,
				soloThreads: rosterView.soloThreads,
				spaceId: rosterView.rosteredSpaceId,
			}),
		]),
		sections: sectionsIn(
			core.sections.state.sections,
			rosterView.rosteredSpaceId,
		),
	}
}

const NO_ROWS: never[] = []

export const useSpaceSidebarConversations = (spaceId: string) => {
	const { core, rosterView } = useWorkspace()
	const { rosterLists } = useWorkspaceFrame()

	return {
		conversations: useSharedStructure([
			...(rosterLists.rosterConversationsBySpace[spaceId] ?? NO_ROWS),
			...soloThreadRowsOf({
				agents: rosterLists.rosterBotsBySpace[spaceId] ?? NO_ROWS,
				soloThreads: rosterView.soloThreads,
				spaceId,
			}),
		]),
		sections: sectionsIn(core.sections.state.sections, spaceId),
	}
}
