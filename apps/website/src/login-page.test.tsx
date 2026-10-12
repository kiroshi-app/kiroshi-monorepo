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

import { LOGIN_COPY } from "./login-copy"
import { createSiteRouter } from "./router"

const EMAIL = "ada@example.com"
const BEARER = "bearer-from-the-relay"
const BEARER_KEY = "kiroshi.relay.bearer"
const CODE_SENT_LINE = `${LOGIN_COPY.codeSentTo} ${EMAIL}`
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const ME = "GET /me"
const SESSION = "GET /api/auth/get-session"
const SAVE_NAME = "POST /api/auth/update-user"

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error>

type RelayCall = { route: string; body: unknown; authorization: string | null }

const relayError = (status: number, message: string): Reply => ({
	status,
	body: { error: { code: "UNAUTHENTICATED", message } },
})

const namedAccount = (name: string): RelayRoutes => ({
	[SEND_CODE]: { body: { status: true, expiresAt: "2026-10-12T10:00:00Z" } },
	[SIGN_IN]: { body: { token: BEARER, user: { email: EMAIL } } },
	[ME]: { body: { email: EMAIL } },
	[SESSION]: { body: { user: { email: EMAIL, name } } },
	[SAVE_NAME]: { body: { status: true } },
})

let routes: RelayRoutes = {}
let calls: RelayCall[] = []

const answer = async (input: URL | string, init?: RequestInit) => {
	const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`
	calls.push({
		route,
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
		authorization: new Headers(init?.headers).get("Authorization"),
	})
	const reply = routes[route]
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

const openLogin = async (path = "/login") => {
	const router = renderSite(path)
	await screen.findByRole("heading", { name: LOGIN_COPY.signInTitle })
	return router
}

const submitEmail = () => {
	fireEvent.change(screen.getByLabelText(LOGIN_COPY.emailLabel), {
		target: { value: EMAIL },
	})
	fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.emailSubmit }))
}

const reachCodeStep = async () => {
	submitEmail()
	await screen.findByRole("heading", { name: LOGIN_COPY.codeTitle })
}

const codeEntry = () =>
	screen.getByLabelText<HTMLInputElement>(LOGIN_COPY.codeLabel)

const enterCode = (code: string) => {
	fireEvent.change(codeEntry(), { target: { value: code } })
}

const landedOn = (router: ReturnType<typeof renderSite>, pathname: string) =>
	waitFor(() => expect(router.state.location.pathname).toBe(pathname))

beforeEach(() => {
	routes = namedAccount("Ada")
	calls = []
	vi.stubGlobal("fetch", vi.fn(answer))
})

afterEach(() => {
	cleanup()
	localStorage.clear()
	vi.unstubAllGlobals()
})

describe("the sign-in page", () => {
	it("offers Google, Apple, then the email in that order", async () => {
		await openLogin()

		const buttons = screen
			.getAllByRole("button")
			.map((button) => button.textContent)
		expect(buttons).toEqual([
			LOGIN_COPY.continueWithGoogle,
			LOGIN_COPY.continueWithApple,
			LOGIN_COPY.emailSubmit,
		])
		expect(screen.getByLabelText(LOGIN_COPY.emailLabel)).toBeTruthy()
	})

	it("asks the relay for a code and shows the email on the code step", async () => {
		await openLogin()

		await reachCodeStep()

		expect(callsTo(SEND_CODE)[0]?.body).toEqual({ email: EMAIL })
		expect(screen.getByText(CODE_SENT_LINE)).toBeTruthy()
	})

	it("verifies six digits without a submit press, keeps the bearer and lands on the redirect", async () => {
		const router = await openLogin("/login?redirect=%2Fauthorize")
		await reachCodeStep()

		enterCode("12 34 56")

		await landedOn(router, "/authorize")
		expect(callsTo(SIGN_IN)[0]?.body).toEqual({ email: EMAIL, otp: "123456" })
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expect(callsTo(ME)[0]?.authorization).toBe(`Bearer ${BEARER}`)
	})

	it("waits for the sixth digit before verifying", async () => {
		await openLogin()
		await reachCodeStep()

		enterCode("12345")

		expect(codeEntry().value).toBe("12345")
		expect(callsTo(SIGN_IN)).toHaveLength(0)
	})

	it.each([
		"Code is wrong",
		"Code has expired",
		"Too many wrong codes, ask for a new one",
	])("shows %s under the entry and keeps the email", async (message) => {
		routes[SIGN_IN] = relayError(401, message)
		await openLogin()
		await reachCodeStep()

		enterCode("123456")

		expect(await screen.findByRole("alert")).toHaveProperty(
			"textContent",
			message,
		)
		expect(screen.getByText(CODE_SENT_LINE)).toBeTruthy()
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
	})

	it("sends a new code and clears the entry", async () => {
		routes[SIGN_IN] = relayError(401, "Code has expired")
		await openLogin()
		await reachCodeStep()
		enterCode("123456")
		await screen.findByText("Code has expired")

		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.newCode }))

		await waitFor(() => expect(callsTo(SEND_CODE)).toHaveLength(2))
		expect(codeEntry().value).toBe("")
		await waitFor(() =>
			expect(screen.queryByText("Code has expired")).toBeNull(),
		)
	})

	it("shows the network failure with a retry and never leaves the page busy", async () => {
		routes[SEND_CODE] = new TypeError("Failed to fetch")
		await openLogin()

		submitEmail()

		await screen.findByText(LOGIN_COPY.failures.network)
		expect(
			screen.getByRole("button", { name: LOGIN_COPY.emailSubmit }),
		).toHaveProperty("disabled", false)
		routes = namedAccount("Ada")
		fireEvent.click(screen.getByRole("button", { name: "Retry" }))
		await screen.findByRole("heading", { name: LOGIN_COPY.codeTitle })
	})

	it("shows a relay 5xx with a retry and keeps the email", async () => {
		routes[SIGN_IN] = relayError(503, "The relay is down")
		await openLogin()
		await reachCodeStep()

		enterCode("123456")

		await screen.findByText(LOGIN_COPY.failures.server)
		expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
		expect(screen.getByText(CODE_SENT_LINE)).toBeTruthy()
	})

	it("asks the name the first time, saves it, then lands on /account", async () => {
		routes = namedAccount("")
		const router = await openLogin()
		await reachCodeStep()

		enterCode("123456")
		await screen.findByRole("heading", { name: LOGIN_COPY.nameTitle })
		fireEvent.change(screen.getByLabelText(LOGIN_COPY.nameLabel), {
			target: { value: "  Ada Lovelace " },
		})
		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }))

		await landedOn(router, "/account")
		expect(callsTo(SAVE_NAME)[0]?.body).toEqual({ name: "Ada Lovelace" })
	})

	it("refuses an empty name without calling the relay", async () => {
		routes = namedAccount("")
		await openLogin()
		await reachCodeStep()
		enterCode("123456")
		await screen.findByRole("heading", { name: LOGIN_COPY.nameTitle })

		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }))

		expect(await screen.findByText(LOGIN_COPY.nameMissing)).toBeTruthy()
		expect(callsTo(SAVE_NAME)).toHaveLength(0)
	})

	it("skips the name step when the account has one", async () => {
		const router = await openLogin()
		await reachCodeStep()

		enterCode("123456")

		await landedOn(router, "/account")
		expect(
			screen.queryByRole("heading", { name: LOGIN_COPY.nameTitle }),
		).toBeNull()
	})

	it("drops an absolute redirect and lands on /account", async () => {
		const router = await openLogin(
			"/login?redirect=https%3A%2F%2Fevil.example%2Faccount",
		)
		await reachCodeStep()

		enterCode("123456")

		await landedOn(router, "/account")
	})

	it("keeps a bearer sent back as a token and carries on", async () => {
		const router = renderSite("/login?token=social-bearer")

		await landedOn(router, "/account")
		expect(localStorage.getItem(BEARER_KEY)).toBe("social-bearer")
	})
})

describe("the placeholder routes", () => {
	it.each(["/account", "/authorize"])(
		"send a signed-out visit of %s to /login with the return target",
		async (path) => {
			const router = renderSite(path)

			await landedOn(router, "/login")
			expect(router.state.location.search).toEqual({ redirect: path })
		},
	)
})
