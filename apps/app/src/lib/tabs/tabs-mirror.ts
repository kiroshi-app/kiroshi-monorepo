import { isTabHref } from "./tab-pages"
import {
	activeTabOf,
	currentHrefOf,
	type SpaceTabs,
	type Tab,
	tabOn,
	withPinnedFirst,
} from "./tabs-model"

export const MAIN_WINDOW_LABEL = "main"

const SPACE_TABS_KEY_PREFIX = "spaceTabs:"

const WINDOW_TABS_KEY_PREFIX = "windowTabs:"

type KeptTab = {
	href: string
	isPinned: boolean
}

type KeptSpaceTabs = {
	tabs: KeptTab[]
	activeIndex: number
}

const keyOf = (windowLabel: string, spaceId: string) =>
	windowLabel === MAIN_WINDOW_LABEL
		? `${SPACE_TABS_KEY_PREFIX}${spaceId}`
		: `${WINDOW_TABS_KEY_PREFIX}${windowLabel}:${spaceId}`

const isKeptTab = (value: unknown): value is KeptTab =>
	typeof value === "object" &&
	value !== null &&
	"href" in value &&
	typeof value.href === "string" &&
	isTabHref(value.href) &&
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

const restoredTabOf = ({ href, isPinned }: KeptTab): Tab => ({
	...tabOn(href),
	isPinned,
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
		tabs: space.tabs.map((tab) => ({
			href: currentHrefOf(tab),
			isPinned: tab.isPinned,
		})),
		activeIndex: space.tabs.indexOf(activeTabOf(space)),
	}
	localStorage.setItem(keyOf(windowLabel, spaceId), JSON.stringify(kept))
}

export const discardSecondaryWindowTabs = () => {
	const secondaryKeys = Array.from(
		{ length: localStorage.length },
		(_, i) => localStorage.key(i) ?? "",
	).filter((key) => key.startsWith(WINDOW_TABS_KEY_PREFIX))
	for (const key of secondaryKeys) {
		localStorage.removeItem(key)
	}
}
