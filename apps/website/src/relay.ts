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

type AuthorizationRequest = {
	deviceName: string
	platform: string
	requestedAt: string
	status: string
}

type RelayRequest = {
	path: string
	method?: "GET" | "POST" | "PATCH"
	body?: unknown
}

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

const headersFor = (body: unknown) => {
	const headers = new Headers()
	const bearer = readBearer()
	if (body !== undefined) headers.set("Content-Type", "application/json")
	if (bearer) headers.set("Authorization", `Bearer ${bearer}`)
	return headers
}

const send = async ({ path, method = "GET", body }: RelayRequest) => {
	const response = await fetch(new URL(path, RELAY_URL), {
		method,
		headers: headersFor(body),
		body: body === undefined ? undefined : JSON.stringify(body),
	}).catch((cause: unknown) => {
		throw new RelayError("network", { cause })
	})
	if (!response.ok) throw new RelayError(await failureOf(response))
	return readJson(response)
}

const stringField = (body: unknown, field: string) => {
	const value = fieldOf(body, field)
	if (typeof value !== "string") throw new RelayError("server")
	return value
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

type SocialSignIn = { provider: SocialProvider; callbackURL: string }

// TODO: the relay route /api/auth/sign-in/social is pending, the relay is expected to send the bearer back as a token search param.
const requestSocialSignIn = async ({ provider, callbackURL }: SocialSignIn) => {
	const answer = await send({
		path: "/api/auth/sign-in/social",
		method: "POST",
		body: { provider, callbackURL },
	})
	return stringField(answer, "url")
}

const isRelayFailure = (error: unknown, failure: RelayFailure) =>
	error instanceof RelayError && error.failure === failure

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

const authorizationPath = (request: string) =>
	`/authorization-requests/${encodeURIComponent(request)}`

const readAuthorizationRequest = async (
	request: string,
): Promise<AuthorizationRequest> => {
	const answer = await send({ path: authorizationPath(request) })
	return {
		deviceName: stringField(answer, "deviceName"),
		platform: stringField(answer, "platform"),
		requestedAt: stringField(answer, "requestedAt"),
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
	type Plan,
	RelayError,
	type RelayFailure,
	readAccount,
	readAuthorizationRequest,
	readBearer,
	requestSocialSignIn,
	type SocialProvider,
	saveBearer,
	saveName,
	sendCode,
	signInWithCode,
}
