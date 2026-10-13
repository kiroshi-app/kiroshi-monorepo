import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Catalogue,
	CatalogueChat,
	CatalogueMission,
	CatalogueRoutine,
} from "./catalogue-contract"
import type { CatalogueScope, RecentScope } from "./catalogue-transport"
import { MAX_QUERY_CHARS, type MessageHit } from "./search-contract"
import type { SearchPort } from "./search-port"
import { searchQueryKeys } from "./search-query-keys"

import { isHostOffline } from "../host/host-offline"

export type SearchRead = {
	messages: MessageHit[]
	chats: CatalogueChat[]
	missions: CatalogueMission[]
	routines: CatalogueRoutine[]
}

type SearchReadSource = {
	port: SearchPort
	isOpen: boolean
	spaceId: string | null
	query: string
	isAllSpaces: boolean
}

type SearchReads = {
	read: SearchRead
	recents: CatalogueChat[]
	isLoading: boolean
}

const NOTHING_READ: SearchRead = {
	messages: [],
	chats: [],
	missions: [],
	routines: [],
}

const NO_RECENTS: CatalogueChat[] = []

const NO_MESSAGES: MessageHit[] = []

const REREAD_ON_EVERY_OPEN = 0

const SEARCH_FAILURE = {
	failureNotice: () => ({
		title: i18n.t("search:unavailable.title"),
		description: i18n.t("search:unavailable.description"),
	}),
	raisedIn: "use-search",
	isSilentOn: isHostOffline,
}

const isOverLimit = (query: string) => [...query].length > MAX_QUERY_CHARS

const readOf = (messages: MessageHit[], catalogue: Catalogue): SearchRead => ({
	messages,
	chats: catalogue.chats,
	missions: catalogue.missions,
	routines: catalogue.routines,
})

const messagesOf = (
	port: SearchPort,
	{ query, spaceId, allSpaces }: CatalogueScope,
) =>
	query === ""
		? Promise.resolve(NO_MESSAGES)
		: port.messages({ text: query, spaceId, allSpaces })

const readResults = (port: SearchPort, scope: CatalogueScope) =>
	Promise.all([messagesOf(port, scope), port.catalogue(scope)]).then(
		([messages, catalogue]) => readOf(messages, catalogue),
	)

const recentScopeOf = ({
	isOpen,
	spaceId,
	isAllSpaces,
}: SearchReadSource): RecentScope | null =>
	isOpen && spaceId ? { spaceId, allSpaces: isAllSpaces } : null

const resultScopeOf = (
	recentScope: RecentScope | null,
	query: string,
): CatalogueScope | null =>
	recentScope && !isOverLimit(query) ? { ...recentScope, query } : null

export const useSearchReads = (source: SearchReadSource): SearchReads => {
	const { port, query } = source
	const recentScope = recentScopeOf(source)
	const resultScope = resultScopeOf(recentScope, query)

	const recents = useQuery({
		queryKey: searchQueryKeys.recents(recentScope),
		queryFn: recentScope ? () => port.recent(recentScope) : skipToken,
		placeholderData: keepPreviousData,
		staleTime: REREAD_ON_EVERY_OPEN,
		meta: SEARCH_FAILURE,
	})

	const results = useQuery({
		queryKey: searchQueryKeys.results(resultScope),
		queryFn: resultScope ? () => readResults(port, resultScope) : skipToken,
		placeholderData: keepPreviousData,
		staleTime: REREAD_ON_EVERY_OPEN,
		meta: SEARCH_FAILURE,
	})

	return {
		read: results.data ?? NOTHING_READ,
		recents: recents.data ?? NO_RECENTS,
		isLoading: results.isFetching || recents.isFetching,
	}
}
