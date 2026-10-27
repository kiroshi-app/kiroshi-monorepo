import { useMemo } from "react"

import type { TitleBarTabsProps } from "@workspace/ui/components/title-bar-tabs"

import { type TabBot, type TabConversation, tabFaceOf } from "./tab-faces"
import { pageOf } from "./tab-pages"
import {
	useWorkspaceTabs,
	type WorkspaceTabsSource,
} from "./use-workspace-tabs"

import { useSharedStructure } from "../use-shared-structure"
import { useMissionTitles } from "../missions/use-mission-titles"

export type TitleBarTabsSource = WorkspaceTabsSource & {
	bots: TabBot[]
	conversations: TabConversation[]
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
	color,
}: TabConversation): TabConversation => ({ id, name, icon, color })

export const useTitleBarTabs = ({
	bots,
	conversations,
	tabs,
	hostStates,
	soloThreads,
	spaceId,
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
		const faces = {
			bots: tabBots,
			conversations: tabConversations,
			missionTitles,
		}
		return {
			tabs: tabViews.map((tab) => ({
				...tabFaceOf(tab.href, faces),
				id: tab.id,
				isPinned: tab.isPinned,
				isNeedingYou: tab.needsYou,
			})),
			activeTabId: activeId,
			canGoBack,
			canGoForward,
			hasClosedTab,
			onSelectTab: tabs.select,
			onCloseTab: tabs.close,
			onPinTab: tabs.pin,
			onUnpinTab: tabs.unpin,
			onCloseOtherTabs: tabs.closeOthers,
			onDuplicateTab: tabs.duplicate,
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
		activeId,
		canGoBack,
		canGoForward,
		hasClosedTab,
		tabs,
	])
}
