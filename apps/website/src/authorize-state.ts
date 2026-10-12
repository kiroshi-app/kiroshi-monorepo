import { type ParsedLocation, redirect } from "@tanstack/react-router"

import {
	type Account,
	type AuthorizationRequest,
	clearBearer,
	isRelayFailure,
	readAccount,
	readAuthorizationRequest,
	readBearer,
} from "./relay"

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SIGNED_IN_FOR_KEY = "kiroshi.authorize.signed-in-for"

type AuthorizeSearch = { request?: string }

type AuthorizeState =
	| { kind: "expired" }
	| {
			kind: "pending"
			request: string
			device: AuthorizationRequest
			account: Account
			isJustSignedIn: boolean
	  }

const EXPIRED: AuthorizeState = { kind: "expired" }

const validateAuthorizeSearch = (
	search: Record<string, unknown>,
): AuthorizeSearch => ({
	request:
		typeof search.request === "string" && UUID_PATTERN.test(search.request)
			? search.request
			: undefined,
})

type SignInReturn = { request?: string; href: string }

const signInThenReturn = ({ request, href }: SignInReturn) => {
	if (request) sessionStorage.setItem(SIGNED_IN_FOR_KEY, request)
	return redirect({ to: "/login", search: { redirect: href } })
}

type AuthorizeGuardContext = {
	search: AuthorizeSearch
	location: ParsedLocation
}

const requireAuthorizeBearer = ({
	search,
	location,
}: AuthorizeGuardContext) => {
	if (readBearer()) return
	throw signInThenReturn({ request: search.request, href: location.href })
}

const consumeJustSignedIn = (request: string) => {
	const isJustSignedIn = sessionStorage.getItem(SIGNED_IN_FOR_KEY) === request
	sessionStorage.removeItem(SIGNED_IN_FOR_KEY)
	return isJustSignedIn
}

const readPendingRequest = async (request: string) => {
	try {
		const device = await readAuthorizationRequest(request)
		return device.status === "pending" ? device : null
	} catch (error) {
		if (isRelayFailure(error, "unavailable")) return null
		throw error
	}
}

const loadPendingState = async (request: string): Promise<AuthorizeState> => {
	const [device, account] = await Promise.all([
		readPendingRequest(request),
		readAccount(),
	])
	if (!device) return EXPIRED
	return {
		kind: "pending",
		request,
		device,
		account,
		isJustSignedIn: consumeJustSignedIn(request),
	}
}

const loadAuthorizeState = async ({
	request,
	href,
}: SignInReturn): Promise<AuthorizeState> => {
	if (!request) return EXPIRED
	try {
		return await loadPendingState(request)
	} catch (error) {
		if (!isRelayFailure(error, "unauthorized")) throw error
		clearBearer()
		throw signInThenReturn({ request, href })
	}
}

export {
	type AuthorizeState,
	loadAuthorizeState,
	requireAuthorizeBearer,
	validateAuthorizeSearch,
}
