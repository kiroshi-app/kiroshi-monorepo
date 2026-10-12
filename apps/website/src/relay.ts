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

type Account = { email: string; isNamed: boolean }

type RelayRequest = {
	path: string
	method?: "GET" | "POST" | "PATCH"
	body?: unknown
}

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
	if (response.status === 404) return "unavailable"
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

const isNamedIn = (me: unknown) => {
	const name = fieldOf(me, "name")
	return (
		name === undefined || (typeof name === "string" && name.trim().length > 0)
	)
}

const saveName = async (name: string) => {
	await send({ path: "/me", method: "PATCH", body: { name } })
}

const readAccount = async (): Promise<Account> => {
	const me = await send({ path: "/me" })
	return { email: stringField(me, "email"), isNamed: isNamedIn(me) }
}

export {
	type CodeFailure,
	clearBearer,
	RelayError,
	type RelayFailure,
	readAccount,
	readBearer,
	requestSocialSignIn,
	type SocialProvider,
	saveBearer,
	saveName,
	sendCode,
	signInWithCode,
}
