const PROBE_ORIGIN = "https://kiroshi.invalid"

const DEFAULT_LANDING = "/account"

type LoginSearch = { redirect?: string; token?: string }

const toSameOriginPath = (value: unknown) => {
	if (typeof value !== "string" || !value.startsWith("/")) return undefined
	const url = URL.parse(value, PROBE_ORIGIN)
	if (url?.origin !== PROBE_ORIGIN) return undefined
	return `${url.pathname}${url.search}${url.hash}`
}

const validateLoginSearch = (search: Record<string, unknown>): LoginSearch => ({
	redirect: toSameOriginPath(search.redirect),
	token:
		typeof search.token === "string" && search.token.length > 0
			? search.token
			: undefined,
})

const landingOf = ({ redirect }: LoginSearch) => redirect ?? DEFAULT_LANDING

export { type LoginSearch, landingOf, validateLoginSearch }
