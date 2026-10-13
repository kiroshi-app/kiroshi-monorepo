const PROBE_ORIGIN = "https://kiroshi.invalid"

const DEFAULT_LANDING = "/account"

const SOCIAL_RETURN = "social"

type LoginSearch = {
	redirect?: string
	via?: typeof SOCIAL_RETURN
	error?: string
}

const toSameOriginPath = (value: unknown) => {
	if (typeof value !== "string" || !value.startsWith("/")) return undefined
	const url = URL.parse(value, PROBE_ORIGIN)
	if (url?.origin !== PROBE_ORIGIN) return undefined
	return `${url.pathname}${url.search}${url.hash}`
}

const validateLoginSearch = (search: Record<string, unknown>): LoginSearch => ({
	redirect: toSameOriginPath(search.redirect),
	via: search.via === SOCIAL_RETURN ? SOCIAL_RETURN : undefined,
	error: search.error === undefined ? undefined : String(search.error),
})

const landingOf = ({ redirect }: LoginSearch) => redirect ?? DEFAULT_LANDING

export { type LoginSearch, landingOf, SOCIAL_RETURN, validateLoginSearch }
