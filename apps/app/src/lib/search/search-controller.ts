import type { SearchTab } from "@workspace/ui/components/search-palette"

import { createStore } from "../store"

export const QUIET_MS = 150

type SearchState = {
	isOpen: boolean
	spaceId: string | null
	query: string
	searchedQuery: string
	tab: SearchTab
	isAllSpaces: boolean
	activeIndex: number
	activeLanding: number
}

export type SearchController = {
	getState: () => SearchState
	subscribe: (listener: () => void) => () => void
	open: (spaceId: string) => void
	close: () => void
	setQuery: (query: string) => void
	setTab: (tab: SearchTab) => void
	setScope: (isAllSpaces: boolean) => void
	moveActive: (by: number, count: number, landing: number) => void
}

const CLOSED: SearchState = {
	isOpen: false,
	spaceId: null,
	query: "",
	searchedQuery: "",
	tab: "all",
	isAllSpaces: false,
	activeIndex: 0,
	activeLanding: 0,
}

export const activeIndexOn = (state: SearchState, landing: number) =>
	state.activeLanding === landing ? state.activeIndex : 0

const wrapped = (index: number, count: number) =>
	count === 0 ? 0 : (index + count) % count

export const createSearchController = (): SearchController => {
	const stateStore = createStore(CLOSED)
	const current = stateStore.getState
	let quiet: ReturnType<typeof setTimeout> | undefined

	const publish = (next: Partial<SearchState>) => {
		stateStore.setState({ ...current(), ...next })
	}

	const searchQueryNow = () => {
		clearTimeout(quiet)
		publish({ searchedQuery: current().query })
	}

	const scheduleSearch = () => {
		clearTimeout(quiet)

		if (current().query === "") {
			searchQueryNow()
			return
		}

		quiet = setTimeout(searchQueryNow, QUIET_MS)
	}

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		open: (spaceId) => {
			clearTimeout(quiet)
			publish({ ...CLOSED, isOpen: true, spaceId })
		},

		close: () => {
			clearTimeout(quiet)
			publish(CLOSED)
		},

		setQuery: (query) => {
			publish({ query, activeIndex: 0 })
			scheduleSearch()
		},

		setTab: (tab) => publish({ tab, activeIndex: 0 }),

		setScope: (isAllSpaces) => {
			publish({ isAllSpaces, activeIndex: 0 })
			searchQueryNow()
		},

		moveActive: (by, count, landing) =>
			publish({
				activeIndex: wrapped(activeIndexOn(current(), landing) + by, count),
				activeLanding: landing,
			}),
	}
}
