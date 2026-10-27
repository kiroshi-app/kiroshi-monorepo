import { isTabHref } from "./tab-pages"
import {
	activeTabOf,
	currentHrefOf,
	type SpaceTabs,
	type Tab,
	tabThrough,
	withPinnedFirst,
} from "./tabs-model"

export const MAIN_WINDOW_LABEL = "main"

const SPACE_TABS_KEY_PREFIX = "spaceTabs:"

const WINDOW_TABS_KEY_PREFIX = "windowTabs:"

const OPEN_WINDOW_KEY_PREFIX = "openWindow:"

type KeptTab = {
	href: string
	isPinned: boolean
	entries?: unknown
	index?: unknown
}

type KeptSpaceTabs = {
	tabs: KeptTab[]
	activeIndex: number
}

const windowTabsPrefixOf = (windowLabel: string) =>
	`${WINDOW_TABS_KEY_PREFIX}${windowLabel}:`

const keyOf = (windowLabel: string, spaceId: string) =>
	windowLabel === MAIN_WINDOW_LABEL
		? `${SPACE_TABS_KEY_PREFIX}${spaceId}`
		: `${windowTabsPrefixOf(windowLabel)}${spaceId}`

const openWindowKeyOf = (windowLabel: string) =>
	`${OPEN_WINDOW_KEY_PREFIX}${windowLabel}`

const isKeptHref = (value: unknown): value is string =>
	typeof value === "string" && isTabHref(value)

const isKeptTab = (value: unknown): value is KeptTab =>
	typeof value === "object" &&
	value !== null &&
	"href" in value &&
	isKeptHref(value.href) &&
	"isPinned" in value &&
	typeof value.isPinned === "boolean"

const isKeptSpaceTabs = (value: unknown): value is KeptSpaceTabs =>
	typeof value === "object" &&
	value !== null &&
	"tabs" in value &&
	Array.isArray(value.tabs) &&
	value.tabs.length > 0 &&
	value.tabs.every(isKeptTab) &&
	"activeIndex" in value &&
	typeof value.activeIndex === "number"

const parseKept = (value: string | null): unknown => {
	try {
		return JSON.parse(value ?? "")
	} catch {
		return null
	}
}

const historyOf = ({ href, entries, index }: KeptTab) =>
	Array.isArray(entries) &&
	entries.every(isKeptHref) &&
	typeof index === "number" &&
	entries[index] === href
		? tabThrough(entries, index)
		: tabThrough([href], 0)

const restoredTabOf = (kept: KeptTab): Tab => ({
	...historyOf(kept),
	isPinned: kept.isPinned,
})

const keptTabOf = (tab: Tab): KeptTab => ({
	href: currentHrefOf(tab),
	isPinned: tab.isPinned,
	entries: tab.entries.map((entry) => entry.href),
	index: tab.index,
})

const spaceTabsOf = ({ tabs, activeIndex }: KeptSpaceTabs): SpaceTabs => {
	const restored = tabs.map(restoredTabOf)
	const active = restored[activeIndex] ?? restored[0]
	return {
		tabs: withPinnedFirst(restored),
		activeId: active?.id ?? "",
	}
}

export const readSpaceTabs = (
	windowLabel: string,
	spaceId: string,
): SpaceTabs | null => {
	const kept = parseKept(localStorage.getItem(keyOf(windowLabel, spaceId)))
	return isKeptSpaceTabs(kept) ? spaceTabsOf(kept) : null
}

export const writeSpaceTabs = (
	windowLabel: string,
	spaceId: string,
	space: SpaceTabs,
) => {
	const kept: KeptSpaceTabs = {
		tabs: space.tabs.map(keptTabOf),
		activeIndex: space.tabs.indexOf(activeTabOf(space)),
	}
	localStorage.setItem(keyOf(windowLabel, spaceId), JSON.stringify(kept))
}

const storedKeys = () =>
	Array.from(
		{ length: localStorage.length },
		(_, i) => localStorage.key(i) ?? "",
	)

const keysStartingWith = (prefix: string) =>
	storedKeys().filter((key) => key.startsWith(prefix))

const tabsKeysOf = (windowLabel: string) =>
	keysStartingWith(windowTabsPrefixOf(windowLabel))

const removeKeys = (keys: string[]) => {
	for (const key of keys) {
		localStorage.removeItem(key)
	}
}

export const openWindowLabels = () =>
	keysStartingWith(OPEN_WINDOW_KEY_PREFIX).map((key) =>
		key.slice(OPEN_WINDOW_KEY_PREFIX.length),
	)

export const recordOpenWindow = (windowLabel: string) => {
	if (localStorage.getItem(openWindowKeyOf(windowLabel)) === null) {
		localStorage.setItem(openWindowKeyOf(windowLabel), "")
	}
}

export const recordShownSpace = (windowLabel: string, spaceId: string) => {
	localStorage.setItem(openWindowKeyOf(windowLabel), spaceId)
}

export const shownSpaceOf = (windowLabel: string) =>
	localStorage.getItem(openWindowKeyOf(windowLabel)) || null

export const forgetWindow = (windowLabel: string) => {
	removeKeys([openWindowKeyOf(windowLabel), ...tabsKeysOf(windowLabel)])
}

const copyTabsKey = (key: string, from: string, to: string) => {
	const spaceId = key.slice(windowTabsPrefixOf(from).length)
	localStorage.setItem(keyOf(to, spaceId), localStorage.getItem(key) ?? "")
}

export const handOverWindow = (predecessor: string, successor: string) => {
	const shownSpace = localStorage.getItem(openWindowKeyOf(predecessor))
	if (shownSpace === null) {
		return
	}
	localStorage.setItem(openWindowKeyOf(successor), shownSpace)
	for (const key of tabsKeysOf(predecessor)) {
		copyTabsKey(key, predecessor, successor)
	}
	forgetWindow(predecessor)
}

export const discardUnlistedWindowTabs = () => {
	const listedPrefixes = openWindowLabels().map(windowTabsPrefixOf)
	removeKeys(
		keysStartingWith(WINDOW_TABS_KEY_PREFIX).filter(
			(key) => !listedPrefixes.some((prefix) => key.startsWith(prefix)),
		),
	)
}
