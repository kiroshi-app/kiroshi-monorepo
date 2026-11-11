import { conversationIconOf } from "@workspace/ui/components/conversation-subject-icon"
import type {
	MissionsPageMission,
	MissionsPageStatus,
} from "@workspace/ui/components/missions-page"

import type { MissionInSpace } from "./mission-contract"
import { missionFaceOf, missionStateOf, pullRequestOf } from "./missions-model"
import type { SpaceMissionsView } from "./use-space-missions"

import type { ThreadFace } from "@/lib/chat/thread-contract"
import type { Conversation } from "@/lib/conversations/store-contract"

type MissionsPageRead = {
	entries: MissionInSpace[]
	faceOf: (botId: string) => ThreadFace | undefined
	conversations: Conversation[]
}

const iconOfConversation = (
	conversations: Conversation[],
	conversationId: string,
) =>
	conversationIconOf(
		conversations.find(({ id }) => id === conversationId)?.icon ?? undefined,
	)

const toMissionsPageMission = (
	{ mission, conversationId, conversationTitle }: MissionInSpace,
	{ faceOf, conversations }: Omit<MissionsPageRead, "entries">,
): MissionsPageMission => {
	const agent = missionFaceOf(faceOf, mission.botId)
	return {
		id: mission.id,
		identifier: mission.ticket.externalId,
		title: mission.ticket.title || mission.objective,
		state: missionStateOf(mission),
		conversation: {
			title: conversationTitle,
			icon: iconOfConversation(conversations, conversationId),
		},
		agent: {
			id: agent.id,
			name: agent.name,
			hue: agent.blot,
			image: agent.image,
		},
		updatedAt: mission.closedAt ?? mission.lastActivityAt ?? mission.openedAt,
		pullRequest: pullRequestOf(mission.pullRequestUrl),
	}
}

export const toMissionsPageMissions = ({
	entries,
	...sources
}: MissionsPageRead): MissionsPageMission[] =>
	entries.map((entry) => toMissionsPageMission(entry, sources))

type MissionsFeedStatus = Pick<SpaceMissionsView, "isPending" | "hasFailed">

export const missionsPageStatusOf = ({
	isPending,
	hasFailed,
}: MissionsFeedStatus): MissionsPageStatus => {
	if (hasFailed) return "failed"
	return isPending ? "loading" : "loaded"
}
