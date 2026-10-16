const RELAY_URL = import.meta.env.VITE_RELAY_URL || "https://api.kiroshi.app"

const BEARER_KEY = "kiroshi.relay.bearer"

type RelayFailure =
	| "network"
	| "server"
	| "rejected"
	| "unavailable"
	| "unauthorized"
	| "code-wrong"
	| "code-expired"
	| "code-too-many"
	| "google-unavailable"
	| "apple-unavailable"

type CodeFailure = Extract<RelayFailure, `code-${string}`>

class RelayError extends Error {
	readonly failure: RelayFailure

	constructor(failure: RelayFailure, options?: ErrorOptions) {
		super(`The relay call failed: ${failure}`, options)
		this.failure = failure
	}
}

const CODE_FAILURES = new Map<string, CodeFailure>([
	["Code is wrong", "code-wrong"],
	["Code has expired", "code-expired"],
	["Too many wrong codes, ask for a new one", "code-too-many"],
])

type SocialProvider = "google" | "apple"

type Plan = "free" | "pro"

type Account = {
	email: string
	name: string | null
	plan: Plan | null
	isNamed: boolean
}

type Session = {
	id: string
	deviceName: string | null
	platform: string | null
	browser: string | null
	os: string | null
	lastSeenAt: number
	isCurrent: boolean
}

type AuthorizationRequest = {
	deviceName: string
	platform: string
	requestedAt: number
	status: string
}

type RelayRequest = {
	path: string
	method?: "GET" | "POST" | "PATCH" | "DELETE"
	body?: unknown
	credentials?: RequestCredentials
	sendsBearer?: boolean
}

const NO_CONTENT = 204

const GONE_STATUSES: ReadonlySet<number> = new Set([404, 409, 410])

const readBearer = () => localStorage.getItem(BEARER_KEY)

const saveBearer = (bearer: string) => localStorage.setItem(BEARER_KEY, bearer)

const clearBearer = () => localStorage.removeItem(BEARER_KEY)

const readJson = (response: Response): Promise<unknown> =>
	response.json().catch((cause: unknown) => {
		throw new RelayError("server", { cause })
	})

const fieldOf = (body: unknown, field: string): unknown =>
	typeof body === "object" && body !== null && field in body
		? body[field as keyof typeof body]
		: undefined

const messageOf = (body: unknown) => {
	const message = fieldOf(fieldOf(body, "error"), "message")
	return typeof message === "string" ? message : undefined
}

const failureOf = async (response: Response): Promise<RelayFailure> => {
	if (response.status >= 500) return "server"
	if (GONE_STATUSES.has(response.status)) return "unavailable"
	if (response.status !== 401) return "rejected"
	const message = messageOf(await readJson(response))
	return (message && CODE_FAILURES.get(message)) || "unauthorized"
}

const headersFor = ({ body, sendsBearer = true }: RelayRequest) => {
	const headers = new Headers()
	const bearer = sendsBearer ? readBearer() : null
	if (body !== undefined) headers.set("Content-Type", "application/json")
	if (bearer) headers.set("Authorization", `Bearer ${bearer}`)
	return headers
}

const send = async (request: RelayRequest) => {
	const { path, method = "GET", body, credentials } = request
	const response = await fetch(new URL(path, RELAY_URL), {
		method,
		headers: headersFor(request),
		body: body === undefined ? undefined : JSON.stringify(body),
		credentials,
	}).catch((cause: unknown) => {
		throw new RelayError("network", { cause })
	})
	if (!response.ok) throw new RelayError(await failureOf(response))
	if (response.status === NO_CONTENT) return null
	return readJson(response)
}

const stringField = (body: unknown, field: string) => {
	const value = fieldOf(body, field)
	if (typeof value !== "string") throw new RelayError("server")
	return value
}

const timeField = (body: unknown, field: string) => {
	const time = Date.parse(stringField(body, field))
	if (Number.isNaN(time)) throw new RelayError("server")
	return time
}

const sendCode = async (email: string) => {
	await send({
		path: "/api/auth/email-otp/send-verification-otp",
		method: "POST",
		body: { email },
	})
}

type CodeSignIn = { email: string; code: string }

const signInWithCode = async ({ email, code }: CodeSignIn) => {
	const session = await send({
		path: "/api/auth/sign-in/email-otp",
		method: "POST",
		body: { email, otp: code },
	})
	saveBearer(stringField(session, "token"))
}

const isRelayFailure = (error: unknown, failure: RelayFailure) =>
	error instanceof RelayError && error.failure === failure

type SocialSignIn = {
	provider: SocialProvider
	callbackURL: string
	errorCallbackURL: string
}

const UNCONFIGURED_PROVIDER_FAILURES: Record<SocialProvider, RelayFailure> = {
	google: "google-unavailable",
	apple: "apple-unavailable",
}

const requestSocialSignIn = async (request: SocialSignIn) => {
	try {
		const answer = await send({
			path: "/api/auth/sign-in/social",
			method: "POST",
			body: request,
			credentials: "include",
		})
		return stringField(answer, "url")
	} catch (error) {
		if (isRelayFailure(error, "unavailable")) {
			throw new RelayError(UNCONFIGURED_PROVIDER_FAILURES[request.provider], {
				cause: error,
			})
		}
		throw error
	}
}

const readSessionBearer = async () => {
	const session = await send({
		path: "/api/auth/get-session",
		credentials: "include",
		sendsBearer: false,
	})
	return stringField(session, "token")
}

const isNamedIn = (me: unknown) => {
	const name = fieldOf(me, "name")
	return (
		name === undefined || (typeof name === "string" && name.trim().length > 0)
	)
}

const saveName = async (name: string) => {
	await send({ path: "/me", method: "PATCH", body: { name } })
}

const nameOf = (me: unknown) => {
	const name = fieldOf(me, "name")
	return typeof name === "string" && name.trim().length > 0 ? name : null
}

const isPlan = (value: unknown): value is Plan =>
	value === "free" || value === "pro"

const planOf = (me: unknown) => {
	const plan = fieldOf(me, "plan")
	return isPlan(plan) ? plan : null
}

const readAccount = async (): Promise<Account> => {
	const me = await send({ path: "/me" })
	return {
		email: stringField(me, "email"),
		name: nameOf(me),
		plan: planOf(me),
		isNamed: isNamedIn(me),
	}
}

const nullableStringField = (body: unknown, field: string) => {
	const value = fieldOf(body, field)
	if (value === null) return null
	if (typeof value !== "string") throw new RelayError("server")
	return value
}

const optionalStringField = (body: unknown, field: string) =>
	fieldOf(body, field) === undefined ? null : nullableStringField(body, field)

const sessionOf = (body: unknown): Session => ({
	id: stringField(body, "id"),
	deviceName: nullableStringField(body, "deviceName"),
	platform: nullableStringField(body, "platform"),
	browser: optionalStringField(body, "browser"),
	os: optionalStringField(body, "os"),
	lastSeenAt: timeField(body, "lastSeenAt"),
	isCurrent: fieldOf(body, "current") === true,
})

const readSessions = async () => {
	const sessions = fieldOf(await send({ path: "/me/sessions" }), "sessions")
	if (!Array.isArray(sessions)) throw new RelayError("server")
	return sessions.map(sessionOf)
}

const signOutSession = async (id: string) => {
	await send({
		path: `/me/sessions/${encodeURIComponent(id)}`,
		method: "DELETE",
	})
}

const signOutEverywhere = async () => {
	await send({ path: "/me/sessions", method: "DELETE" })
}

const signOutCurrentSession = async () => {
	await send({ path: "/api/auth/sign-out", method: "POST" })
}

const authorizationPath = (request: string) =>
	`/authorization-requests/${encodeURIComponent(request)}`

const readAuthorizationRequest = async (
	request: string,
): Promise<AuthorizationRequest> => {
	const answer = await send({ path: authorizationPath(request) })
	return {
		deviceName: stringField(answer, "deviceName"),
		platform: stringField(answer, "platform"),
		requestedAt: timeField(answer, "requestedAt"),
		status: stringField(answer, "status"),
	}
}

const approveAuthorizationRequest = async (request: string) => {
	await send({ path: `${authorizationPath(request)}/approve`, method: "POST" })
}

const cancelAuthorizationRequest = async (request: string) => {
	await send({ path: `${authorizationPath(request)}/cancel`, method: "POST" })
}

export {
	type Account,
	type AuthorizationRequest,
	approveAuthorizationRequest,
	type CodeFailure,
	cancelAuthorizationRequest,
	clearBearer,
	isRelayFailure,
	RelayError,
	type RelayFailure,
	readAccount,
	readAuthorizationRequest,
	readBearer,
	readSessionBearer,
	readSessions,
	requestSocialSignIn,
	type Session,
	type SocialProvider,
	saveBearer,
	saveName,
	sendCode,
	signInWithCode,
	signOutCurrentSession,
	signOutEverywhere,
	signOutSession,
}
