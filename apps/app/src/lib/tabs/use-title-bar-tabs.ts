import { useMemo } from "react"

import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"

import {
	drawGhost,
	type GhostSources,
	type ThumbnailConversation,
} from "./ghost-thumbnail"
import { type TabBot, type TabConversation, tabFaceOf } from "./tab-faces"
import { pageOf } from "./tab-pages"
import type { TabTearOff } from "./tab-tear-off"
import {
	useWorkspaceTabs,
	type WorkspaceTabsSource,
} from "./use-workspace-tabs"

import { useSharedStructure } from "../use-shared-structure"
import type { TranscriptPort } from "../conversations/transcript-port"
import { useMissionTitles } from "../missions/use-mission-titles"

type TitleBarConversation = TabConversation &
	Pick<AppSidebarConversation, "participants">

export type TitleBarTabsSource = WorkspaceTabsSource & {
	bots: TabBot[]
	conversations: TitleBarConversation[]
	readTranscript: TranscriptPort["loadPage"]
}

const missionIdsOf = (hrefs: string[]) =>
	hrefs
		.map((href) => pageOf(href).thread.mission)
		.filter((mission) => mission !== undefined)

const tabBotOf = ({ id, name, blot, image }: TabBot): TabBot => ({
	id,
	name,
	blot,
	image,
})

const tabConversationOf = ({
	id,
	name,
	icon,
	participants,
}: TitleBarConversation): ThumbnailConversation => ({
	id,
	name,
	icon,
	companionName: participants[0]?.name,
})

export const useTitleBarTabs = ({
	bots,
	conversations,
	tabs,
	hostStates,
	soloThreads,
	spaceId,
	readTranscript,
}: TitleBarTabsSource): TitleBarTabsProps => {
	const view = useWorkspaceTabs({ tabs, hostStates, soloThreads, spaceId })
	const tabViews = useSharedStructure(view.tabs)
	const tabBots = useSharedStructure(bots.map(tabBotOf))
	const tabConversations = useSharedStructure(
		conversations.map(tabConversationOf),
	)
	const missionTitles = useMissionTitles(
		missionIdsOf(tabViews.map((tab) => tab.href)),
	)
	const { activeId, canGoBack, canGoForward, hasClosedTab } = view

	return useMemo(() => {
		const ghostSources: GhostSources = {
			bots: tabBots,
			conversations: tabConversations,
			missionTitles,
			soloThreads,
			spaceId,
			readTranscript,
		}
		const startTearOff = (tearOff: TabTearOff) => {
			const torn = tabViews.find((tab) => tab.id === tearOff.tabId)
			if (!torn) {
				return
			}
			const { title } = tabFaceOf(torn.href, ghostSources)
			const ghost = { tabId: torn.id, href: torn.href, title }
			tabs.tearOffSession.start(tearOff, (size) =>
				drawGhost(ghost, size, ghostSources),
			)
		}
		return {
			tabs: tabViews.map((tab) => ({
				...tabFaceOf(tab.href, ghostSources),
				id: tab.id,
				isPinned: tab.isPinned,
				isNeedingYou: tab.needsYou,
			})),
			activeTabId: activeId,
			canGoBack,
			canGoForward,
			hasClosedTab,
			onSelectTab: tabs.select,
			onCloseTab: tabs.closeUnpinned,
			onPinTab: tabs.pin,
			onUnpinTab: tabs.unpin,
			onCloseOtherTabs: tabs.closeOthers,
			onDuplicateTab: tabs.duplicate,
			onMoveTabToNewWindow: tabs.moveToNewWindow,
			onTearOffTab: tabs.tearOffSession.drop,
			onTearOffStart: startTearOff,
			onTearOffMove: tabs.tearOffSession.move,
			onTearOffCancel: tabs.tearOffSession.cancel,
			onReopenClosedTab: tabs.reopenClosed,
			onReorderTabs: tabs.reorder,
			onNewTab: tabs.openEmptyTab,
			onGoBack: tabs.back,
			onGoForward: tabs.forward,
		}
	}, [
		tabViews,
		tabBots,
		tabConversations,
		missionTitles,
		soloThreads,
		spaceId,
		readTranscript,
		activeId,
		canGoBack,
		canGoForward,
		hasClosedTab,
		tabs,
	])
}
