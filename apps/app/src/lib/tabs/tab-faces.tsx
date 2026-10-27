import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { Icons } from "@workspace/ui/components/icons"
import type { TitleBarTab } from "@workspace/ui/components/title-bar-tabs"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	isListPage,
	pageOf,
	settingsTargetOf,
	type TabPage,
	threadRowIdOf,
} from "./tab-pages"

import { APPLICATIONS_ENTRY } from "../navigation/settings-search"

const TAB_ICON_SIDE = 16

export type TabFace = Pick<TitleBarTab, "title" | "icon">

export type TabBot = Pick<AppSidebarBot, "id" | "name" | "blot" | "image">

export type TabConversation = Pick<
	AppSidebarConversation,
	"id" | "name" | "icon" | "color"
>

export type TabFaceSources = {
	bots: TabBot[]
	conversations: TabConversation[]
	missionTitles: Readonly<Record<string, string>>
}

const emptyTabFace = (): TabFace => ({
	title: i18n.t("common:titleBar.newTab"),
	icon: <Icons.Conversations />,
})

const shownApplicationOf = ({ entry, application }: TabPage) =>
	entry === APPLICATIONS_ENTRY ? application : undefined

const settingsFaceOf = (page: TabPage): TabFace => ({
	title:
		shownApplicationOf(page) ??
		i18n.t(`settings:screen.subtitle.${settingsTargetOf(page)}`),
	icon: <Icons.Settings />,
})

const botFaceOf = (bot: TabBot): TabFace => ({
	title: bot.name,
	icon: (
		<BotIdentityAvatar
			hue={bot.blot}
			image={bot.image}
			name={bot.name}
			seed={bot.id}
			size={TAB_ICON_SIDE}
		/>
	),
})

const conversationFaceOf = (conversation: TabConversation): TabFace => ({
	title: conversation.name,
	icon: (
		<ConversationSubjectIcon
			hue={conversation.color}
			icon={conversation.icon}
			side={TAB_ICON_SIDE}
		/>
	),
})

const unknownRowFace = (): TabFace => ({
	title: i18n.t("chat:transcript.label"),
	icon: <Icons.Conversations />,
})

const rowFaceOf = (rowId: string, { bots, conversations }: TabFaceSources) => {
	const bot = bots.find((held) => held.id === rowId)
	if (bot) {
		return botFaceOf(bot)
	}
	const conversation = conversations.find((held) => held.id === rowId)
	return conversation ? conversationFaceOf(conversation) : unknownRowFace()
}

export const tabFaceOf = (href: string, sources: TabFaceSources): TabFace => {
	const page = pageOf(href)
	if (!isListPage(page)) {
		return settingsFaceOf(page)
	}
	const rowId = threadRowIdOf(page.thread)
	if (rowId === undefined) {
		return emptyTabFace()
	}
	const rowFace = rowFaceOf(rowId, sources)
	const { mission } = page.thread
	if (mission === undefined) {
		return rowFace
	}
	return {
		title: sources.missionTitles[mission] ?? rowFace.title,
		icon: <Icons.Missions />,
	}
}
