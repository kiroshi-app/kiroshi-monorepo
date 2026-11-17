import type { MissionBot } from "@workspace/ui/components/mission"

import type { Mission } from "./mission-contract"
import type { MissionEntry } from "./missions-model"

import type { SoloThreads } from "@/lib/bots/roster-line"
import type { ThreadFace } from "@/lib/chat/thread-contract"
import { conversationName } from "@/lib/conversations/roster-conversations"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"

type MissionSeat = {
	mission: Mission
	bot: Bot
}

export const toMissionFace = ({ id, ...face }: ThreadFace): MissionBot => ({
	...face,
	seed: id,
})

export const toMissionConversation = ({
	mission,
	bot,
}: MissionSeat): Conversation => ({
	id: mission.threadConversationId,
	spaceId: null,
	sectionId: null,
	pinPosition: null,
	title: mission.objective,
	instructions: "",
	icon: null,
	color: null,
	createdAt: mission.openedAt,
	updatedAt: mission.openedAt,
	participants: [
		{
			botId: bot.id,
			role: "lead",
			joinedAt: mission.openedAt,
			leftAt: null,
			name: bot.name,
			avatarBlot: bot.avatarBlot,
			avatarImagePath: bot.avatarImagePath,
			isDeleted: false,
		},
	],
})

export type MissionOrigins = {
	conversations: Conversation[]
	soloThreads: SoloThreads
	bots: Bot[]
	missionMarks: MissionEntry[]
}

const originLabelOf = (
	originConversationId: string,
	{ conversations, soloThreads, bots }: MissionOrigins,
): string | undefined => {
	const conversation = conversations.find(
		({ id }) => id === originConversationId,
	)
	if (conversation) {
		return conversationName(conversation)
	}
	const soloBotId = soloThreads[originConversationId]?.botId
	return bots.find(({ id }) => id === soloBotId)?.name
}

const markedOriginOf = (missionId: string, missionMarks: MissionEntry[]) =>
	missionMarks.find(({ mission }) => mission.id === missionId)?.mission
		.originConversationId

export const missionPathLabelOf = (
	missionId: string,
	readMission: Mission | undefined,
	origins: MissionOrigins,
): string | undefined => {
	const originConversationId =
		readMission?.originConversationId ??
		markedOriginOf(missionId, origins.missionMarks)
	return originConversationId === undefined
		? undefined
		: originLabelOf(originConversationId, origins)
}
