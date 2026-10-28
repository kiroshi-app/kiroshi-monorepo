import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"

import type { SceneSpace } from "./scene-cast"

const TAB_ICON_SIDE = 16

const tabOf = (space: SceneSpace, rowId: string): TitleBarTab | undefined => {
	const bot = space.rows.find((row) => row.id === rowId)
	if (bot)
		return {
			id: bot.id,
			title: bot.name,
			icon: (
				<BotIdentityAvatar
					hue={bot.blot}
					name={bot.name}
					seed={bot.id}
					size={TAB_ICON_SIDE}
				/>
			),
		}

	const conversation = space.conversations.find((row) => row.id === rowId)
	if (conversation)
		return {
			id: conversation.id,
			title: conversation.name,
			icon: (
				<ConversationSubjectIcon
					icon={conversation.icon}
					side={TAB_ICON_SIDE}
				/>
			),
		}

	return undefined
}

const openTabIdsOf = (space: SceneSpace, selectedId: string) =>
	space.openTabIds.includes(selectedId)
		? space.openTabIds
		: [...space.openTabIds, selectedId]

export const sceneTabsOf = (
	space: SceneSpace,
	selectedId: string,
): TitleBarTab[] =>
	openTabIdsOf(space, selectedId)
		.map((rowId) => tabOf(space, rowId))
		.filter((tab) => tab !== undefined)
