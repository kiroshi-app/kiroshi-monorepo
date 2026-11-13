import type {
	AppSidebarBot,
	AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationTabIcon } from "@workspace/ui/components/conversation-tab-icon"
import { Icons } from "@workspace/ui/components/icons"
import type {
	TitleBarTab,
	TitleBarTabDescriptor,
} from "@workspace/ui/components/title-bar-tabs"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	isHomePage,
	isLibraryPage,
	isListPage,
	isMissionsPage,
	pageOf,
	type SettingsTarget,
	settingsTargetOf,
	type TabPage,
	threadRowIdOf,
} from "./tab-pages"

import { shownTitleOf, titleOf } from "../library/library-items"
import type { LibraryOpening } from "../navigation/library-search"
import { APPLICATIONS_ENTRY } from "../navigation/settings-search"

const BOT_AVATAR_SIDE = 16

export type TabFace = Pick<TitleBarTab, "title" | "icon" | "descriptor">

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

const SETTINGS_SUBTITLE_KEY = {
	user: "user",
	space: "space",
	companion: "agent",
	conversation: "conversation",
} as const satisfies Record<SettingsTarget, string>

const homeFace = (): TabFace => ({
	title: i18n.t("bots:rail.newConversation"),
	icon: <Icons.Add />,
})

const missionsFace = (): TabFace => ({
	title: i18n.t("bots:rail.missions"),
	icon: <Icons.Missions />,
})

const libraryFace = (): TabFace => ({
	title: i18n.t("common:library.title"),
	icon: <Icons.Library />,
})

const describedFace = (descriptor: TitleBarTabDescriptor): TabFace => ({
	...libraryFace(),
	title: descriptor.name,
	descriptor,
})

const libraryItemFaceOf = (opening: LibraryOpening): TabFace => {
	const name = shownTitleOf(opening.title ?? titleOf(opening))
	switch (opening.kind) {
		case "document":
			return describedFace({ kind: "library-document", icon: "File", name })
		case "image":
			return describedFace({ kind: "library-image", icon: "Image", name })
		case "board":
			return { title: name, icon: <Icons.Board /> }
	}
}

const libraryFaceOf = ({ libraryOpening }: TabPage): TabFace =>
	libraryOpening === undefined
		? libraryFace()
		: libraryItemFaceOf(libraryOpening)

const settingsFaceOf = (page: TabPage): TabFace => ({
	title:
		shownApplicationOf(page) ??
		i18n.t(
			`settings:screen.subtitle.${SETTINGS_SUBTITLE_KEY[settingsTargetOf(page)]}`,
		),
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
			size={BOT_AVATAR_SIDE}
		/>
	),
})

const conversationFaceOf = ({
	name,
	icon,
	color,
}: TabConversation): TabFace => ({
	title: name,
	icon: <ConversationTabIcon hue={color} icon={icon} />,
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
	if (isLibraryPage(page)) {
		return libraryFaceOf(page)
	}
	if (isHomePage(page)) {
		return homeFace()
	}
	if (isMissionsPage(page)) {
		return missionsFace()
	}
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
