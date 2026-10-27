import { useCallback, useMemo, useState } from "react"

import type { SearchPaletteProps } from "@workspace/ui/components/search-palette"

import { activeIndexOn, createSearchController } from "./search-controller"
import {
	createSearchLookups,
	type SearchLookupSource,
	type SearchLookups,
	toRestingGroups,
	toSearchGroups,
	visibleResults,
} from "./search-model"
import {
	createSearchNavigation,
	openSearchTarget,
	openSearchTargetInNewTab,
	type SearchNavigation,
	type SearchNavigationSource,
	type SearchTarget,
} from "./search-navigation"
import { type SearchPort, searchPort } from "./search-port"
import { useSearchKeys } from "./use-search-keys"
import { useSearchReads } from "./use-search-reads"

import { useControllerState } from "../use-controller"
import { isNewTabClickInFlight } from "../tabs/new-tab-clicks"

export type SearchSource = {
	spaceId: string | null
	spaceName: string | undefined
	canOpen: boolean
	lookups: SearchLookups
	navigation: SearchNavigation
	port?: SearchPort
}

export type Search = {
	isOpen: boolean
	open: () => void
	palette: SearchPaletteProps
}

export const useSearchLookups = ({
	rosters,
	conversationRosters,
	readerName,
	now,
}: SearchLookupSource): SearchLookups =>
	useMemo(
		() =>
			createSearchLookups({
				rosters,
				conversationRosters,
				readerName,
				now,
			}),
		[rosters, conversationRosters, readerName, now],
	)

export const useSearchNavigation = ({
	roster,
	spaces,
	missions,
	routines,
	landings,
	user,
	threads,
}: SearchNavigationSource): SearchNavigation =>
	useMemo(
		() =>
			createSearchNavigation({
				roster,
				spaces,
				missions,
				routines,
				landings,
				user,
				threads,
			}),
		[roster, spaces, missions, routines, landings, user, threads],
	)

export const useSearch = ({
	spaceId,
	spaceName,
	canOpen,
	lookups,
	navigation,
	port = searchPort,
}: SearchSource): Search => {
	const [controller] = useState(createSearchController)
	const state = useControllerState(controller)
	const { read, recents, landing, isLoading } = useSearchReads({
		port,
		isOpen: state.isOpen,
		spaceId: state.spaceId,
		query: state.searchedQuery,
	})

	const openTarget = useCallback(
		(target: SearchTarget) => {
			controller.close()
			if (isNewTabClickInFlight()) {
				openSearchTargetInNewTab(target, spaceId, navigation)
				return
			}
			openSearchTarget(target, navigation)
		},
		[controller, navigation, spaceId],
	)

	const results = useMemo(
		() =>
			toSearchGroups({
				read,
				recents,
				query: state.query,
				lookups,
				open: openTarget,
			}),
		[read, recents, state.query, lookups, openTarget],
	)

	const resting = useMemo(
		() =>
			toRestingGroups({
				read,
				recents,
				lookups,
				open: openTarget,
			}),
		[read, recents, lookups, openTarget],
	)

	const visible = useMemo(
		() =>
			visibleResults({
				query: state.query,
				tab: state.tab,
				groups: results,
				resting,
			}),
		[state.query, state.tab, results, resting],
	)

	const active = visible[activeIndexOn(state, landing)]

	const open = useCallback(() => {
		if (spaceId) {
			controller.open(spaceId)
		}
	}, [controller, spaceId])

	useSearchKeys({
		isOpen: state.isOpen,
		canOpen,
		onOpen: open,
		onMove: (by) => controller.moveActive(by, visible.length, landing),
		onEnter: () => active?.onOpen(),
	})

	return {
		isOpen: state.isOpen,
		open,
		palette: {
			open: state.isOpen,
			onOpenChange: (isOpen) => {
				if (!isOpen) {
					controller.close()
				}
			},
			query: state.query,
			onQueryChange: controller.setQuery,
			tab: state.tab,
			onTabChange: controller.setTab,
			spaceName: spaceName ?? "",
			results,
			resting,
			isLoading,
			activeResultId: active?.id,
		},
	}
}
