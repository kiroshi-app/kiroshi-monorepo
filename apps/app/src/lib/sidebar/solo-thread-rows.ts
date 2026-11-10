import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar-model"

import type { SoloThreads } from "../bots/roster-line"

type SoloThreadRowsSource = {
	agents: AppSidebarBot[]
	soloThreads: SoloThreads
	spaceId: string | null
}

const soloThreadRowOf = (agent: AppSidebarBot): AppSidebarConversation => ({
	id: agent.id,
	name: agent.name,
	participants: [agent],
	sectionId: agent.sectionId,
	pinPosition: agent.pinPosition,
	lastMessage: agent.lastMessage,
	timestamp: agent.timestamp,
	lastActivityAt: agent.lastActivityAt,
	status: agent.status,
	badge: agent.badge,
	pendingQuestion: agent.pendingQuestion,
	missions: agent.missions,
	color: agent.blot,
})

export const soloThreadRowsOf = ({
	agents,
	soloThreads,
	spaceId,
}: SoloThreadRowsSource): AppSidebarConversation[] => {
	const agentIdsWithThread = new Set(
		Object.values(soloThreads)
			.filter((line) => line.spaceId === spaceId)
			.map((line) => line.botId),
	)
	return agents
		.filter((agent) => agentIdsWithThread.has(agent.id))
		.map(soloThreadRowOf)
}
