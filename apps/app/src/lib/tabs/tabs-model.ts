import type { HistoryLocation } from "@tanstack/react-router"

import {
	EMPTY_LIST_HREF,
	isEmptyListPage,
	pageKeyOf,
	pageOf,
} from "./tab-pages"

type EntryState = HistoryLocation["state"]

export type TabEntry = {
	href: string
	state: EntryState
}

export type Tab = {
	id: string
	isPinned: boolean
	entries: TabEntry[]
	index: number
}

export type SpaceTabs = {
	tabs: Tab[]
	activeId: string
}

const firstEntryOn = (href: string): TabEntry => {
	const key = crypto.randomUUID()
	return { href, state: { key, __TSR_key: key, __TSR_index: 0 } }
}

export const tabOn = (href: string): Tab => ({
	id: crypto.randomUUID(),
	isPinned: false,
	entries: [firstEntryOn(href)],
	index: 0,
})

export const spaceTabsOn = (href: string): SpaceTabs => {
	const tab = tabOn(href)
	return { tabs: [tab], activeId: tab.id }
}

export const currentEntryOf = (tab: Tab): TabEntry =>
	tab.entries[tab.index] ?? firstEntryOn(EMPTY_LIST_HREF)

export const currentHrefOf = (tab: Tab) => currentEntryOf(tab).href

export const activeTabOf = ({ tabs, activeId }: SpaceTabs): Tab =>
	tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? tabOn(EMPTY_LIST_HREF)

export const withPinnedFirst = (tabs: Tab[]) => [
	...tabs.filter((tab) => tab.isPinned),
	...tabs.filter((tab) => !tab.isPinned),
]

const indexOfTab = ({ tabs }: SpaceTabs, id: string) =>
	tabs.findIndex((tab) => tab.id === id)

export const tabShowing = (
	{ tabs }: SpaceTabs,
	href: string,
): Tab | undefined => {
	if (isEmptyListPage(pageOf(href))) {
		return undefined
	}
	const key = pageKeyOf(href)
	return tabs.find((tab) => pageKeyOf(currentHrefOf(tab)) === key)
}

export const selectTab = (space: SpaceTabs, id: string): SpaceTabs =>
	indexOfTab(space, id) === -1 ? space : { ...space, activeId: id }

const insertAfterActive = (space: SpaceTabs, tab: Tab): SpaceTabs => {
	const after = indexOfTab(space, activeTabOf(space).id) + 1
	return {
		tabs: withPinnedFirst([
			...space.tabs.slice(0, after),
			tab,
			...space.tabs.slice(after),
		]),
		activeId: tab.id,
	}
}

export const openTab = (space: SpaceTabs, href: string): SpaceTabs => {
	const shown = tabShowing(space, href)
	return shown
		? selectTab(space, shown.id)
		: insertAfterActive(space, tabOn(href))
}

export const openBackgroundTab = (space: SpaceTabs, href: string): SpaceTabs =>
	tabShowing(space, href)
		? space
		: { ...insertAfterActive(space, tabOn(href)), activeId: space.activeId }

const neighbourOf = (closedIndex: number, rest: Tab[]) =>
	rest[closedIndex] ?? rest[closedIndex - 1] ?? tabOn(EMPTY_LIST_HREF)

export const closeTab = (space: SpaceTabs, id: string): SpaceTabs => {
	const closedIndex = indexOfTab(space, id)
	if (closedIndex === -1) {
		return space
	}
	const rest = space.tabs.filter((tab) => tab.id !== id)
	if (space.activeId !== id && rest.length > 0) {
		return { ...space, tabs: rest }
	}
	const neighbour = neighbourOf(closedIndex, rest)
	return {
		tabs: rest.length > 0 ? rest : [neighbour],
		activeId: neighbour.id,
	}
}

export const closeActiveTab = (space: SpaceTabs): SpaceTabs => {
	const active = activeTabOf(space)
	return active.isPinned ? space : closeTab(space, active.id)
}

export const closeOtherTabs = (space: SpaceTabs, id: string): SpaceTabs =>
	indexOfTab(space, id) === -1
		? space
		: {
				tabs: space.tabs.filter((tab) => tab.isPinned || tab.id === id),
				activeId: id,
			}

const withPin = (space: SpaceTabs, id: string, isPinned: boolean) => ({
	...space,
	tabs: withPinnedFirst(
		space.tabs.map((tab) => (tab.id === id ? { ...tab, isPinned } : tab)),
	),
})

export const pinTab = (space: SpaceTabs, id: string) => withPin(space, id, true)

export const unpinTab = (space: SpaceTabs, id: string) =>
	withPin(space, id, false)

const orderRank = (ids: string[], id: string) => {
	const rank = ids.indexOf(id)
	return rank === -1 ? ids.length : rank
}

export const reorderTabs = (space: SpaceTabs, ids: string[]): SpaceTabs => ({
	...space,
	tabs: withPinnedFirst(
		[...space.tabs].sort(
			(one, other) => orderRank(ids, one.id) - orderRank(ids, other.id),
		),
	),
})

const withActiveTab = (space: SpaceTabs, change: (tab: Tab) => Tab) => {
	const active = activeTabOf(space)
	return {
		...space,
		tabs: space.tabs.map((tab) => (tab.id === active.id ? change(tab) : tab)),
	}
}

export const pushEntry = (space: SpaceTabs, entry: TabEntry): SpaceTabs =>
	withActiveTab(space, (tab) => ({
		...tab,
		entries: [...tab.entries.slice(0, tab.index + 1), entry],
		index: tab.index + 1,
	}))

export const replaceEntry = (space: SpaceTabs, entry: TabEntry): SpaceTabs =>
	withActiveTab(space, (tab) => ({
		...tab,
		entries: tab.entries.map((held, index) =>
			index === tab.index ? entry : held,
		),
	}))

export const moveInHistory = (space: SpaceTabs, steps: number): SpaceTabs =>
	withActiveTab(space, (tab) => ({
		...tab,
		index: Math.min(Math.max(tab.index + steps, 0), tab.entries.length - 1),
	}))

export const dropTabsWhere = (
	space: SpaceTabs,
	isDropped: (tab: Tab) => boolean,
): SpaceTabs =>
	space.tabs
		.filter(isDropped)
		.reduce((kept, tab) => closeTab(kept, tab.id), space)
