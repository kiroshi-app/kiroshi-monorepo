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
const DEVICE_LINE = AUTHORIZE_COPY.device("Ada’s MacBook Pro", "macos")
const ME = "GET /me"
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const READ_REQUEST = `GET /authorization-requests/${REQUEST_ID}`
const APPROVE = `POST /authorization-requests/${REQUEST_ID}/approve`
const CANCEL = `POST /authorization-requests/${REQUEST_ID}/cancel`
const RETRY_LABEL = "Retry"

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error | Promise<Reply>>

type RelayCall = { route: string; authorization: string | null }

type Router = ReturnType<typeof createSiteRouter>

const relayError = (status: number, code: string): Reply => ({
	status,
	body: { error: { code, message: code, status } },
})

const requestWith = (status: string): Reply => ({
	body: {
		id: REQUEST_ID,
		deviceName: "Ada’s MacBook Pro",
		platform: "macos",
		requestedAt: "2026-10-12T10:00:00Z",
		expiresAt: "2026-10-12T10:10:00Z",
		status,
	},
})

const relayRoutes = (): RelayRoutes => ({
	[SEND_CODE]: { body: { status: true } },
	[SIGN_IN]: { body: { token: BEARER, user: { email: EMAIL } } },
	[ME]: { body: { email: EMAIL, name: NAME } },
	[READ_REQUEST]: requestWith("pending"),
	[APPROVE]: {
		body: {
			redirectURL: `http://127.0.0.1:4321/callback?request=${REQUEST_ID}`,
		},
	},
	[CANCEL]: { body: { status: "cancelled" } },
})

let routes: RelayRoutes = {}
let calls: RelayCall[] = []

const answer = async (input: URL | string, init?: RequestInit) => {
	const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`
	calls.push({
		route,
		authorization: new Headers(init?.headers).get("Authorization"),
	})
	const reply = await routes[route]
	if (!reply) throw new Error(`The fake relay has no ${route}`)
	if (reply instanceof Error) throw reply
	return Response.json(reply.body ?? {}, { status: reply.status ?? 200 })
}

const callsTo = (route: string) => calls.filter((call) => call.route === route)

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
	await heading(AUTHORIZE_COPY.continueAsTitle(NAME))
	return router
}

const openApproval = async () => {
	const router = await openContinueAs()
	press(AUTHORIZE_COPY.continueAs)
	await heading(AUTHORIZE_COPY.approveTitle)
	return router
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
		expect(screen.getByText(DEVICE_LINE)).toBeTruthy()
		expect(
			screen.queryByRole("heading", {
				name: AUTHORIZE_COPY.continueAsTitle(NAME),
			}),
		).toBeNull()
	})
})

describe("Continue as", () => {
	it("names the signed-in account with Continue and Use another account", async () => {
		await openContinueAs()

		expect(screen.getByText(AUTHORIZE_COPY.continueAsLead(EMAIL))).toBeTruthy()
		expect(button(AUTHORIZE_COPY.continueAs)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.anotherAccount)).toBeTruthy()
		expectNoAppLink()
	})

	it("names the account by its email while it has no name", async () => {
		routes[ME] = { body: { email: EMAIL, name: null } }
		signedIn()
		renderSite(AUTHORIZE_PATH)

		await heading(AUTHORIZE_COPY.continueAsTitle(EMAIL))
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

		expect(screen.getByText(DEVICE_LINE)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.approve)).toBeTruthy()
		expect(button(AUTHORIZE_COPY.cancel)).toBeTruthy()
		expect(callsTo(READ_REQUEST)[0]?.authorization).toBe(`Bearer ${BEARER}`)
		expectNoAppLink()
	})

	it("approves with the site bearer and lands on /authorize/done", async () => {
		const assign = vi.spyOn(window.location, "assign")
		const router = await openApproval()

		press(AUTHORIZE_COPY.approve)

		await landedOn(router, "/authorize/done")
		await heading(AUTHORIZE_COPY.doneTitle)
		expect(callsTo(APPROVE)[0]?.authorization).toBe(`Bearer ${BEARER}`)
		expect(assign).not.toHaveBeenCalled()
		expectNoAppLink()
	})

	it("cancels the request and shows the expired page", async () => {
		const router = await openApproval()

		press(AUTHORIZE_COPY.cancel)

		await heading(AUTHORIZE_COPY.expiredTitle)
		expect(callsTo(CANCEL)).toHaveLength(1)
		expect(callsTo(APPROVE)).toHaveLength(0)
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

	it.each(["approved", "cancelled", "expired"])(
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

			await heading(AUTHORIZE_COPY.continueAsTitle(NAME))
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
