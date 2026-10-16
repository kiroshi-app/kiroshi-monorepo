import type { MissionBot } from "@workspace/ui/components/mission"

import type { Mission } from "./mission-contract"

import type { ThreadFace } from "@/lib/chat/thread-contract"
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
