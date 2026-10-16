import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import {
	cleanup,
	fireEvent,
	getDefaultNormalizer,
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
const OLDER_BEARER = "bearer-of-an-older-session"
const BEARER_KEY = "kiroshi.relay.bearer"
const CODE_SENT_LINE = LOGIN_COPY.codeLead(EMAIL)
const KEEP_SPACES = getDefaultNormalizer({ collapseWhitespace: false })
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const ME = "GET /me"
const SAVE_NAME = "PATCH /me"
const RETIRED_NAME_ROUTES = [
	"GET /api/auth/get-session",
	"POST /api/auth/update-user",
]
const SOCIAL_SIGN_IN = "POST /api/auth/sign-in/social"
const GET_SESSION = "GET /api/auth/get-session"
const RETRY_LABEL = "Retry"

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error>

type RelayCall = {
	route: string
	body: unknown
	authorization: string | null
	credentials: RequestCredentials | undefined
}

const relayError = (status: number, message: string): Reply => ({
	status,
	body: { error: { code: "UNAUTHENTICATED", message } },
})

const namedAccount = (name: string | null): RelayRoutes => ({
	[SEND_CODE]: { body: { status: true, expiresAt: "2026-10-12T10:00:00Z" } },
	[SIGN_IN]: { body: { token: BEARER, user: { email: EMAIL } } },
	[ME]: { body: { email: EMAIL, name } },
	[SAVE_NAME]: { body: { email: EMAIL, name: "Ada Lovelace" } },
})

let routes: RelayRoutes = {}
let calls: RelayCall[] = []

const answer = async (input: URL | string, init?: RequestInit) => {
	const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`
	calls.push({
		route,
		body: init?.body ? JSON.parse(String(init.body)) : undefined,
		authorization: new Headers(init?.headers).get("Authorization"),
		credentials: init?.credentials,
	})
	const reply = routes[route]
	if (!reply) throw new Error(`The fake relay has no ${route}`)
	if (reply instanceof Error) throw reply
	const body = "body" in reply ? reply.body : {}
	return Response.json(body, { status: reply.status ?? 200 })
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

const reachNameStep = async () => {
	await reachCodeStep()
	enterCode("123456")
	await screen.findByRole("heading", { name: LOGIN_COPY.nameTitle })
}

const codeLead = () =>
	screen.getByText(CODE_SENT_LINE, { normalizer: KEEP_SPACES })

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
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	localStorage.clear()
})

describe("the sign-in page", () => {
	it("offers the email and its Continue, then Google and Apple, in that order", async () => {
		await openLogin()

		const buttons = screen
			.getAllByRole("button")
			.map((button) => button.textContent)
		expect(buttons).toEqual([
			LOGIN_COPY.emailSubmit,
			LOGIN_COPY.continueWithGoogle,
			LOGIN_COPY.continueWithApple,
		])
		expect(screen.getByLabelText(LOGIN_COPY.emailLabel)).toBeTruthy()
	})

	it("asks the relay for a code and shows the email on the code step", async () => {
		await openLogin()

		await reachCodeStep()

		expect(callsTo(SEND_CODE)[0]?.body).toEqual({ email: EMAIL })
		expect(codeLead().textContent).toContain("It\u00a0works")
	})

	it("verifies six digits without a submit press, keeps the bearer and lands on the redirect", async () => {
		const router = await openLogin("/login?redirect=%2Fauthorize")
		await reachCodeStep()

		enterCode("12 34 56")

		await landedOn(router, "/authorize")
		expect(callsTo(SIGN_IN)[0]?.body).toEqual({ email: EMAIL, otp: "123456" })
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expectBearerWithoutCredentials(ME)
	})

	it("draws each digit in its own cell over a one-time-code input", async () => {
		await openLogin()
		await reachCodeStep()

		enterCode("481")

		for (const digit of ["4", "8", "1"]) {
			expect(screen.getByText(digit)).toBeTruthy()
		}
		expect(codeEntry().autocomplete).toBe("one-time-code")
		expect(codeEntry().inputMode).toBe("numeric")
	})

	it("goes back to the email, kept, on Use another email", async () => {
		await openLogin()
		await reachCodeStep()

		fireEvent.click(
			screen.getByRole("button", { name: LOGIN_COPY.anotherEmail }),
		)

		await screen.findByRole("heading", { name: LOGIN_COPY.signInTitle })
		expect(
			screen.getByLabelText<HTMLInputElement>(LOGIN_COPY.emailLabel).value,
		).toBe(EMAIL)
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
		expect(codeLead()).toBeTruthy()
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
		fireEvent.click(screen.getByRole("button", { name: RETRY_LABEL }))
		await screen.findByRole("heading", { name: LOGIN_COPY.codeTitle })
	})

	it("shows a relay 5xx with a retry and keeps the email", async () => {
		routes[SIGN_IN] = relayError(503, "The relay is down")
		await openLogin()
		await reachCodeStep()

		enterCode("123456")

		await screen.findByText(LOGIN_COPY.failures.server)
		expect(screen.getByRole("button", { name: RETRY_LABEL })).toBeTruthy()
		expect(codeLead()).toBeTruthy()
	})

	it.each([null, ""])(
		"asks the name when /me answers %j, saves it, then lands on /account",
		async (name) => {
			routes = namedAccount(name)
			const router = await openLogin()
			await reachNameStep()
			fireEvent.change(screen.getByLabelText(LOGIN_COPY.nameLabel), {
				target: { value: "  Ada Lovelace " },
			})
			fireEvent.click(
				screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }),
			)

			await landedOn(router, "/account")
			expect(callsTo(SAVE_NAME)[0]?.body).toEqual({ name: "Ada Lovelace" })
			expectBearerWithoutCredentials(SAVE_NAME)
			for (const route of RETIRED_NAME_ROUTES) {
				expect(callsTo(route)).toHaveLength(0)
			}
		},
	)

	it("refuses an empty name without calling the relay", async () => {
		routes = namedAccount("")
		await openLogin()
		await reachNameStep()

		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }))

		expect(await screen.findByText(LOGIN_COPY.nameMissing)).toBeTruthy()
		expect(callsTo(SAVE_NAME)).toHaveLength(0)
	})

	it("refuses a name over 80 characters without calling the relay", async () => {
		routes = namedAccount(null)
		await openLogin()
		await reachNameStep()

		fireEvent.change(screen.getByLabelText(LOGIN_COPY.nameLabel), {
			target: { value: ` ${"a".repeat(81)} ` },
		})
		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }))

		expect(await screen.findByText(LOGIN_COPY.nameTooLong)).toBeTruthy()
		expect(callsTo(SAVE_NAME)).toHaveLength(0)
	})

	it("shows the unavailable failure when PATCH /me answers 404", async () => {
		routes = namedAccount(null)
		routes[SAVE_NAME] = relayError(404, "Not Found")
		await openLogin()
		await reachNameStep()

		fireEvent.change(screen.getByLabelText(LOGIN_COPY.nameLabel), {
			target: { value: "Ada Lovelace" },
		})
		fireEvent.click(screen.getByRole("button", { name: LOGIN_COPY.nameSubmit }))

		await screen.findByText(LOGIN_COPY.failures.unavailable)
		expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull()
	})

	it("lands without a name step while /me answers without a name field", async () => {
		routes[ME] = { body: { email: EMAIL } }
		const router = await openLogin("/login?redirect=%2Fauthorize")
		await reachCodeStep()

		enterCode("123456")

		await landedOn(router, "/authorize")
		expect(
			screen.queryByRole("heading", { name: LOGIN_COPY.nameTitle }),
		).toBeNull()
		expect(screen.queryByRole("alert")).toBeNull()
	})

	it("says Google isn't set up yet on a 404, with no retry", async () => {
		routes[SOCIAL_SIGN_IN] = relayError(404, "Not Found")
		await openLogin()

		fireEvent.click(
			screen.getByRole("button", { name: LOGIN_COPY.continueWithGoogle }),
		)

		await screen.findByText(LOGIN_COPY.failures["google-unavailable"])
		expect(screen.queryByText(LOGIN_COPY.failures.unavailable)).toBeNull()
		expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull()
		expect(
			screen.getByRole("button", { name: LOGIN_COPY.continueWithGoogle }),
		).toHaveProperty("disabled", false)
		expect(callsTo(SOCIAL_SIGN_IN)[0]?.body).toMatchObject({
			provider: "google",
		})
	})

	it("shows the server failure and logs an error that is not the relay's", async () => {
		await openLogin()
		await reachCodeStep()
		const refusal = new Error("The storage is full")
		vi.stubGlobal("localStorage", {
			getItem: () => null,
			setItem: () => {
				throw refusal
			},
		})
		const logError = vi.spyOn(console, "error").mockImplementation(() => {})

		enterCode("123456")

		await screen.findByText(LOGIN_COPY.failures.server)
		expect(logError).toHaveBeenCalledWith(refusal)
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
})

describe("the social sign-in", () => {
	const pressSocial = (label: string) => {
		vi.spyOn(window.location, "assign").mockImplementation(() => {})
		fireEvent.click(screen.getByRole("button", { name: label }))
	}

	const startBody = () =>
		waitFor(() => {
			const body = callsTo(SOCIAL_SIGN_IN)[0]?.body
			expect(body).toBeDefined()
			return body as Record<string, string>
		})

	it("posts the provider and both callbacks on this origin, carrying the redirect", async () => {
		routes[SOCIAL_SIGN_IN] = { body: { url: "https://accounts.google.com/o" } }
		await openLogin("/login?redirect=%2Fauthorize")

		pressSocial(LOGIN_COPY.continueWithGoogle)

		const { provider, callbackURL, errorCallbackURL } = await startBody()
		const callback = new URL(callbackURL ?? "")
		const errorCallback = new URL(errorCallbackURL ?? "")
		expect(provider).toBe("google")
		expect(callback.origin).toBe(window.location.origin)
		expect(callback.pathname).toBe("/login")
		expect(callback.searchParams.get("redirect")).toBe("/authorize")
		expect(callback.searchParams.get("via")).toBe("social")
		expect(errorCallback.origin).toBe(window.location.origin)
		expect(errorCallback.pathname).toBe("/login")
		expect(errorCallback.searchParams.get("redirect")).toBe("/authorize")
		expect(errorCallback.searchParams.has("via")).toBe(false)
		expect(callsTo(SOCIAL_SIGN_IN)[0]?.credentials).toBe("include")
		await waitFor(() =>
			expect(window.location.assign).toHaveBeenCalledWith(
				"https://accounts.google.com/o",
			),
		)
	})

	it("says Apple isn't set up yet on a 404, with no retry", async () => {
		routes[SOCIAL_SIGN_IN] = relayError(
			404,
			"Sign-in with apple is not configured",
		)
		await openLogin()

		pressSocial(LOGIN_COPY.continueWithApple)

		await screen.findByText(LOGIN_COPY.failures["apple-unavailable"])
		expect(screen.queryByText(LOGIN_COPY.failures.unavailable)).toBeNull()
		expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull()
		expect(screen.getByLabelText(LOGIN_COPY.emailLabel)).toBeDefined()
	})

	it("keeps the session bearer read with credentials and lands on the redirect", async () => {
		routes[GET_SESSION] = { body: { token: BEARER, user: { email: EMAIL } } }
		const router = renderSite("/login?via=social&redirect=%2F")

		await landedOn(router, "/")
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expect(callsTo(GET_SESSION)[0]?.credentials).toBe("include")
		expect(callsTo(GET_SESSION)[0]?.authorization).toBeNull()
	})

	it("reads get-session without the stored bearer and sends the returned one on the next /me", async () => {
		localStorage.setItem(BEARER_KEY, OLDER_BEARER)
		routes[GET_SESSION] = { body: { token: BEARER, user: { email: EMAIL } } }
		routes["GET /me/sessions"] = { body: { sessions: [] } }
		const router = renderSite("/login?via=social")

		await landedOn(router, "/account")
		await waitFor(() => expect(callsTo(ME).length).toBeGreaterThan(0))
		expect(callsTo(GET_SESSION)[0]?.authorization).toBeNull()
		expect(callsTo(GET_SESSION)[0]?.credentials).toBe("include")
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expectBearerWithoutCredentials(ME)
	})

	it("lands on /account after the return without a redirect", async () => {
		routes[GET_SESSION] = { body: { token: BEARER, user: { email: EMAIL } } }
		const router = renderSite("/login?via=social")

		await landedOn(router, "/account")
	})

	it("shows the signed-out login with the failed line when get-session answers 401", async () => {
		routes[GET_SESSION] = relayError(401, "Unauthenticated")
		await openLogin("/login?via=social")

		expect(screen.getByText(LOGIN_COPY.socialFailed)).toBeDefined()
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
	})

	it("shows the signed-out login with the failed line on the error callback", async () => {
		await openLogin("/login?error=access_denied")

		expect(screen.getByText(LOGIN_COPY.socialFailed)).toBeDefined()
		expect(screen.queryByText(LOGIN_COPY.failures.rejected)).toBeNull()
		expect(screen.getByLabelText(LOGIN_COPY.emailLabel)).toBeDefined()
		expect(callsTo(GET_SESSION)).toHaveLength(0)
	})

	it("ignores a token search param", async () => {
		await openLogin("/login?token=social-bearer")

		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
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
