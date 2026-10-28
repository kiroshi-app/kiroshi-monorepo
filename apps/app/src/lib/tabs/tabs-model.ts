import type { HistoryLocation } from "@tanstack/react-router"

import { EMPTY_LIST_HREF, pageOf, samePage, type TabPage } from "./tab-pages"

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

const entryOn = (href: string, position: number): TabEntry => {
	const key = crypto.randomUUID()
	return { href, state: { key, __TSR_key: key, __TSR_index: position } }
}

const firstEntryOn = (href: string) => entryOn(href, 0)

export const tabThrough = (hrefs: string[], index: number): Tab => ({
	id: crypto.randomUUID(),
	isPinned: false,
	entries: hrefs.map(entryOn),
	index,
})

const tabOn = (href: string): Tab => tabThrough([href], 0)

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

export const selectTab = (space: SpaceTabs, id: string): SpaceTabs =>
	indexOfTab(space, id) === -1 ? space : { ...space, activeId: id }

const insertAt = (space: SpaceTabs, position: number, tab: Tab): SpaceTabs => ({
	...space,
	tabs: withPinnedFirst([
		...space.tabs.slice(0, position),
		tab,
		...space.tabs.slice(position),
	]),
})

const insertAfterActive = (space: SpaceTabs, tab: Tab): SpaceTabs =>
	insertAt(space, indexOfTab(space, activeTabOf(space).id) + 1, tab)

const openTabOn = (space: SpaceTabs, href: string): SpaceTabs => {
	const tab = tabOn(href)
	return selectTab(insertAfterActive(space, tab), tab.id)
}

export const openEmptyTab = (space: SpaceTabs): SpaceTabs =>
	openTabOn(space, EMPTY_LIST_HREF)

export const openBackgroundTab = (space: SpaceTabs, href: string): SpaceTabs =>
	insertAfterActive(space, tabOn(href))

export const duplicateTab = (space: SpaceTabs, id: string): SpaceTabs => {
	const position = indexOfTab(space, id)
	const original = space.tabs[position]
	if (!original) {
		return space
	}
	const copy = {
		...tabOn(currentHrefOf(original)),
		isPinned: original.isPinned,
	}
	return insertAt(space, position + 1, copy)
}

export type ClosedTab = {
	position: number
	tab: Tab
}

export const tabsClosedBetween = (
	before: SpaceTabs,
	after: SpaceTabs,
): ClosedTab[] =>
	before.tabs
		.flatMap((tab, position) =>
			after.tabs.some((kept) => kept.id === tab.id) ? [] : [{ position, tab }],
		)
		.reverse()

export const reopenTab = (
	space: SpaceTabs,
	{ position, tab }: ClosedTab,
): SpaceTabs => selectTab(insertAt(space, position, tab), tab.id)

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

export const closeUnpinnedTab = (space: SpaceTabs, id: string): SpaceTabs =>
	space.tabs.some((tab) => tab.id === id && tab.isPinned)
		? space
		: closeTab(space, id)

export const closeActiveTab = (space: SpaceTabs): SpaceTabs =>
	closeUnpinnedTab(space, activeTabOf(space).id)

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

const pushInPlace = (space: SpaceTabs, entry: TabEntry): SpaceTabs =>
	withActiveTab(space, (tab) => ({
		...tab,
		entries: [...tab.entries.slice(0, tab.index + 1), entry],
		index: tab.index + 1,
	}))

const showsPage = (tab: Tab, page: TabPage) =>
	samePage(pageOf(currentHrefOf(tab)), page)

const tabsAfter = (space: SpaceTabs, id: string) => {
	const position = indexOfTab(space, id)
	return [...space.tabs.slice(position + 1), ...space.tabs.slice(0, position)]
}

export const pushEntry = (space: SpaceTabs, entry: TabEntry): SpaceTabs => {
	const active = activeTabOf(space)
	const page = pageOf(entry.href)
	if (!active.isPinned || showsPage(active, page)) {
		return pushInPlace(space, entry)
	}
	const showing = tabsAfter(space, active.id).find((tab) =>
		showsPage(tab, page),
	)
	return showing ? selectTab(space, showing.id) : openTabOn(space, entry.href)
}

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
