import { type ParsedLocation, redirect } from "@tanstack/react-router"

import {
	type Account,
	type AuthorizationRequest,
	clearBearer,
	isRelayFailure,
	RelayError,
	readAccount,
	readAuthorizationRequest,
	readBearer,
	signOutCurrentSession,
} from "./relay"

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SIGNED_IN_FOR_KEY = "kiroshi.authorize.signed-in-for"

type AuthorizeSearch = { request?: string }

type ClosedKind = "expired" | "cancelled"

type AuthorizeState =
	| { kind: ClosedKind }
	| {
			kind: "pending"
			request: string
			device: AuthorizationRequest
			account: Account
			isJustSignedIn: boolean
	  }

const EXPIRED = { kind: "expired" } as const

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

const readKnownRequest = async (request: string) => {
	try {
		return await readAuthorizationRequest(request)
	} catch (error) {
		if (isRelayFailure(error, "unavailable")) return null
		throw error
	}
}

const loadRequestState = async (request: string): Promise<AuthorizeState> => {
	const [device, account] = await Promise.all([
		readKnownRequest(request),
		readAccount(),
	])
	if (device?.status === "cancelled") return { kind: "cancelled" }
	if (device?.status !== "pending") return EXPIRED
	return {
		kind: "pending",
		request,
		device,
		account,
		isJustSignedIn: consumeJustSignedIn(request),
	}
}

const signInAgainOnUnauthorized = async <State>(
	signInReturn: SignInReturn,
	load: () => Promise<State>,
) => {
	try {
		return await load()
	} catch (error) {
		if (!isRelayFailure(error, "unauthorized")) throw error
		clearBearer()
		throw signInThenReturn(signInReturn)
	}
}

const loadAuthorizeState = async ({
	request,
	href,
}: SignInReturn): Promise<AuthorizeState> => {
	if (!request) return EXPIRED
	return signInAgainOnUnauthorized({ request, href }, () =>
		loadRequestState(request),
	)
}

type DoneState =
	| { kind: "expired" }
	| {
			kind: "signed-in"
			deviceName: string
			email: string
			isBrowserStillSignedIn: boolean
	  }

const signOutBrowser = async () => {
	try {
		await signOutCurrentSession()
	} catch (error) {
		if (!isRelayFailure(error, "unauthorized")) throw error
	}
	clearBearer()
}

const isBrowserSignOutFailed = async () => {
	try {
		await signOutBrowser()
		return false
	} catch (error) {
		if (error instanceof RelayError) return true
		throw error
	}
}

const loadApprovedState = async (request: string): Promise<DoneState> => {
	const [device, account] = await Promise.all([
		readKnownRequest(request),
		readAccount(),
	])
	if (device?.status !== "approved") return EXPIRED
	return {
		kind: "signed-in",
		deviceName: device.deviceName,
		email: account.email,
		isBrowserStillSignedIn: await isBrowserSignOutFailed(),
	}
}

const loadDoneState = async ({
	request,
	href,
}: SignInReturn): Promise<DoneState> => {
	if (!request) return EXPIRED
	return signInAgainOnUnauthorized({ href }, () => loadApprovedState(request))
}

export {
	type AuthorizeState,
	type ClosedKind,
	loadAuthorizeState,
	loadDoneState,
	requireAuthorizeBearer,
	signInAgainOnUnauthorized,
	signOutBrowser,
	validateAuthorizeSearch,
}
