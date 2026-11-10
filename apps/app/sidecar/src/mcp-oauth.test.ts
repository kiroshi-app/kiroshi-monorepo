import { afterEach, describe, expect, it } from "bun:test"

import {
	authorizeMcpServer,
	cancelMcpAuthorization,
	confirmMcpGrantStored,
	OAUTH_STARTED,
	type OauthAnswer,
	REFRESH_TIMEOUT_MS,
	refreshMcpToken,
	revokeMcpToken,
} from "./mcp-oauth"

const CLIENT_ID = "client-of-this-flow"
const CLIENT_SECRET = "secret-of-this-flow"
const HANDED_CLIENT_ID = "client-stored-before"
const HANDED_CLIENT_SECRET = "secret-stored-before"
const ACCESS_TOKEN = "granted-access-token"
const REFRESH_TOKEN = "granted-refresh-token"
const EXPIRES_IN = 3600
const CODE = "the-authorization-code"
const HELD_REFRESH_TOKEN = "held-refresh-token"
const REFUSED_GRANT = "the refresh token was revoked"
const HANG_BOUND_MS = 300
const AUTHORIZATION_BUDGET_MS = 10_000
const TIMEOUT_FLOW_MS = 2_000
const BODY_LIMIT = 400
const REFUSAL_BUDGET_MS = 3_000
const LATE_ANSWER_MS = 50
const STORE_BOUND_MS = 200
const GRANTED = "Authorization granted. You can close this tab."
const CONNECT_AGAIN = "Go back to Kiroshi and connect again."
const CANCELLED_PAGE = `Authorization failed: the connect was cancelled in Kiroshi. ${CONNECT_AGAIN}`
const STILL_HELD = Symbol("the page is still held")
const UNREACHABLE_AUTHORIZATION = "http://127.0.0.1:1/authorize"
const SESSION_GATE = "<html><body>Sign in to continue</body></html>"
const UNAVAILABLE = JSON.stringify({
	error: "temporarily_unavailable",
	error_description: "try again later",
})
const INVALID_REDIRECT = JSON.stringify({
	code: 400,
	error_code: "validation_failed",
	msg: "invalid redirect_uri",
})

type Registration = {
	redirectUris: string[]
	tokenRequests: URLSearchParams[]
	revocations: URLSearchParams[]
	authorizations: Request[]
	landings: number
}

type Refusal = {
	status: number
	body: string
}

const refusedWith = (error: string): Refusal => ({
	status: 400,
	body: JSON.stringify({ error, error_description: REFUSED_GRANT }),
})

type Authority = {
	url: string
	seen: Registration
	stop: () => Promise<void>
}

type AuthorizationEndpoint = {
	refusal?: Refusal
	held?: Promise<void>
}

const answerAuthorization = async (
	request: Request,
	seen: Registration,
	{ refusal, held }: AuthorizationEndpoint,
): Promise<Response | undefined> => {
	const asked = new URL(request.url)
	if (asked.pathname === "/login") {
		seen.landings += 1
		return new Response("sign in")
	}
	if (asked.pathname !== "/authorize") {
		return undefined
	}
	seen.authorizations.push(request)
	await held
	return refusal
		? new Response(refusal.body, { status: refusal.status })
		: Response.redirect(`${asked.origin}/login`, 302)
}

const anAuthorizationServer = ({
	discoverable = true,
	revocable = true,
	revocationStatus = 200,
	registrationRefusal,
	tokenRefusal,
	tokenHangs = false,
	authorizationScheme = "",
	authorizationRefusal,
	authorizationHeld,
	tokenDelay,
}: {
	discoverable?: boolean
	revocable?: boolean
	revocationStatus?: number
	registrationRefusal?: Refusal
	tokenRefusal?: Refusal
	tokenHangs?: boolean
	authorizationScheme?: string
	authorizationRefusal?: Refusal
	authorizationHeld?: Promise<void>
	tokenDelay?: () => Promise<void>
} = {}): Authority => {
	const seen: Registration = {
		redirectUris: [],
		tokenRequests: [],
		revocations: [],
		authorizations: [],
		landings: 0,
	}
	const served = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: async (request): Promise<Response> => {
			const asked = new URL(request.url)
			if (
				discoverable &&
				asked.pathname === "/.well-known/oauth-authorization-server"
			) {
				return Response.json({
					issuer: asked.origin,
					authorization_endpoint:
						authorizationScheme || `${asked.origin}/authorize`,
					token_endpoint: `${asked.origin}/token`,
					registration_endpoint: `${asked.origin}/register`,
					response_types_supported: ["code"],
					code_challenge_methods_supported: ["S256"],
					...(revocable
						? { revocation_endpoint: `${asked.origin}/revoke` }
						: {}),
				})
			}
			if (asked.pathname === "/register") {
				if (registrationRefusal) {
					return new Response(registrationRefusal.body, {
						status: registrationRefusal.status,
					})
				}
				const body = (await request.json()) as { redirect_uris: string[] }
				seen.redirectUris.push(...body.redirect_uris)
				return Response.json(
					{
						client_id: CLIENT_ID,
						client_secret: CLIENT_SECRET,
						redirect_uris: body.redirect_uris,
					},
					{ status: 201 },
				)
			}
			const authorized = await answerAuthorization(request, seen, {
				refusal: authorizationRefusal,
				held: authorizationHeld,
			})
			if (authorized) {
				return authorized
			}
			if (asked.pathname === "/token") {
				seen.tokenRequests.push(new URLSearchParams(await request.text()))
				await tokenDelay?.()
				if (tokenHangs) {
					return new Promise<Response>(() => {})
				}
				if (tokenRefusal) {
					return new Response(tokenRefusal.body, {
						status: tokenRefusal.status,
					})
				}
				return Response.json({
					access_token: ACCESS_TOKEN,
					refresh_token: REFRESH_TOKEN,
					token_type: "Bearer",
					expires_in: EXPIRES_IN,
				})
			}
			if (asked.pathname === "/revoke") {
				seen.revocations.push(new URLSearchParams(await request.text()))
				return new Response(null, { status: revocationStatus })
			}
			return new Response(null, { status: 404 })
		},
	})
	return {
		url: `http://127.0.0.1:${served.port}`,
		seen,
		stop: async () => {
			await served.stop(true)
		},
	}
}

const frames: Record<string, unknown>[] = []

const collect = (frame: Record<string, unknown>) => {
	frames.push(frame)
}

const startedFrames = () =>
	frames.filter((frame) => frame.type === OAUTH_STARTED)

let inFlight: Promise<OauthAnswer> | undefined

const aFlow = (url: string, timeoutMs?: number) => {
	frames.length = 0
	inFlight = authorizeMcpServer({ url }, collect, timeoutMs)
	return inFlight
}

const waitForAuthorization = async (seen: Registration) => {
	const deadline = Date.now() + AUTHORIZATION_BUDGET_MS
	while (Date.now() < deadline) {
		const [started] = startedFrames()
		const [redirect] = seen.redirectUris
		if (started && redirect) {
			return { redirect, asked: new URL(String(started.url)) }
		}
		await Bun.sleep(10)
	}
	throw new Error("the flow never opened an authorization url")
}

const aFreePort = async () => {
	const probe = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response(),
	})
	const { port } = probe
	await probe.stop(true)
	return port
}

const aRegisteredRedirect = async () =>
	`http://127.0.0.1:${await aFreePort()}/oauth/callback`

const aFlowUnder = (url: string, redirectUri?: string) => {
	frames.length = 0
	inFlight = authorizeMcpServer(
		{
			url,
			clientId: HANDED_CLIENT_ID,
			clientSecret: HANDED_CLIENT_SECRET,
			redirectUri,
		},
		collect,
	)
	return inFlight
}

const waitForStarted = async () => {
	const deadline = Date.now() + AUTHORIZATION_BUDGET_MS
	while (Date.now() < deadline) {
		const [started] = startedFrames()
		if (started) {
			return new URL(String(started.url))
		}
		await Bun.sleep(10)
	}
	throw new Error("the flow never opened an authorization url")
}

const redirectedWithCode = (asked: URL) => {
	const landing = new URL(String(asked.searchParams.get("redirect_uri")))
	landing.searchParams.set("code", CODE)
	landing.searchParams.set("state", String(asked.searchParams.get("state")))
	return fetch(landing)
}

const aFlowWaitingForStore = (
	url: string,
	storeTimeoutMs: number,
	timeoutMs?: number,
) => {
	frames.length = 0
	inFlight = authorizeMcpServer({ url }, collect, timeoutMs, storeTimeoutMs)
	return inFlight
}

const aHeldPage = async (url: string, storeTimeoutMs: number) => {
	const flow = aFlowWaitingForStore(url, storeTimeoutMs)
	const page = redirectedWithCode(await waitForStarted())
	const settled = await flow
	return { page, settled }
}

const stillHeld = (page: Promise<Response>) =>
	Promise.race([page, Bun.sleep(LATE_ANSWER_MS).then(() => STILL_HELD)])

const exchangeReached = async (seen: Registration) => {
	while (seen.tokenRequests.length === 0) {
		await Bun.sleep(10)
	}
}

const textOf = async (page: Promise<Response>) => {
	const answered = await page
	return {
		text: await answered.text(),
		type: answered.headers.get("content-type"),
	}
}

describe("mcp oauth", () => {
	afterEach(async () => {
		cancelMcpAuthorization()
		await inFlight
		confirmMcpGrantStored({ stored: false })
		inFlight = undefined
	})

	it("drives discovery, registration, the redirect and the exchange", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			const landing = new URL(redirect)
			landing.searchParams.set("code", CODE)
			landing.searchParams.set("state", String(asked.searchParams.get("state")))
			const answered = fetch(landing)
			const settled = await flow
			confirmMcpGrantStored({ stored: true })

			expect((await answered).status).toBe(200)
			expect(landing.hostname).toBe("127.0.0.1")
			expect(asked.searchParams.get("code_challenge_method")).toBe("S256")
			expect(asked.searchParams.get("client_id")).toBe(CLIENT_ID)
			expect(authority.seen.tokenRequests[0]?.get("code")).toBe(CODE)
			expect(authority.seen.tokenRequests[0]?.get("code_verifier")).toBeTruthy()
			expect(authority.seen.tokenRequests[0]?.get("redirect_uri")).toBe(
				redirect,
			)
			expect(settled).toEqual({
				credentials: {
					accessToken: ACCESS_TOKEN,
					refreshToken: REFRESH_TOKEN,
					expiresAt: expect.any(Number),
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
					redirectUri: redirect,
				},
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("authorizes under a handed client on the port it was registered for", async () => {
		const authority = anAuthorizationServer()
		try {
			const registered = await aRegisteredRedirect()
			const flow = aFlowUnder(authority.url, registered)
			const asked = await waitForStarted()
			redirectedWithCode(asked)
			const settled = await flow

			expect(asked.searchParams.get("client_id")).toBe(HANDED_CLIENT_ID)
			expect(asked.searchParams.get("redirect_uri")).toBe(registered)
			expect(authority.seen.tokenRequests[0]?.get("redirect_uri")).toBe(
				registered,
			)
			expect(authority.seen.redirectUris).toEqual([])
			expect(authority.seen.tokenRequests[0]?.get("code")).toBe(CODE)
			expect(settled).toEqual({
				credentials: {
					accessToken: ACCESS_TOKEN,
					refreshToken: REFRESH_TOKEN,
					expiresAt: expect.any(Number),
					clientId: HANDED_CLIENT_ID,
					clientSecret: HANDED_CLIENT_SECRET,
					redirectUri: registered,
				},
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("names the code the token endpoint refused a handed client with", async () => {
		const authority = anAuthorizationServer({
			tokenRefusal: refusedWith("invalid_client"),
		})
		try {
			const flow = aFlowUnder(authority.url, await aRegisteredRedirect())
			await redirectedWithCode(await waitForStarted())

			expect(await flow).toEqual({
				error: {
					kind: "rejected",
					detail: "the token endpoint answered 400: invalid_client",
					step: "tokenExchange",
					status: 400,
					body: REFUSED_GRANT,
					code: "invalid_client",
				},
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("registers a new client when the registered port is taken", async () => {
		const authority = anAuthorizationServer()
		const taken = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => new Response(),
		})
		try {
			const registered = `http://127.0.0.1:${taken.port}/oauth/callback`
			const flow = aFlowUnder(authority.url, registered)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			redirectedWithCode(asked)

			expect(asked.searchParams.get("client_id")).toBe(CLIENT_ID)
			expect(redirect).not.toBe(registered)
			expect(await flow).toMatchObject({
				credentials: { clientId: CLIENT_ID, redirectUri: redirect },
			})
		} finally {
			await taken.stop(true)
			await authority.stop()
		}
	}, 20_000)

	it("registers a new client when a handed client carries no redirect uri", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlowUnder(authority.url)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			redirectedWithCode(asked)

			expect(asked.searchParams.get("client_id")).toBe(CLIENT_ID)
			expect(await flow).toMatchObject({
				credentials: { clientId: CLIENT_ID, redirectUri: redirect },
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("ends the attempt with the status and body the authorization url answered", async () => {
		const authority = anAuthorizationServer({
			authorizationRefusal: { status: 400, body: INVALID_REDIRECT },
		})
		try {
			const began = Date.now()
			const settled = await aFlowUnder(
				authority.url,
				await aRegisteredRedirect(),
			)

			expect(Date.now() - began).toBeLessThan(REFUSAL_BUDGET_MS)
			expect(settled).toEqual({
				error: {
					kind: "failed",
					detail: "the authorization endpoint answered 400",
					status: 400,
					body: INVALID_REDIRECT,
				},
			})
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("keeps waiting past a gate that answers the authorization url 403", async () => {
		const authority = anAuthorizationServer({
			authorizationRefusal: { status: 403, body: SESSION_GATE },
		})
		try {
			const flow = aFlowUnder(authority.url, await aRegisteredRedirect())
			const asked = await waitForStarted()
			while (authority.seen.authorizations.length === 0) {
				await Bun.sleep(10)
			}
			await Bun.sleep(LATE_ANSWER_MS)
			redirectedWithCode(asked)

			expect(await flow).toMatchObject({
				credentials: { accessToken: ACCESS_TOKEN, clientId: HANDED_CLIENT_ID },
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("ends the attempt on a status above 400 that names an oauth error", async () => {
		const authority = anAuthorizationServer({
			authorizationRefusal: { status: 503, body: UNAVAILABLE },
		})
		try {
			const settled = await aFlowUnder(
				authority.url,
				await aRegisteredRedirect(),
			)

			expect(settled).toEqual({
				error: {
					kind: "failed",
					detail: "the authorization endpoint answered 503",
					status: 503,
					body: UNAVAILABLE,
				},
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("requests the authorization url itself, follows no redirect and sends no credential", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const asked = await waitForStarted()
			while (authority.seen.authorizations.length === 0) {
				await Bun.sleep(10)
			}
			await Bun.sleep(LATE_ANSWER_MS)
			cancelMcpAuthorization()

			const [probed] = authority.seen.authorizations
			expect(probed?.url).toBe(asked.toString())
			expect(probed?.headers.get("authorization")).toBeNull()
			expect(probed?.headers.get("cookie")).toBeNull()
			expect(authority.seen.landings).toBe(0)
			expect(await flow).toEqual({ error: { kind: "cancelled" } })
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("keeps waiting when the authorization url cannot be reached", async () => {
		const authority = anAuthorizationServer({
			authorizationScheme: UNREACHABLE_AUTHORIZATION,
		})
		try {
			const flow = aFlow(authority.url)
			await waitForStarted()
			await Bun.sleep(LATE_ANSWER_MS * 4)
			cancelMcpAuthorization()

			expect(await flow).toEqual({ error: { kind: "cancelled" } })
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("leaves a granted attempt as it settled when the refusal lands late", async () => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>()
		const authority = anAuthorizationServer({
			authorizationRefusal: { status: 400, body: INVALID_REDIRECT },
			authorizationHeld: held,
		})
		try {
			const flow = aFlowUnder(authority.url, await aRegisteredRedirect())
			redirectedWithCode(await waitForStarted())
			const settled = await flow
			release()
			await Bun.sleep(LATE_ANSWER_MS)

			expect(settled).toMatchObject({
				credentials: { accessToken: ACCESS_TOKEN },
			})
		} finally {
			release()
			await authority.stop()
		}
	}, 20_000)

	it("keeps the authorization answer out of a token exchange refusal", async () => {
		const { promise: held, resolve: release } = Promise.withResolvers<void>()
		const authority = anAuthorizationServer({
			authorizationRefusal: { status: 400, body: INVALID_REDIRECT },
			authorizationHeld: held,
			tokenRefusal: refusedWith("invalid_client"),
			tokenDelay: async () => {
				release()
				await Bun.sleep(LATE_ANSWER_MS)
			},
		})
		try {
			const flow = aFlowUnder(authority.url, await aRegisteredRedirect())
			await redirectedWithCode(await waitForStarted())

			expect(await flow).toMatchObject({
				error: {
					kind: "rejected",
					step: "tokenExchange",
					code: "invalid_client",
				},
			})
		} finally {
			release()
			await authority.stop()
		}
	}, 20_000)

	it("refuses a redirect on another path and keeps the flow waiting", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect } = await waitForAuthorization(authority.seen)
			const elsewhere = new URL(redirect)
			elsewhere.pathname = "/elsewhere"
			const answered = await fetch(elsewhere)
			cancelMcpAuthorization()

			expect(answered.status).toBe(400)
			expect(await flow).toEqual({ error: { kind: "cancelled" } })
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("refuses a redirect carrying another state and keeps the flow waiting", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect } = await waitForAuthorization(authority.seen)
			const landing = new URL(redirect)
			landing.searchParams.set("code", CODE)
			landing.searchParams.set("state", "not-the-state-of-this-flow")
			const answered = await fetch(landing)
			cancelMcpAuthorization()

			expect(answered.status).toBe(400)
			expect(await flow).toEqual({ error: { kind: "cancelled" } })
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("settles as failed when the redirect carries an error", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			const landing = new URL(redirect)
			landing.searchParams.set("error", "access_denied")
			landing.searchParams.set("state", String(asked.searchParams.get("state")))
			await fetch(landing)

			expect(await flow).toEqual({
				error: {
					kind: "denied",
					detail: "access_denied",
					code: "access_denied",
				},
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("settles as timed out and frees the port it bound", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url, TIMEOUT_FLOW_MS)
			const { redirect } = await waitForAuthorization(authority.seen)

			expect(await flow).toEqual({ error: { kind: "timedOut" } })
			await expect(fetch(redirect)).rejects.toThrow()
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("refuses a second flow while one is running", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			await waitForAuthorization(authority.seen)
			const second = await authorizeMcpServer({ url: authority.url }, collect)
			cancelMcpAuthorization()
			await flow

			expect(second).toMatchObject({ error: { kind: "busy" } })
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("refuses a redirect whose host header names neither loopback name", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			const landing = new URL(redirect)
			landing.searchParams.set("code", CODE)
			landing.searchParams.set("state", String(asked.searchParams.get("state")))
			const rebound = await fetch(landing, {
				headers: { Host: "granola.attacker.test" },
			})
			cancelMcpAuthorization()

			expect(rebound.status).toBe(400)
			expect(await flow).toEqual({ error: { kind: "cancelled" } })
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("takes a redirect whose host header names localhost with the bound port", async () => {
		const authority = anAuthorizationServer()
		try {
			const flow = aFlow(authority.url)
			const { redirect, asked } = await waitForAuthorization(authority.seen)
			const landing = new URL(redirect)
			landing.searchParams.set("code", CODE)
			landing.searchParams.set("state", String(asked.searchParams.get("state")))
			const answered = fetch(landing, {
				headers: { Host: `localhost:${landing.port}` },
			})

			expect(await flow).toMatchObject({
				credentials: { accessToken: ACCESS_TOKEN },
			})
			confirmMcpGrantStored({ stored: true })
			expect((await answered).status).toBe(200)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("refuses an authorization endpoint naming a scheme no browser may open", async () => {
		const authority = anAuthorizationServer({
			authorizationScheme: "file:///etc/passwd",
		})
		try {
			const settled = await aFlow(authority.url)

			expect(settled).toEqual({
				error: {
					kind: "failed",
					detail: "the authorization server named the refused scheme file:",
				},
			})
			expect(startedFrames()).toEqual([])
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("names the registration endpoint and its status when it refuses", async () => {
		const authority = anAuthorizationServer({
			registrationRefusal: { status: 403, body: "Forbidden" },
		})
		try {
			const settled = await aFlow(authority.url)

			expect(settled).toEqual({
				error: {
					kind: "failed",
					detail: "the registration endpoint answered 403",
					step: "registration",
					status: 403,
					body: "Forbidden",
				},
			})
			expect(startedFrames()).toEqual([])
			expect(authority.seen.tokenRequests).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers the held page with the failure text once the code exchange fails", async () => {
		const authority = anAuthorizationServer({
			tokenRefusal: refusedWith("invalid_grant"),
		})
		try {
			const flow = aFlow(authority.url)
			const page = textOf(redirectedWithCode(await waitForStarted()))

			expect(await flow).toMatchObject({ error: { kind: "rejected" } })
			const { text, type } = await page
			expect(text).toContain("the token endpoint answered 400: invalid_grant")
			expect(text).toContain(CONNECT_AGAIN)
			expect(text).not.toContain(GRANTED)
			expect(type).toStartWith("text/plain")
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("holds the page past the exchange until the host confirms the store, then answers granted", async () => {
		const authority = anAuthorizationServer()
		try {
			const { page, settled } = await aHeldPage(
				authority.url,
				AUTHORIZATION_BUDGET_MS,
			)

			expect(settled).toMatchObject({
				credentials: { accessToken: ACCESS_TOKEN },
			})
			expect(await stillHeld(page)).toBe(STILL_HELD)
			confirmMcpGrantStored({ stored: true })
			expect(await textOf(page)).toEqual({
				text: GRANTED,
				type: expect.stringMatching(/^text\/plain/),
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers the held page with the failure text carrying the detail of a refused store", async () => {
		const authority = anAuthorizationServer()
		try {
			const { page } = await aHeldPage(authority.url, AUTHORIZATION_BUDGET_MS)
			confirmMcpGrantStored({
				stored: false,
				detail: "the grant could not be stored: the disk is full",
			})

			const { text, type } = await textOf(page)
			expect(text).toBe(
				`Authorization failed: the grant could not be stored: the disk is full. ${CONNECT_AGAIN}`,
			)
			expect(type).toStartWith("text/plain")
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers the held page with the failure text when the store is never confirmed", async () => {
		const authority = anAuthorizationServer()
		try {
			const { page } = await aHeldPage(authority.url, STORE_BOUND_MS)

			const { text } = await textOf(page)
			expect(text).toContain("Kiroshi never confirmed it stored the grant")
			expect(text).toContain(CONNECT_AGAIN)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers the held page with the failure text on the flow timeout during the exchange", async () => {
		const { promise: stalled, resolve: resume } = Promise.withResolvers<void>()
		const authority = anAuthorizationServer({ tokenDelay: () => stalled })
		try {
			const flow = aFlowWaitingForStore(
				authority.url,
				AUTHORIZATION_BUDGET_MS,
				TIMEOUT_FLOW_MS,
			)
			const outlasted = redirectedWithCode(await waitForStarted())

			expect((await textOf(outlasted)).text).toBe(
				`Authorization failed: Kiroshi stopped waiting for this authorization. ${CONNECT_AGAIN}`,
			)
			resume()
			expect(await flow).toEqual({ error: { kind: "timedOut" } })
		} finally {
			resume()
			await authority.stop()
		}
	}, 20_000)

	it("answers cancelled on the page and in the authorize answer when a cancel reaches the exchange in flight", async () => {
		for (const tokenRefusal of [undefined, refusedWith("invalid_grant")]) {
			const { promise: stalled, resolve: resume } =
				Promise.withResolvers<void>()
			const authority = anAuthorizationServer({
				tokenDelay: () => stalled,
				tokenRefusal,
			})
			try {
				const flow = aFlow(authority.url)
				const page = textOf(redirectedWithCode(await waitForStarted()))
				await exchangeReached(authority.seen)
				cancelMcpAuthorization()
				resume()

				expect(await flow).toEqual({ error: { kind: "cancelled" } })
				expect((await page).text).toBe(CANCELLED_PAGE)
			} finally {
				resume()
				await authority.stop()
			}
		}
	}, 20_000)

	it("keeps the granted outcome and the page held when a cancel follows the credentials", async () => {
		const authority = anAuthorizationServer()
		try {
			for (const { report, text } of [
				{ report: { stored: true }, text: GRANTED },
				{
					report: { stored: false, detail: "the disk is full" },
					text: `Authorization failed: the disk is full. ${CONNECT_AGAIN}`,
				},
			]) {
				const { page, settled } = await aHeldPage(
					authority.url,
					AUTHORIZATION_BUDGET_MS,
				)
				cancelMcpAuthorization()

				expect(settled).toMatchObject({
					credentials: { accessToken: ACCESS_TOKEN },
				})
				expect(await stillHeld(page)).toBe(STILL_HELD)
				expect(
					await authorizeMcpServer({ url: authority.url }, collect),
				).toMatchObject({ error: { kind: "busy" } })
				confirmMcpGrantStored(report)
				expect((await textOf(page)).text).toBe(text)
			}
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("refuses a second flow while a cancelled exchange has not returned", async () => {
		const { promise: stalled, resolve: resume } = Promise.withResolvers<void>()
		const authority = anAuthorizationServer({ tokenDelay: () => stalled })
		try {
			const flow = aFlow(authority.url)
			const page = textOf(redirectedWithCode(await waitForStarted()))
			while (authority.seen.tokenRequests.length === 0) {
				await Bun.sleep(10)
			}
			cancelMcpAuthorization()

			expect((await page).text).toBe(
				`Authorization failed: the connect was cancelled in Kiroshi. ${CONNECT_AGAIN}`,
			)
			expect(
				await authorizeMcpServer({ url: authority.url }, collect),
			).toMatchObject({ error: { kind: "busy" } })
			resume()
			await flow
			const next = aFlow(authority.url)
			await waitForStarted()
			cancelMcpAuthorization()
			expect(await next).toEqual({ error: { kind: "cancelled" } })
		} finally {
			resume()
			await authority.stop()
		}
	}, 20_000)

	it("keeps the listener and the one-flow guard until the held page is answered", async () => {
		const authority = anAuthorizationServer()
		try {
			const { page, settled } = await aHeldPage(
				authority.url,
				AUTHORIZATION_BUDGET_MS,
			)
			const redirect = String(
				"credentials" in settled ? settled.credentials.redirectUri : "",
			)

			expect((await fetch(redirect)).status).toBe(400)
			expect(
				await authorizeMcpServer({ url: authority.url }, collect),
			).toMatchObject({ error: { kind: "busy" } })
			confirmMcpGrantStored({ stored: true })
			await page
			await Bun.sleep(LATE_ANSWER_MS)
			await expect(fetch(redirect)).rejects.toThrow()
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("posts the token to the revocation endpoint the metadata advertises", async () => {
		const authority = anAuthorizationServer()
		try {
			const answered = await revokeMcpToken({
				url: authority.url,
				token: ACCESS_TOKEN,
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
			})

			expect(answered).toEqual({ revoked: true })
			expect(authority.seen.revocations[0]?.get("token")).toBe(ACCESS_TOKEN)
			expect(authority.seen.revocations[0]?.get("client_id")).toBe(CLIENT_ID)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("posts the refresh token under its own hint beside the access token", async () => {
		const authority = anAuthorizationServer()
		try {
			const answered = await revokeMcpToken({
				url: authority.url,
				token: ACCESS_TOKEN,
				refreshToken: REFRESH_TOKEN,
			})

			expect(answered).toEqual({ revoked: true })
			expect(
				authority.seen.revocations.map((posted) => [
					posted.get("token"),
					posted.get("token_type_hint"),
				]),
			).toEqual([
				[ACCESS_TOKEN, "access_token"],
				[REFRESH_TOKEN, "refresh_token"],
			])
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers the status a revocation outside 2xx came back with", async () => {
		const authority = anAuthorizationServer({ revocationStatus: 503 })
		try {
			const answered = await revokeMcpToken({
				url: authority.url,
				token: ACCESS_TOKEN,
				refreshToken: REFRESH_TOKEN,
			})

			expect(answered).toEqual({
				revoked: false,
				detail: "the revocation endpoint answered 503",
			})
			expect(authority.seen.revocations).toHaveLength(1)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("exchanges the refresh token and answers the grant it came back with", async () => {
		const authority = anAuthorizationServer()
		try {
			const before = Date.now()
			const answered = await refreshMcpToken({
				url: authority.url,
				refreshToken: HELD_REFRESH_TOKEN,
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
			})
			const [posted] = authority.seen.tokenRequests

			expect(posted?.get("grant_type")).toBe("refresh_token")
			expect(posted?.get("refresh_token")).toBe(HELD_REFRESH_TOKEN)
			expect(answered).toEqual({
				credentials: {
					accessToken: ACCESS_TOKEN,
					refreshToken: REFRESH_TOKEN,
					expiresAt: expect.any(Number),
					clientId: CLIENT_ID,
					clientSecret: CLIENT_SECRET,
				},
			})
			const expiresAt =
				"credentials" in answered ? (answered.credentials.expiresAt ?? 0) : 0
			expect(expiresAt).toBeGreaterThanOrEqual(before + EXPIRES_IN * 1000)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	const refreshedAgainst = async (tokenRefusal: Refusal) => {
		const authority = anAuthorizationServer({ tokenRefusal })
		try {
			return await refreshMcpToken({
				url: authority.url,
				refreshToken: HELD_REFRESH_TOKEN,
				clientId: CLIENT_ID,
			})
		} finally {
			await authority.stop()
		}
	}

	for (const code of [
		"invalid_grant",
		"invalid_client",
		"unauthorized_client",
	]) {
		it(`answers rejected naming the step, the status and ${code}`, async () => {
			expect(await refreshedAgainst(refusedWith(code))).toEqual({
				error: {
					kind: "rejected",
					detail: `the token endpoint answered 400: ${code}`,
					step: "tokenExchange",
					status: 400,
					body: REFUSED_GRANT,
					code,
				},
			})
		}, 20_000)
	}

	it("answers failed when the token endpoint names any other OAuth error", async () => {
		expect(
			await refreshedAgainst(refusedWith("temporarily_unavailable")),
		).toEqual({
			error: {
				kind: "failed",
				detail: "the token endpoint answered 400: temporarily_unavailable",
				step: "tokenExchange",
				status: 400,
				body: REFUSED_GRANT,
				code: "temporarily_unavailable",
			},
		})
	}, 20_000)

	it("carries no body when an OAuth error describes itself no further", async () => {
		const answered = await refreshedAgainst({
			status: 400,
			body: JSON.stringify({ error: "invalid_request" }),
		})

		expect(answered).toEqual({
			error: {
				kind: "failed",
				detail: "the token endpoint answered 400: invalid_request",
				step: "tokenExchange",
				status: 400,
				code: "invalid_request",
			},
		})
	}, 20_000)

	it("names no step when the token request throws after a refused discovery", async () => {
		const authority = anAuthorizationServer({
			discoverable: false,
			tokenHangs: true,
		})
		try {
			const answered = await refreshMcpToken(
				{
					url: authority.url,
					refreshToken: HELD_REFRESH_TOKEN,
					clientId: CLIENT_ID,
				},
				HANG_BOUND_MS,
			)

			expect(authority.seen.tokenRequests).toHaveLength(1)
			expect(answered).toEqual({
				error: { kind: "failed", detail: expect.any(String) },
			})
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("names the token exchange when a refused body is no OAuth error", async () => {
		const answered = await refreshedAgainst({
			status: 500,
			body: "<html>\n  Service Unavailable\n</html>",
		})

		expect(answered).toEqual({
			error: {
				kind: "failed",
				detail: "the token endpoint answered 500",
				step: "tokenExchange",
				status: 500,
				body: "<html> Service Unavailable </html>",
			},
		})
	}, 20_000)

	it("carries at most four hundred characters of a refused body", async () => {
		const answered = await refreshedAgainst({
			status: 502,
			body: "x".repeat(BODY_LIMIT + 120),
		})

		expect(answered).toEqual({
			error: {
				kind: "failed",
				detail: "the token endpoint answered 502",
				step: "tokenExchange",
				status: 502,
				body: "x".repeat(BODY_LIMIT),
			},
		})
	}, 20_000)

	it("bounds a refresh at ten seconds", () => {
		expect(REFRESH_TIMEOUT_MS).toBe(10_000)
	})

	it("answers failed once a hanging authority outlasts the bound", async () => {
		const authority = anAuthorizationServer({ tokenHangs: true })
		try {
			const started = Date.now()
			const answered = await refreshMcpToken(
				{
					url: authority.url,
					refreshToken: HELD_REFRESH_TOKEN,
					clientId: CLIENT_ID,
				},
				HANG_BOUND_MS,
			)

			expect(answered).toMatchObject({ error: { kind: "failed" } })
			expect(Date.now() - started).toBeLessThan(HANG_BOUND_MS + 2_000)
			expect(authority.seen.tokenRequests).toHaveLength(1)
		} finally {
			await authority.stop()
		}
	}, 20_000)

	it("answers failed when the authority cannot be reached", async () => {
		const authority = anAuthorizationServer()
		await authority.stop()

		const answered = await refreshMcpToken({
			url: authority.url,
			refreshToken: HELD_REFRESH_TOKEN,
			clientId: CLIENT_ID,
		})

		expect(answered).toMatchObject({ error: { kind: "failed" } })
		expect(authority.seen.tokenRequests).toHaveLength(0)
	}, 20_000)

	it("answers that no revocation endpoint was advertised", async () => {
		const authority = anAuthorizationServer({ revocable: false })
		try {
			const answered = await revokeMcpToken({
				url: authority.url,
				token: ACCESS_TOKEN,
			})

			expect(answered.revoked).toBe(false)
			expect(answered.detail).toContain("no revocation endpoint")
			expect(authority.seen.revocations).toHaveLength(0)
		} finally {
			await authority.stop()
		}
	}, 20_000)
})
