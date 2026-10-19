import {
	defaultParseSearch,
	defaultStringifySearch,
} from "@tanstack/react-router"

const INVITATION_KEY = "invitation"

type JoinSearch = { invitation?: string[] }

const isStringList = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every((item) => typeof item === "string")

const parseSiteSearch = (searchStr: string) => {
	const search = defaultParseSearch(searchStr)
	if (!(INVITATION_KEY in search)) return search
	const invitations = new URLSearchParams(searchStr).getAll(INVITATION_KEY)
	return { ...search, [INVITATION_KEY]: invitations }
}

const stringifySiteSearch = (search: Record<string, unknown>) => {
	const { [INVITATION_KEY]: invitations, ...others } = search
	if (!isStringList(invitations)) return defaultStringifySearch(search)
	const invitationPairs = invitations
		.map((invitation) => `${INVITATION_KEY}=${encodeURIComponent(invitation)}`)
		.join("&")
	const othersSearch = defaultStringifySearch(others)
	return othersSearch
		? `${othersSearch}&${invitationPairs}`
		: `?${invitationPairs}`
}

const validateJoinSearch = (search: Record<string, unknown>): JoinSearch => ({
	invitation: isStringList(search.invitation) ? search.invitation : undefined,
})

export { parseSiteSearch, stringifySiteSearch, validateJoinSearch }
