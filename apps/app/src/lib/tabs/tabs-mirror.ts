import { isTabHref } from "./tab-pages"
import {
	activeTabOf,
	currentHrefOf,
	type SpaceTabs,
	type Tab,
	tabOn,
	withPinnedFirst,
} from "./tabs-model"

const SPACE_TABS_KEY_PREFIX = "spaceTabs:"

type KeptTab = {
	href: string
	isPinned: boolean
}

type KeptSpaceTabs = {
	tabs: KeptTab[]
	activeIndex: number
}

const keyOf = (spaceId: string) => `${SPACE_TABS_KEY_PREFIX}${spaceId}`

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

export const readSpaceTabs = (spaceId: string): SpaceTabs | null => {
	const kept = parseKept(localStorage.getItem(keyOf(spaceId)))
	return isKeptSpaceTabs(kept) ? spaceTabsOf(kept) : null
}

export const writeSpaceTabs = (spaceId: string, space: SpaceTabs) => {
	const kept: KeptSpaceTabs = {
		tabs: space.tabs.map((tab) => ({
			href: currentHrefOf(tab),
			isPinned: tab.isPinned,
		})),
		activeIndex: space.tabs.indexOf(activeTabOf(space)),
	}
	localStorage.setItem(keyOf(spaceId), JSON.stringify(kept))
}
