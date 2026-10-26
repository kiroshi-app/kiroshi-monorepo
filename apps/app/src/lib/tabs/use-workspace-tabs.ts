import { useSyncExternalStore } from "react"

import type { BotBadge } from "@workspace/ui/components/bot-badge"

import { pageOf, threadRowIdOf } from "./tab-pages"
import { activeTabOf, currentHrefOf, type Tab } from "./tabs-model"
import { shownTabsOf, type WorkspaceTabs } from "./workspace-tabs"

import type { SoloThreads } from "../bots/roster-line"
import type { ConversationHostStates } from "../bots/roster-pages"
import { botHostStatesIn, withNeedsYou } from "../conversations/host-state-rows"

export type WorkspaceTabsSource = {
	tabs: WorkspaceTabs
	hostStates: ConversationHostStates
	soloThreads: SoloThreads
	spaceId: string | null
}

export type TabView = {
	id: string
	href: string
	isPinned: boolean
	needsYou: boolean
}

type ThreadRow = {
	id: string
	badge?: BotBadge
}

const threadRowsOf = (tabs: Tab[]): ThreadRow[] =>
	tabs.flatMap((tab) => {
		const rowId = threadRowIdOf(pageOf(currentHrefOf(tab)).thread)
		return rowId === undefined ? [] : [{ id: rowId }]
	})

const rowIdsNeedingYouIn = (
	tabs: Tab[],
	{ hostStates, soloThreads, spaceId }: Omit<WorkspaceTabsSource, "tabs">,
) => {
	const states = {
		...hostStates,
		...botHostStatesIn({ hostStates, soloThreads, spaceId }),
	}
	return new Set(
		withNeedsYou(threadRowsOf(tabs), states)
			.filter((row) => row.badge === "attention")
			.map((row) => row.id),
	)
}

const tabViewOf = (tab: Tab, needingYou: Set<string>): TabView => {
	const href = currentHrefOf(tab)
	const rowId = threadRowIdOf(pageOf(href).thread)
	return {
		id: tab.id,
		href,
		isPinned: tab.isPinned,
		needsYou: rowId !== undefined && needingYou.has(rowId),
	}
}

export const useWorkspaceTabs = ({ tabs, ...needs }: WorkspaceTabsSource) => {
	const state = useSyncExternalStore(tabs.subscribe, tabs.getState)
	const space = shownTabsOf(state)
	const needingYou = rowIdsNeedingYouIn(space.tabs, needs)

	return {
		tabs: space.tabs.map((tab) => tabViewOf(tab, needingYou)),
		activeId: activeTabOf(space).id,
		select: tabs.select,
		pin: tabs.pin,
		unpin: tabs.unpin,
		close: tabs.close,
		closeOthers: tabs.closeOthers,
		reorder: tabs.reorder,
		openEmptyTab: tabs.openEmptyTab,
		openInNewTab: tabs.openInNewTab,
	}
}
