import type { Server } from "bun"

import {
	auth,
	discoverOAuthServerInfo,
	type OAuthClientProvider,
	refreshAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js"
import {
	type AuthorizationServerMetadata,
	type OAuthClientInformation,
	type OAuthClientMetadata,
	type OAuthErrorResponse,
	OAuthErrorResponseSchema,
	type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js"
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js"

import { describeError } from "./describe-error"

const LOOPBACK = "127.0.0.1"
const LOOPBACK_HOSTS = new Set([LOOPBACK, "localhost"])
const PORT_SUFFIX = /:\d+$/
const OPENABLE_SCHEMES = new Set(["http:", "https:"])
const REDIRECT_PATH = "/oauth/callback"
const CLIENT_NAME = "Kiroshi"
const REQUEST_TIMEOUT_MS = 30_000
export const REFRESH_TIMEOUT_MS = 10_000
const GRANTED = "Authorization granted. You can close this tab."
const DENIED = "Authorization was refused. You can close this tab."
const REFUSED = "This is not the redirect this flow is waiting for."
const UNCONFIRMED = "Kiroshi never confirmed it stored the grant"
const UNSTORED = "the grant could not be stored"
const PLAIN_TEXT = "text/plain; charset=utf-8"
const PORT_TAKEN = "the registered redirect port could not be bound"
const UNREACHED = "the authorization url could not be requested"
const UNCLOSED = "the redirect listener could not be closed"
const NO_REVOCATION =
	"the authorization server advertises no revocation endpoint"

export const OAUTH_STARTED = "oauth_started"

const FLOW_TIMEOUT_MS = 300_000
const STORE_TIMEOUT_MS = 30_000

const FORM_CONTENT = "application/x-www-form-urlencoded"
const JSON_CONTENT = "application/json"
const BODY_LIMIT = 400
const BAD_REQUEST = 400

const REFUSED_GRANT_CODES = new Set([
	"invalid_grant",
	"invalid_client",
	"unauthorized_client",
])

const FAILED_REASON: Record<OauthFailureKind, string> = {
	busy: "another authorization was already running",
	cancelled: "the connect was cancelled in Kiroshi",
	timedOut: "Kiroshi stopped waiting for this authorization",
	denied: "the authorization was refused",
	rejected: "the authorization server rejected the grant",
	failed: "the authorization failed",
}

const ENDPOINT_OF: Record<OauthStep, string> = {
	discovery: "the discovery endpoint",
	registration: "the registration endpoint",
	tokenExchange: "the token endpoint",
}

export type OauthFailureKind =
	| "busy"
	| "cancelled"
	| "timedOut"
	| "denied"
	| "rejected"
	| "failed"

export type OauthStep = "discovery" | "registration" | "tokenExchange"

export type OauthFailure = {
	kind: OauthFailureKind
	detail?: string
	step?: OauthStep
	status?: number
	body?: string
	code?: string
}

export type OauthCredentials = {
	accessToken: string
	refreshToken?: string
	expiresAt?: number
	clientId: string
	clientSecret?: string
	redirectUri?: string
}

export type OauthAnswer =
	| { credentials: OauthCredentials }
	| { error: OauthFailure }

export type RevocationAnswer = {
	revoked: boolean
	detail?: string
}

export type AuthorizeRequest = {
	url?: string
	clientId?: string
	clientSecret?: string
	redirectUri?: string
}

export type RevokeRequest = {
	url?: string
	token?: string
	refreshToken?: string
	clientId?: string
	clientSecret?: string
}

export type StoredReport = {
	stored?: boolean
	detail?: string
}

export type RefreshRequest = {
	url?: string
	refreshToken?: string
	clientId?: string
	clientSecret?: string
}

type Emit = (frame: Record<string, unknown>) => void

type Redirect = { code: string } | { failure: OauthFailure }

type Settle = (redirect: Redirect) => void

type Answer = (request: Request) => Response | Promise<Response>

type HeldPage = {
	shown: Promise<string>
	show: (text: string) => void
}

type Flow = {
	end: (failure: OauthFailure) => void
	confirm: (report: StoredReport) => void
}

type Listening = {
	listener: Server<undefined>
	redirectUrl: string
	client?: OAuthClientInformation
}

type Attempt = {
	serverUrl: string
	redirectUrl: string
	state: string
	arrival: Promise<Redirect>
	settle: Settle
	emit: Emit
	fetchFn: FetchLike
	client?: OAuthClientInformation
}

type Held = {
	client?: OAuthClientInformation
	codeVerifier?: string
	tokens?: OAuthTokens
}

type Refusal = {
	step: OauthStep
	status: number
	body: string
}

type Watched = {
	fetchFn: FetchLike
	refusal: () => Refusal | undefined
}

let running: Flow | undefined

const timedFetch: FetchLike = (input, init) =>
	fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

const fetchWithin =
	(deadline: AbortSignal): FetchLike =>
	(input, init) =>
		fetch(input, { ...init, signal: deadline })

const page = (text: string, status = 200) =>
	new Response(text, { status, headers: { "content-type": PLAIN_TEXT } })

const refused = () => page(REFUSED, 400)

const failedText = (reason: string) =>
	`Authorization failed: ${reason}. Go back to Kiroshi and connect again.`

const failurePage = ({ kind, detail }: OauthFailure) =>
	failedText(detail ?? FAILED_REASON[kind])

const stepOf = (init?: RequestInit): OauthStep => {
	const posted = new Headers(init?.headers).get("content-type") ?? ""
	if (posted.startsWith(FORM_CONTENT)) {
		return "tokenExchange"
	}
	if (posted.startsWith(JSON_CONTENT)) {
		return "registration"
	}
	return "discovery"
}

const watched = (fetchFn: FetchLike): Watched => {
	let refusal: Refusal | undefined
	return {
		fetchFn: async (url, init) => {
			refusal = undefined
			const answered = await fetchFn(url, init)
			if (!answered.ok) {
				refusal = {
					step: stepOf(init),
					status: answered.status,
					body: await answered.clone().text(),
				}
			}
			return answered
		},
		refusal: () => refusal,
	}
}

const oauthError = (body: string): OAuthErrorResponse | undefined => {
	try {
		return OAuthErrorResponseSchema.safeParse(JSON.parse(body)).data
	} catch {
		return undefined
	}
}

const carriable = (body: string) =>
	body.split(/\s+/).filter(Boolean).join(" ").slice(0, BODY_LIMIT)

const refusedFailure = ({ step, status, body }: Refusal): OauthFailure => {
	const answered = `${ENDPOINT_OF[step]} answered ${status}`
	const named = oauthError(body)
	const carried = carriable(named ? (named.error_description ?? "") : body)
	return {
		kind: named && REFUSED_GRANT_CODES.has(named.error) ? "rejected" : "failed",
		detail: named ? `${answered}: ${named.error}` : answered,
		step,
		status,
		...(carried ? { body: carried } : {}),
		...(named ? { code: named.error } : {}),
	}
}

const flowFailure = (error: unknown, refusal?: Refusal): OauthFailure =>
	refusal
		? refusedFailure(refusal)
		: { kind: "failed", detail: describeError(error) }

const isLoopback = (host: string | null) =>
	host !== null && LOOPBACK_HOSTS.has(host.replace(PORT_SUFFIX, ""))

const theAnswerWritten = () => Bun.sleep(0)

const settleOnceAnswered = (settle: Settle, redirect: Redirect) => {
	setTimeout(() => settle(redirect), 0)
}

const answerRedirect = (
	request: Request,
	state: string,
	settle: Settle,
	held: Promise<string>,
): Response | Promise<Response> => {
	if (!isLoopback(request.headers.get("host"))) {
		return refused()
	}
	const asked = new URL(request.url)
	if (asked.pathname !== REDIRECT_PATH) {
		return refused()
	}
	if (asked.searchParams.get("state") !== state) {
		return refused()
	}
	const denied = asked.searchParams.get("error")
	if (denied) {
		settleOnceAnswered(settle, {
			failure: { kind: "denied", detail: denied, code: denied },
		})
		return page(DENIED)
	}
	const code = asked.searchParams.get("code")
	if (!code) {
		return refused()
	}
	settle({ code })
	return held.then((text) => page(text))
}

const clientMetadata = (redirectUrl: string): OAuthClientMetadata => ({
	client_name: CLIENT_NAME,
	redirect_uris: [redirectUrl],
	grant_types: ["authorization_code", "refresh_token"],
	response_types: ["code"],
	token_endpoint_auth_method: "client_secret_post",
})

const authorizationRefusal = async (
	authorizationUrl: URL,
): Promise<OauthFailure | undefined> => {
	const answered = await timedFetch(authorizationUrl, {
		redirect: "manual",
		credentials: "omit",
	})
	if (answered.status < BAD_REQUEST) {
		return undefined
	}
	const answer = await answered.text()
	if (answered.status > BAD_REQUEST && !oauthError(answer)) {
		return undefined
	}
	const body = carriable(answer)
	return {
		kind: "failed",
		detail: `the authorization endpoint answered ${answered.status}`,
		status: answered.status,
		...(body ? { body } : {}),
	}
}

const watchAuthorization = (authorizationUrl: URL, settle: Settle) => {
	authorizationRefusal(authorizationUrl).then(
		(failure) => {
			if (failure) {
				settle({ failure })
			}
		},
		(error) => {
			process.stderr.write(`${UNREACHED}: ${describeError(error)}\n`)
		},
	)
}

const clientProvider = (
	{ redirectUrl, state, emit, settle }: Attempt,
	held: Held,
): OAuthClientProvider => ({
	get redirectUrl() {
		return redirectUrl
	},
	get clientMetadata() {
		return clientMetadata(redirectUrl)
	},
	state: () => state,
	clientInformation: () => held.client,
	saveClientInformation: (information) => {
		held.client = information
	},
	tokens: () => held.tokens,
	saveTokens: (tokens) => {
		held.tokens = tokens
	},
	saveCodeVerifier: (codeVerifier) => {
		held.codeVerifier = codeVerifier
	},
	codeVerifier: () => held.codeVerifier ?? "",
	redirectToAuthorization: (authorizationUrl) => {
		if (!OPENABLE_SCHEMES.has(authorizationUrl.protocol)) {
			throw new Error(
				`the authorization server named the refused scheme ${authorizationUrl.protocol}`,
			)
		}
		emit({ type: OAUTH_STARTED, url: authorizationUrl.toString() })
		watchAuthorization(authorizationUrl, settle)
	},
})

const credentialsOf = (
	tokens: OAuthTokens,
	client: OAuthClientInformation,
): OauthCredentials => ({
	accessToken: tokens.access_token,
	refreshToken: tokens.refresh_token,
	expiresAt:
		tokens.expires_in === undefined
			? undefined
			: Date.now() + tokens.expires_in * 1000,
	clientId: client.client_id,
	clientSecret: client.client_secret,
})

const exchanged = async (attempt: Attempt): Promise<OauthAnswer> => {
	const { serverUrl, arrival, fetchFn } = attempt
	const held: Held = { client: attempt.client }
	const provider = clientProvider(attempt, held)
	const opened = await auth(provider, { serverUrl, fetchFn })
	if (opened !== "REDIRECT") {
		return {
			error: {
				kind: "failed",
				detail: `the authorization flow answered ${opened}`,
			},
		}
	}
	const redirect = await arrival
	if ("failure" in redirect) {
		return { error: redirect.failure }
	}
	await auth(provider, {
		serverUrl,
		authorizationCode: redirect.code,
		fetchFn,
	})
	const { tokens, client } = held
	if (!tokens || !client) {
		return {
			error: { kind: "failed", detail: "the token exchange returned nothing" },
		}
	}
	return {
		credentials: {
			...credentialsOf(tokens, client),
			redirectUri: attempt.redirectUrl,
		},
	}
}

const loopbackUrl = (port: number | undefined) =>
	`http://${LOOPBACK}:${port}${REDIRECT_PATH}`

const listen = (port: number, fetch: Answer) =>
	Bun.serve({ hostname: LOOPBACK, port, fetch })

const registeredPort = (redirectUri: string): number | undefined => {
	if (!URL.canParse(redirectUri)) {
		return undefined
	}
	const port = Number(new URL(redirectUri).port)
	return port && redirectUri === loopbackUrl(port) ? port : undefined
}

const onRegisteredPort = (
	{ clientId, clientSecret, redirectUri }: AuthorizeRequest,
	answer: Answer,
): Listening | undefined => {
	if (!clientId || !redirectUri) {
		return undefined
	}
	const port = registeredPort(redirectUri)
	if (port === undefined) {
		return undefined
	}
	try {
		return {
			listener: listen(port, answer),
			redirectUrl: redirectUri,
			client: { client_id: clientId, client_secret: clientSecret },
		}
	} catch (error) {
		process.stderr.write(`${PORT_TAKEN}: ${describeError(error)}\n`)
		return undefined
	}
}

const onAnyPort = (answer: Answer): Listening => {
	const listener = listen(0, answer)
	return { listener, redirectUrl: loopbackUrl(listener.port) }
}

const storeConfirmation = (
	{ shown, show }: HeldPage,
	storeTimeoutMs: number,
): Flow["confirm"] => {
	const unconfirmed = setTimeout(
		() => show(failedText(UNCONFIRMED)),
		storeTimeoutMs,
	)
	shown.then(() => clearTimeout(unconfirmed))
	return ({ stored, detail }) => {
		show(stored ? GRANTED : failedText(detail ?? UNSTORED))
	}
}

export const authorizeMcpServer = async (
	request: AuthorizeRequest,
	emit: Emit,
	timeoutMs = FLOW_TIMEOUT_MS,
	storeTimeoutMs = STORE_TIMEOUT_MS,
): Promise<OauthAnswer> => {
	const { url } = request
	if (!url) {
		return { error: { kind: "failed", detail: "no server url was named" } }
	}
	if (running) {
		return {
			error: {
				kind: "busy",
				detail: "another authorization is already running",
			},
		}
	}
	const state = crypto.randomUUID()
	const { promise: arrival, resolve: settle } =
		Promise.withResolvers<Redirect>()
	const { promise: shown, resolve: show } = Promise.withResolvers<string>()
	const answer: Answer = (redirect) =>
		answerRedirect(redirect, state, settle, shown)
	const { listener, redirectUrl, client } =
		onRegisteredPort(request, answer) ?? onAnyPort(answer)
	const end = (failure: OauthFailure) => {
		settle({ failure })
		show(failurePage(failure))
	}
	const flow: Flow = { end, confirm: () => undefined }
	running = flow
	const expiry = setTimeout(() => end({ kind: "timedOut" }), timeoutMs)
	const { fetchFn, refusal } = watched(timedFetch)
	const settled = await exchanged({
		serverUrl: url,
		redirectUrl,
		state,
		arrival,
		settle,
		emit,
		fetchFn,
		client,
	}).catch((error: unknown) => ({ error: flowFailure(error, refusal()) }))
	const closed = shown.then(async () => {
		clearTimeout(expiry)
		running = undefined
		await theAnswerWritten()
		await listener.stop(true)
	})
	if ("error" in settled) {
		show(failurePage(settled.error))
		await closed
		return settled
	}
	flow.confirm = storeConfirmation({ shown, show }, storeTimeoutMs)
	closed.catch((error: unknown) => {
		process.stderr.write(`${UNCLOSED}: ${describeError(error)}\n`)
	})
	return settled
}

export const cancelMcpAuthorization = () => {
	running?.end({ kind: "cancelled" })
}

export const confirmMcpGrantStored = (report: StoredReport) => {
	running?.confirm(report)
}

type Revocable = [token: string, hint: string]

const revocables = ({ token, refreshToken }: RevokeRequest): Revocable[] => {
	const posted: Revocable[] = []
	if (token) {
		posted.push([token, "access_token"])
	}
	if (refreshToken) {
		posted.push([refreshToken, "refresh_token"])
	}
	return posted
}

const revocationBody = (
	{ clientId, clientSecret }: RevokeRequest,
	[token, hint]: Revocable,
) => {
	const body = new URLSearchParams({ token, token_type_hint: hint })
	if (clientId) {
		body.set("client_id", clientId)
	}
	if (clientSecret) {
		body.set("client_secret", clientSecret)
	}
	return body
}

const revocationEndpoint = (metadata?: AuthorizationServerMetadata) =>
	metadata && "revocation_endpoint" in metadata
		? metadata.revocation_endpoint
		: undefined

const posted = async (
	endpoint: string,
	request: RevokeRequest,
): Promise<RevocationAnswer> => {
	for (const revocable of revocables(request)) {
		const answered = await timedFetch(endpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: revocationBody(request, revocable),
		})
		if (!answered.ok) {
			return {
				revoked: false,
				detail: `the revocation endpoint answered ${answered.status}`,
			}
		}
	}
	return { revoked: true }
}

export const refreshMcpToken = async (
	{ url, refreshToken, clientId, clientSecret }: RefreshRequest,
	timeoutMs = REFRESH_TIMEOUT_MS,
): Promise<OauthAnswer> => {
	if (!url || !refreshToken || !clientId) {
		return {
			error: {
				kind: "failed",
				detail: "no server url, refresh token or client id was named",
			},
		}
	}
	const { fetchFn, refusal } = watched(
		fetchWithin(AbortSignal.timeout(timeoutMs)),
	)
	try {
		const discovered = await discoverOAuthServerInfo(url, { fetchFn })
		const client = { client_id: clientId, client_secret: clientSecret }
		const tokens = await refreshAuthorization(
			discovered.authorizationServerUrl,
			{
				metadata: discovered.authorizationServerMetadata,
				clientInformation: client,
				refreshToken,
				fetchFn,
			},
		)
		return { credentials: credentialsOf(tokens, client) }
	} catch (error) {
		return { error: flowFailure(error, refusal()) }
	}
}

export const revokeMcpToken = async (
	request: RevokeRequest,
): Promise<RevocationAnswer> => {
	const { url } = request
	if (!url || revocables(request).length === 0) {
		return { revoked: false, detail: "no server url or no token was named" }
	}
	try {
		const discovered = await discoverOAuthServerInfo(url, {
			fetchFn: timedFetch,
		})
		const endpoint = revocationEndpoint(discovered.authorizationServerMetadata)
		if (!endpoint) {
			return { revoked: false, detail: NO_REVOCATION }
		}
		return await posted(endpoint, request)
	} catch (error) {
		return { revoked: false, detail: describeError(error) }
	}
}
