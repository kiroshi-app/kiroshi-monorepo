import { skipToken, useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import type {
	Catalogue,
	CatalogueChat,
	CatalogueMission,
	CatalogueRoutine,
} from "./catalogue-contract"
import type { CatalogueScope } from "./catalogue-transport"
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
	landing: number
	isLoading: boolean
}

type SearchAnswer = {
	read: SearchRead
	recents: CatalogueChat[] | null
}

type Landed = {
	answer: SearchAnswer | undefined
	recents: CatalogueChat[]
	landing: number
}

const NOTHING_READ: SearchRead = {
	messages: [],
	chats: [],
	missions: [],
	routines: [],
}

const NO_RECENTS: CatalogueChat[] = []

const NOTHING_LANDED: Landed = {
	answer: undefined,
	recents: NO_RECENTS,
	landing: 0,
}

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

const restingAnswer = (
	port: SearchPort,
	scope: CatalogueScope,
): Promise<SearchAnswer> =>
	Promise.all([
		port.recent({ spaceId: scope.spaceId, allSpaces: scope.allSpaces }),
		port.catalogue(scope),
	]).then(([recents, catalogue]) => ({ read: readOf([], catalogue), recents }))

const foundAnswer = (
	port: SearchPort,
	scope: CatalogueScope,
): Promise<SearchAnswer> =>
	Promise.all([
		port.messages({
			text: scope.query,
			spaceId: scope.spaceId,
			allSpaces: scope.allSpaces,
		}),
		port.catalogue(scope),
	]).then(([messages, catalogue]) => ({
		read: readOf(messages, catalogue),
		recents: null,
	}))

const readAnswer = (port: SearchPort, scope: CatalogueScope) =>
	scope.query === "" ? restingAnswer(port, scope) : foundAnswer(port, scope)

const scopeOf = ({
	isOpen,
	spaceId,
	query,
	isAllSpaces,
}: SearchReadSource): CatalogueScope | null =>
	isOpen && spaceId && !isOverLimit(query)
		? { query, spaceId, allSpaces: isAllSpaces }
		: null

const landedWith = (landed: Landed, answer: SearchAnswer): Landed => ({
	answer,
	recents: answer.recents ?? landed.recents,
	landing: landed.landing + 1,
})

const useLastLanded = (answer: SearchAnswer | undefined): Landed => {
	const [landed, setLanded] = useState(NOTHING_LANDED)
	if (answer === undefined || answer === landed.answer) {
		return landed
	}
	const next = landedWith(landed, answer)
	setLanded(next)
	return next
}

export const useSearchReads = (source: SearchReadSource): SearchReads => {
	const { port } = source
	const scope = scopeOf(source)

	const answer = useQuery({
		queryKey: searchQueryKeys.results(scope),
		queryFn: scope ? () => readAnswer(port, scope) : skipToken,
		staleTime: REREAD_ON_EVERY_OPEN,
		meta: SEARCH_FAILURE,
	})
	const { answer: landedAnswer, recents, landing } = useLastLanded(answer.data)

	return {
		read: landedAnswer?.read ?? NOTHING_READ,
		recents,
		landing,
		isLoading: answer.isFetching,
	}
}
