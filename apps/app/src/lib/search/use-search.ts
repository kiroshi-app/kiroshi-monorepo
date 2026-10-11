import { useCallback, useMemo } from "react"

import type { SearchPaletteProps } from "@workspace/ui/components/search-palette"
import { i18n } from "@workspace/ui/lib/i18n"

import { createSearchController } from "./search-controller"
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
	type SearchNavigation,
	type SearchNavigationSource,
	type SearchTarget,
} from "./search-navigation"
import { type SearchPort, searchPort } from "./search-port"
import { useSearchKeys } from "./use-search-keys"

import { raiseReportedFailure } from "../failure-report"
import { useControllerState } from "../use-controller"

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
	spaces,
	readerName,
	now,
}: SearchLookupSource): SearchLookups =>
	useMemo(
		() =>
			createSearchLookups({
				rosters,
				conversationRosters,
				spaces,
				readerName,
				now,
			}),
		[rosters, conversationRosters, spaces, readerName, now],
	)

export const useSearchNavigation = ({
	roster,
	spaces,
	missions,
	routines,
	landings,
	user,
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
			}),
		[roster, spaces, missions, routines, landings, user],
	)

const raiseSearchFailure = () =>
	raiseReportedFailure(
		{
			title: i18n.t("search:unavailable.title"),
			description: i18n.t("search:unavailable.description"),
		},
		{ raisedIn: "use-search" },
	)

export const useSearch = ({
	spaceId,
	spaceName,
	canOpen,
	lookups,
	navigation,
	port = searchPort,
}: SearchSource): Search => {
	const controller = useMemo(
		() => createSearchController({ port, onFailure: raiseSearchFailure }),
		[port],
	)
	const state = useControllerState(controller)

	const openTarget = useCallback(
		(target: SearchTarget) => {
			controller.close()
			openSearchTarget(target, navigation)
		},
		[controller, navigation],
	)

	const results = useMemo(
		() =>
			toSearchGroups({
				read: state.read,
				recents: state.recents,
				query: state.query,
				lookups,
				open: openTarget,
			}),
		[state.read, state.recents, state.query, lookups, openTarget],
	)

	const resting = useMemo(
		() =>
			toRestingGroups({
				read: state.read,
				recents: state.recents,
				lookups,
				open: openTarget,
			}),
		[state.read, state.recents, lookups, openTarget],
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

	const active = visible[state.activeIndex]

	const open = useCallback(() => {
		if (spaceId) {
			controller.open(spaceId)
		}
	}, [controller, spaceId])

	useSearchKeys({
		isOpen: state.isOpen,
		canOpen,
		onOpen: open,
		onMove: (by) => controller.moveActive(by, visible.length),
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
			isScopeAllSpaces: state.isAllSpaces,
			onScopeChange: controller.setScope,
			spaceName: spaceName ?? "",
			results,
			resting,
			isLoading: state.isLoading,
			activeResultId: active?.id,
		},
	}
}
