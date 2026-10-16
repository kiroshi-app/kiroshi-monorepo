import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { AUTHORIZE_COPY } from "./authorize-copy"
import { LOGIN_COPY } from "./login-copy"
import { createSiteRouter } from "./router"

const EMAIL = "ada@example.com"
const NAME = "Ada Lovelace"
const BEARER = "bearer-of-the-site"
const BEARER_KEY = "kiroshi.relay.bearer"
const REQUEST_ID = "6f1c2a4e-8b3d-4c5e-9a7f-0123456789ab"
const AUTHORIZE_PATH = `/authorize?request=${REQUEST_ID}`
const DONE_PATH = `/authorize/done?request=${REQUEST_ID}`
const DEVICE_NAME = "Ada’s MacBook Pro"
const DEVICE_CAPTION = "Kiroshi for Mac · now"
const DAY_MS = 86_400_000
const ME = "GET /me"
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const READ_REQUEST = `GET /authorization-requests/${REQUEST_ID}`
const APPROVE = `POST /authorization-requests/${REQUEST_ID}/approve`
const CANCEL = `POST /authorization-requests/${REQUEST_ID}/cancel`
const SIGN_OUT = "POST /api/auth/sign-out"
const RETRY_LABEL = "Retry"

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error | Promise<Reply>>

type RelayCall = {
	route: string
	authorization: string | null
	credentials: RequestCredentials | undefined
}

type Router = ReturnType<typeof createSiteRouter>

const relayError = (status: number, code: string): Reply => ({
	status,
	body: { error: { code, message: code, status } },
})

const requestWith = (status: string, requestedAt = Date.now()): Reply => ({
	body: {
		id: REQUEST_ID,
		deviceName: DEVICE_NAME,
		platform: "macos",
		requestedAt: new Date(requestedAt).toISOString(),
		expiresAt: "2026-10-12T10:10:00Z",
		status,
	},
})

const relayRoutes = (): RelayRoutes => ({
	[SEND_CODE]: { body: { status: true } },
	[SIGN_IN]: { body: { token: BEARER, user: { email: EMAIL } } },
	[ME]: { body: { email: EMAIL, name: NAME, plan: "pro" } },
	[READ_REQUEST]: requestWith("pending"),
	[APPROVE]: {
		body: {
			redirectURL: `http://127.0.0.1:4321/callback?request=${REQUEST_ID}`,
		},
	},
	[CANCEL]: { body: { status: "cancelled" } },
	[SIGN_OUT]: { body: { success: true } },
})

let routes: RelayRoutes = {}
let calls: RelayCall[] = []

const answer = async (input: URL | string, init?: RequestInit) => {
	const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`
	calls.push({
		route,
		authorization: new Headers(init?.headers).get("Authorization"),
		credentials: init?.credentials,
	})
	const reply = await routes[route]
	if (!reply) throw new Error(`The fake relay has no ${route}`)
	if (reply instanceof Error) throw reply
	return Response.json(reply.body ?? {}, { status: reply.status ?? 200 })
}

const callsTo = (route: string) => calls.filter((call) => call.route === route)

const expectBearerWithoutCredentials = (route: string) => {
	expect(callsTo(route)[0]?.authorization).toBe(`Bearer ${BEARER}`)
	expect(callsTo(route)[0]?.credentials).toBeUndefined()
}

const renderSite = (path: string) => {
	const router = createSiteRouter(
		createMemoryHistory({ initialEntries: [path] }),
	)
	render(
		<I18nProvider>
			<RouterProvider router={router} />
		</I18nProvider>,
	)
	return router
}

const signedIn = () => localStorage.setItem(BEARER_KEY, BEARER)

const heading = (name: string) => screen.findByRole("heading", { name })

const button = (name: string) => screen.getByRole("button", { name })

const press = (name: string) => fireEvent.click(button(name))

const landedOn = (router: Router, pathname: string) =>
	waitFor(() => expect(router.state.location.pathname).toBe(pathname))

const landedOnLoginFor = async (router: Router) => {
	await landedOn(router, "/login")
	expect(router.state.location.search).toEqual({ redirect: AUTHORIZE_PATH })
	await heading(LOGIN_COPY.signInTitle)
}

const signInByCode = async () => {
	fireEvent.change(screen.getByLabelText(LOGIN_COPY.emailLabel), {
		target: { value: EMAIL },
	})
	press(LOGIN_COPY.emailSubmit)
	await heading(LOGIN_COPY.codeTitle)
	fireEvent.change(screen.getByLabelText(LOGIN_COPY.codeLabel), {
		target: { value: "123456" },
	})
}

const openContinueAs = async (path = AUTHORIZE_PATH) => {
	signedIn()
	const router = renderSite(path)
	await heading(AUTHORIZE_COPY.continueAsTitle)
	return router
}

const openApproval = async () => {
	const router = await openContinueAs()
	press(AUTHORIZE_COPY.continueAs("Ada"))
	await heading(AUTHORIZE_COPY.approveTitle)
	return router
}

const expectCancelledCard = async () => {
	await heading(AUTHORIZE_COPY.cancelledTitle)
	expect(screen.getByText(AUTHORIZE_COPY.cancelledLead)).toBeTruthy()
	expect(screen.queryAllByRole("button")).toHaveLength(0)
	expect(
		screen.queryByRole("heading", { name: AUTHORIZE_COPY.expiredTitle }),
	).toBeNull()
}

const expectBrowserSignedOut = () => {
	expect(callsTo(SIGN_OUT)).toHaveLength(1)
	expectBearerWithoutCredentials(SIGN_OUT)
	expect(localStorage.getItem(BEARER_KEY)).toBeNull()
}

const expectNoBearerAfterSignOut = () => {
	const signOutIndex = calls.findIndex((call) => call.route === SIGN_OUT)
	const callsAfter = calls.slice(signOutIndex + 1)
	expect(callsAfter.every((call) => call.authorization === null)).toBe(true)
}

const expectNoAppLink = () => {
	expect(document.querySelector('a[href^="kiroshi:"]')).toBeNull()
	expect(screen.queryByText(/open kiroshi/i)).toBeNull()
}

beforeEach(() => {
	routes = relayRoutes()
	calls = []
	vi.stubGlobal("fetch", vi.fn(answer))
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	localStorage.clear()
	sessionStorage.clear()
})

describe("the authorize page, signed out", () => {
	it("goes through /login and comes back to the request without Continue as", async () => {
		const router = renderSite(AUTHORIZE_PATH)

		await landedOnLoginFor(router)
		await signInByCode()

		await heading(AUTHORIZE_COPY.approveTitle)
		expect(router.state.location.href).toBe(AUTHORIZE_PATH)
		expect(screen.getByText(DEVICE_NAME)).toBeTruthy()
		expect(screen.getByText(DEVICE_CAPTION)).toBeTruthy()
		expect(
			screen.queryByRole("heading", {
				name: AUTHORIZE_COPY.continueAsTitle,
			}),
		).toBeNull()
	})

	it("shows Continue as on a reload of the same request after the sign-in", async () => {
		const router = renderSite(AUTHORIZE_PATH)
		await landedOnLoginFor(router)
		await signInByCode()
		await heading(AUTHORIZE_COPY.approveTitle)
		cleanup()

		renderSite(AUTHORIZE_PATH)

		await heading(AUTHORIZE_COPY.continueAsTitle)
	})
})

describe("Continue as", () => {
	it("names the signed-in account with Continue and Use another account", async () => {
		await openContinueAs()

		expect(
			screen.getByText(AUTHORIZE_COPY.continueAsLead(DEVICE_NAME)),
		).toBeTruthy()
		expect(screen.getByText(NAME)).toBeTruthy()
		expect(screen.getByText(EMAIL)).toBeTruthy()
		expect(screen.getByText(AUTHORIZE_COPY.proBadge)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.continueAs("Ada"))).toBeTruthy()
		expect(button(AUTHORIZE_COPY.anotherAccount)).toBeTruthy()
		expectBearerWithoutCredentials(ME)
		expectNoAppLink()
	})

	it("shows no plan badge on a free account", async () => {
		routes[ME] = { body: { email: EMAIL, name: NAME, plan: "free" } }
		await openContinueAs()

		expect(screen.getByText(NAME)).toBeTruthy()
		expect(screen.queryByText(AUTHORIZE_COPY.proBadge)).toBeNull()
		expect(screen.queryByText("Free")).toBeNull()
	})

	it("names the account by its email while it has no name", async () => {
		routes[ME] = { body: { email: EMAIL, name: null } }
		signedIn()
		renderSite(AUTHORIZE_PATH)

		await heading(AUTHORIZE_COPY.continueAsTitle)
		expect(button(AUTHORIZE_COPY.continueAs(EMAIL))).toBeTruthy()
	})

	it("ends the site session on Use another account and comes back to the request", async () => {
		const router = await openContinueAs()

		press(AUTHORIZE_COPY.anotherAccount)

		await landedOnLoginFor(router)
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
		await signInByCode()
		await heading(AUTHORIZE_COPY.approveTitle)
		expect(router.state.location.href).toBe(AUTHORIZE_PATH)
	})
})

describe("the authorization page", () => {
	it("shows the device and platform the relay answers, Sign in and Cancel", async () => {
		await openApproval()

		expect(screen.getByText(DEVICE_NAME)).toBeTruthy()
		expect(screen.getByText(DEVICE_CAPTION)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.approve)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.cancel)).toBeTruthy()
		expectBearerWithoutCredentials(READ_REQUEST)
		expectNoAppLink()
	})

	it("approves with the site bearer, lands on /authorize/done and signs this browser out", async () => {
		const assign = vi.spyOn(window.location, "assign")
		const router = await openApproval()
		routes[READ_REQUEST] = requestWith("approved")

		press(AUTHORIZE_COPY.approve)

		await landedOn(router, "/authorize/done")
		await heading(AUTHORIZE_COPY.doneTitle)
		expect(router.state.location.search).toEqual({ request: REQUEST_ID })
		expect(
			screen.getByText(AUTHORIZE_COPY.doneLead(DEVICE_NAME, EMAIL)),
		).toBeTruthy()
		expectBearerWithoutCredentials(APPROVE)
		await waitFor(expectBrowserSignedOut)
		expect(calls.map((call) => call.route).slice(-1)).toEqual([SIGN_OUT])
		expect(screen.queryByRole("alert")).toBeNull()
		expect(assign).not.toHaveBeenCalled()
		expectNoAppLink()
	})

	it("signs this browser out after a sign-in on /login too", async () => {
		const router = renderSite(AUTHORIZE_PATH)
		await landedOnLoginFor(router)
		await signInByCode()
		await heading(AUTHORIZE_COPY.approveTitle)
		routes[READ_REQUEST] = requestWith("approved")

		press(AUTHORIZE_COPY.approve)

		await heading(AUTHORIZE_COPY.doneTitle)
		await waitFor(expectBrowserSignedOut)
	})

	it("tells how long ago the request was made, without the word asked", async () => {
		routes[READ_REQUEST] = requestWith("pending", Date.now() - 3 * DAY_MS)
		await openApproval()

		expect(screen.getByText("Kiroshi for Mac · 3 days ago")).toBeTruthy()
	})

	it("cancels the request and shows the cancelled card on the same URL", async () => {
		const router = await openApproval()

		press(AUTHORIZE_COPY.cancel)

		await expectCancelledCard()
		expect(callsTo(CANCEL)).toHaveLength(1)
		expectBearerWithoutCredentials(CANCEL)
		expect(callsTo(APPROVE)).toHaveLength(0)
		expect(callsTo(SIGN_OUT)).toHaveLength(0)
		expect(router.state.location.href).toBe(AUTHORIZE_PATH)
	})

	it.each([
		[AUTHORIZE_COPY.approve, APPROVE],
		[AUTHORIZE_COPY.cancel, CANCEL],
	])(
		"keeps Sign in and Cancel disabled while %s is in flight",
		async (label, route) => {
			let settle: (reply: Reply) => void = () => undefined
			routes[route] = new Promise<Reply>((resolve) => {
				settle = resolve
			})
			await openApproval()

			press(label)

			await waitFor(() =>
				expect(button(AUTHORIZE_COPY.approve).hasAttribute("disabled")).toBe(
					true,
				),
			)
			expect(button(AUTHORIZE_COPY.cancel).hasAttribute("disabled")).toBe(true)
			settle({ body: {} })
		},
	)
})

describe("the cancelled card", () => {
	it("shows when the request is cancelled", async () => {
		routes[READ_REQUEST] = requestWith("cancelled")
		signedIn()
		renderSite(AUTHORIZE_PATH)

		await expectCancelledCard()
		expectNoAppLink()
	})
})

describe("the done page", () => {
	const openDone = async () => {
		routes[READ_REQUEST] = requestWith("approved")
		signedIn()
		const router = renderSite(DONE_PATH)
		await heading(AUTHORIZE_COPY.doneTitle)
		return router
	}

	it("reads an approved request from the relay on a fresh load", async () => {
		await openDone()

		expect(
			screen.getByText(AUTHORIZE_COPY.doneLead(DEVICE_NAME, EMAIL)),
		).toBeTruthy()
		expectBearerWithoutCredentials(READ_REQUEST)
	})

	it("says the computer is signed in and the tab can be closed, without the word Mac", async () => {
		await openDone()

		const lead = AUTHORIZE_COPY.doneLead("the computer", EMAIL)
		expect(AUTHORIZE_COPY.doneTitle).toBe("Your computer is signed in")
		expect(lead).toContain(EMAIL)
		expect(lead).toContain("You can close this tab")
		for (const copy of [
			AUTHORIZE_COPY.doneTitle,
			lead,
			AUTHORIZE_COPY.browserStillSignedIn,
		]) {
			expect(copy).not.toMatch(/\bMac\b|'/)
		}
	})

	it("signs this browser out once the request and the account are read", async () => {
		await openDone()

		await waitFor(expectBrowserSignedOut)
		expect(calls.map((call) => call.route).slice(-1)).toEqual([SIGN_OUT])
		expect(screen.queryByRole("alert")).toBeNull()
	})

	it("makes no relay call with the old bearer once this browser is signed out", async () => {
		const router = await openDone()
		await waitFor(expectBrowserSignedOut)

		await router.navigate({ to: "/account" })

		await landedOn(router, "/login")
		expectNoBearerAfterSignOut()
	})

	it("goes to /login when loaded again without the bearer", async () => {
		const router = await openDone()
		await router.navigate({ to: "/" })
		await landedOn(router, "/")

		router.history.back()

		await landedOn(router, "/login")
		expect(router.state.location.search).toEqual({ redirect: DONE_PATH })
		expect(callsTo(READ_REQUEST)).toHaveLength(1)
		expect(callsTo(SIGN_OUT)).toHaveLength(1)
	})

	it("treats a 401 on the sign-out as an ended session", async () => {
		routes[SIGN_OUT] = relayError(401, "UNAUTHENTICATED")
		const router = await openDone()

		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
		expect(router.state.location.pathname).toBe("/authorize/done")
		expect(
			screen.getByText(AUTHORIZE_COPY.doneLead(DEVICE_NAME, EMAIL)),
		).toBeTruthy()
		expect(screen.queryByRole("alert")).toBeNull()
	})

	it.each([
		["network", new TypeError("Failed to fetch")],
		["server", relayError(500, "INTERNAL")],
	])(
		"keeps the done page and the bearer on a %s failure of the sign-out, with a Retry that signs out only",
		async (_, reply) => {
			routes[SIGN_OUT] = reply
			await openDone()

			expect((await screen.findByRole("alert")).textContent).toBe(
				AUTHORIZE_COPY.browserStillSignedIn,
			)
			expect(
				screen.getByText(AUTHORIZE_COPY.doneLead(DEVICE_NAME, EMAIL)),
			).toBeTruthy()
			expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
			const routesBeforeRetry = calls.map((call) => call.route)
			routes = relayRoutes()

			press(RETRY_LABEL)

			await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
			expect(calls.map((call) => call.route)).toEqual([
				...routesBeforeRetry,
				SIGN_OUT,
			])
			expect(localStorage.getItem(BEARER_KEY)).toBeNull()
			await heading(AUTHORIZE_COPY.doneTitle)
		},
	)

	it("keeps the failure line when the Retry fails again", async () => {
		routes[SIGN_OUT] = relayError(503, "UNAVAILABLE")
		await openDone()
		await screen.findByRole("alert")

		press(RETRY_LABEL)

		await waitFor(() => expect(callsTo(SIGN_OUT)).toHaveLength(2))
		await screen.findByRole("alert")
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
	})

	it("shows the expired page without a request, without asking the relay", async () => {
		signedIn()
		renderSite("/authorize/done")

		await heading(AUTHORIZE_COPY.expiredTitle)
		expect(callsTo(READ_REQUEST)).toHaveLength(0)
	})

	it("shows the expired page for an unknown request", async () => {
		routes[READ_REQUEST] = relayError(404, "NOT_FOUND")
		signedIn()
		renderSite(DONE_PATH)

		await heading(AUTHORIZE_COPY.expiredTitle)
	})

	it.each(["pending", "cancelled", "expired"])(
		"shows the expired page for a %s request",
		async (status) => {
			routes[READ_REQUEST] = requestWith(status)
			signedIn()
			renderSite(DONE_PATH)

			await heading(AUTHORIZE_COPY.expiredTitle)
			expect(callsTo(SIGN_OUT)).toHaveLength(0)
			expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		},
	)
})

describe("the expired page", () => {
	it.each([
		["the request param is missing", "/authorize"],
		["the request param is not a uuid", "/authorize?request=not-a-uuid"],
	])("shows when %s, without asking the relay", async (_, path) => {
		signedIn()
		renderSite(path)

		await heading(AUTHORIZE_COPY.expiredTitle)
		expect(callsTo(READ_REQUEST)).toHaveLength(0)
		expectNoAppLink()
	})

	it("shows when the relay answers 404 for the request", async () => {
		routes[READ_REQUEST] = relayError(404, "NOT_FOUND")
		signedIn()
		renderSite(AUTHORIZE_PATH)

		await heading(AUTHORIZE_COPY.expiredTitle)
	})

	it.each(["approved", "expired"])(
		"shows when the request is %s",
		async (status) => {
			routes[READ_REQUEST] = requestWith(status)
			signedIn()
			renderSite(AUTHORIZE_PATH)

			await heading(AUTHORIZE_COPY.expiredTitle)
		},
	)

	it.each([
		[AUTHORIZE_COPY.approve, APPROVE, 409, "AUTHORIZATION_DECIDED"],
		[AUTHORIZE_COPY.approve, APPROVE, 410, "AUTHORIZATION_EXPIRED"],
		[AUTHORIZE_COPY.cancel, CANCEL, 409, "AUTHORIZATION_DECIDED"],
		[AUTHORIZE_COPY.cancel, CANCEL, 410, "AUTHORIZATION_EXPIRED"],
	])("shows when %s answers %i", async (label, route, status, code) => {
		routes[route] = relayError(status, code)
		const router = await openApproval()

		press(label)

		await heading(AUTHORIZE_COPY.expiredTitle)
		expect(router.state.location.pathname).toBe("/authorize")
		expect(callsTo(SIGN_OUT)).toHaveLength(0)
	})
})

describe("a 401 from the relay", () => {
	it("on reading the request clears the bearer and goes through /login", async () => {
		routes[READ_REQUEST] = relayError(401, "UNAUTHENTICATED")
		signedIn()
		const router = renderSite(AUTHORIZE_PATH)

		await landedOnLoginFor(router)
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
	})

	it.each([
		[AUTHORIZE_COPY.approve, APPROVE],
		[AUTHORIZE_COPY.cancel, CANCEL],
	])(
		"on %s clears the bearer and comes back to the request",
		async (label, route) => {
			routes[route] = relayError(401, "UNAUTHENTICATED")
			const router = await openApproval()

			press(label)

			await landedOnLoginFor(router)
			expect(localStorage.getItem(BEARER_KEY)).toBeNull()
			routes = relayRoutes()
			await signInByCode()
			await heading(AUTHORIZE_COPY.approveTitle)
		},
	)
})

describe("a network or server failure", () => {
	it.each([
		["network", new TypeError("Failed to fetch")],
		["server", relayError(500, "INTERNAL")],
	])(
		"on reading the request shows FailureLine with a working Retry (%s)",
		async (_, reply) => {
			routes[READ_REQUEST] = reply
			signedIn()
			renderSite(AUTHORIZE_PATH)

			await screen.findByRole("alert")
			routes[READ_REQUEST] = requestWith("pending")
			press(RETRY_LABEL)

			await heading(AUTHORIZE_COPY.continueAsTitle)
		},
	)

	it.each([
		[AUTHORIZE_COPY.approve, APPROVE, new TypeError("Failed to fetch")],
		[AUTHORIZE_COPY.cancel, CANCEL, relayError(503, "UNAVAILABLE")],
	])(
		"on %s shows FailureLine with a Retry that sends it again",
		async (label, route, reply) => {
			routes[route] = reply
			await openApproval()

			press(label)

			await screen.findByRole("alert")
			expect(button(AUTHORIZE_COPY.approve).hasAttribute("disabled")).toBe(
				false,
			)
			routes = relayRoutes()
			press(RETRY_LABEL)

			await waitFor(() => expect(callsTo(route)).toHaveLength(2))
		},
	)
})
