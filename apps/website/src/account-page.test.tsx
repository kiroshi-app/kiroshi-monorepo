import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { ACCOUNT_COPY } from "./account-copy"
import { LOGIN_COPY } from "./login-copy"
import { createSiteRouter } from "./router"

const EMAIL = "ada@example.com"
const NAME = "Ada Lovelace"
const BEARER = "bearer-of-the-site"
const BEARER_KEY = "kiroshi.relay.bearer"
const ACCOUNT_PATH = "/account"
const HOUR_MS = 3_600_000
const MAC = "Ada’s MacBook Pro"
const IPHONE = "Ada’s iPhone"
const ME = "GET /me"
const SESSIONS = "GET /me/sessions"
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const SIGN_OUT_EVERYWHERE = "DELETE /me/sessions"
const SIGN_OUT_SITE = "POST /api/auth/sign-out"
const RETRY_LABEL = "Retry"

const signOutOf = (id: string) => `DELETE /me/sessions/${id}`

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error | Promise<Reply>>

type RelayCall = { route: string; authorization: string | null }

type Router = ReturnType<typeof createSiteRouter>

const NO_CONTENT: Reply = { status: 204 }

const relayError = (status: number, code: string): Reply => ({
	status,
	body: { error: { code, message: code, status } },
})

type SessionFixture = {
	id: string
	deviceName: string | null
	platform: string | null
	lastSeenAgo: number
	current: boolean
}

const sessionBody = ({ lastSeenAgo, ...session }: SessionFixture) => ({
	...session,
	createdAt: new Date(Date.now() - 30 * 24 * HOUR_MS).toISOString(),
	lastSeenAt: new Date(Date.now() - lastSeenAgo).toISOString(),
})

const SESSION_FIXTURES: SessionFixture[] = [
	{
		id: "browser",
		deviceName: null,
		platform: null,
		lastSeenAgo: 0,
		current: true,
	},
	{
		id: "mac",
		deviceName: MAC,
		platform: "macos",
		lastSeenAgo: 2 * HOUR_MS,
		current: false,
	},
	{
		id: "iphone",
		deviceName: IPHONE,
		platform: "ios",
		lastSeenAgo: 3 * 24 * HOUR_MS,
		current: false,
	},
]

const relayRoutes = (): RelayRoutes => ({
	[SEND_CODE]: { body: { status: true } },
	[SIGN_IN]: { body: { token: BEARER, user: { email: EMAIL } } },
	[ME]: { body: { email: EMAIL, name: NAME, plan: "pro" } },
	[SESSIONS]: { body: { sessions: SESSION_FIXTURES.map(sessionBody) } },
	[signOutOf("mac")]: NO_CONTENT,
	[signOutOf("iphone")]: NO_CONTENT,
	[signOutOf("browser")]: NO_CONTENT,
	[SIGN_OUT_EVERYWHERE]: NO_CONTENT,
	[SIGN_OUT_SITE]: { body: { success: true } },
})

let routes: RelayRoutes = {}
let calls: RelayCall[] = []

const responseOf = ({ status = 200, body }: Reply) =>
	status === 204
		? new Response(null, { status })
		: Response.json(body ?? {}, { status })

const answer = async (input: URL | string, init?: RequestInit) => {
	const route = `${init?.method ?? "GET"} ${new URL(input).pathname}`
	calls.push({
		route,
		authorization: new Headers(init?.headers).get("Authorization"),
	})
	const reply = await routes[route]
	if (!reply) throw new Error(`The fake relay has no ${route}`)
	if (reply instanceof Error) throw reply
	return responseOf(reply)
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
	expect(router.state.location.search).toEqual({ redirect: ACCOUNT_PATH })
	await heading(LOGIN_COPY.signInTitle)
}

const leftSignedOut = async (router: Router) => {
	await landedOn(router, "/login")
	await heading(LOGIN_COPY.signInTitle)
	expect(localStorage.getItem(BEARER_KEY)).toBeNull()
}

const openAccount = async () => {
	signedIn()
	const router = renderSite(ACCOUNT_PATH)
	await heading(ACCOUNT_COPY.title)
	return router
}

const rows = () => screen.getAllByRole("listitem", { hidden: true })

const rowNames = () =>
	rows().map((row) => within(row).getAllByRole("paragraph")[0]?.textContent)

const rowOf = (name: string) => {
	const row = rows().find((item) => within(item).queryAllByText(name).length)
	if (!row) throw new Error(`No session row named ${name}`)
	return row
}

const rowSignOut = (name: string) => `${ACCOUNT_COPY.signOut} ${name}`

const confirmation = () => screen.findByRole("alertdialog")

const triggerOf = (name: string) =>
	screen
		.getAllByRole("button", { name, hidden: true })
		.find((control) => !control.closest("[role=alertdialog]"))

const expectPending = async (name: string) => {
	await waitFor(() =>
		expect(triggerOf(name)?.hasAttribute("disabled")).toBe(true),
	)
	const dialog = await confirmation()
	expect(
		within(dialog)
			.getByRole("button", { name: ACCOUNT_COPY.signOut })
			.hasAttribute("disabled"),
	).toBe(true)
}

const confirm = async () => {
	const dialog = await confirmation()
	fireEvent.click(
		within(dialog).getByRole("button", { name: ACCOUNT_COPY.signOut }),
	)
}

const pressAndConfirm = async (name: string) => {
	press(name)
	await confirm()
}

const deferredReply = () => {
	let resolve: (reply: Reply) => void = () => undefined
	const promise = new Promise<Reply>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
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
})

describe("the account page, signed out", () => {
	it("goes through /login and comes back to /account after the sign-in", async () => {
		const router = renderSite(ACCOUNT_PATH)

		await landedOnLoginFor(router)
		fireEvent.change(screen.getByLabelText(LOGIN_COPY.emailLabel), {
			target: { value: EMAIL },
		})
		press(LOGIN_COPY.emailSubmit)
		await heading(LOGIN_COPY.codeTitle)
		fireEvent.change(screen.getByLabelText(LOGIN_COPY.codeLabel), {
			target: { value: "123456" },
		})

		await heading(ACCOUNT_COPY.title)
		expect(router.state.location.pathname).toBe(ACCOUNT_PATH)
		expect(callsTo(ME)[0]?.authorization).toBe(`Bearer ${BEARER}`)
	})

	it.each([ME, SESSIONS])(
		"clears the bearer and goes through /login when %s answers 401",
		async (route) => {
			routes[route] = relayError(401, "UNAUTHENTICATED")
			signedIn()
			const router = renderSite(ACCOUNT_PATH)

			await landedOnLoginFor(router)
			expect(localStorage.getItem(BEARER_KEY)).toBeNull()
		},
	)
})

describe("the account", () => {
	it("shows the name and the email of the account", async () => {
		await openAccount()

		expect(screen.getByText(NAME)).toBeTruthy()
		expect(screen.getByText(EMAIL)).toBeTruthy()
	})

	it("shows Pro with its price and Free during the beta", async () => {
		await openAccount()

		expect(screen.getByText(ACCOUNT_COPY.plans.pro.name)).toBeTruthy()
		expect(screen.getByText(ACCOUNT_COPY.plans.pro.price)).toBeTruthy()
		expect(screen.getByText("Free during the beta")).toBeTruthy()
	})

	it("shows the free plan without the beta tag", async () => {
		routes[ME] = { body: { email: EMAIL, name: NAME, plan: "free" } }
		await openAccount()

		expect(screen.getByText(ACCOUNT_COPY.plans.free.name)).toBeTruthy()
		expect(screen.queryByText("Free during the beta")).toBeNull()
	})
})

describe("the signed-in devices", () => {
	it("lists one row per session in the order the relay answers", async () => {
		await openAccount()

		expect(rowNames()).toEqual([ACCOUNT_COPY.unknownDevice, MAC, IPHONE])
	})

	it("names each row with its platform and last seen time", async () => {
		await openAccount()

		expect(
			within(rowOf(MAC)).getByText("Kiroshi for Mac · 2 hours ago"),
		).toBeTruthy()
		expect(
			within(rowOf(IPHONE)).getByText("Kiroshi for iPhone · 3 days ago"),
		).toBeTruthy()
	})

	it("names a session without a device name Unknown device", async () => {
		await openAccount()

		expect(
			within(rowOf(ACCOUNT_COPY.unknownDevice)).getByText("now"),
		).toBeTruthy()
	})

	it("flags the current session as this device, and only it", async () => {
		await openAccount()

		expect(screen.getAllByText(ACCOUNT_COPY.thisDevice)).toHaveLength(1)
		expect(
			within(rowOf(ACCOUNT_COPY.unknownDevice)).getByText(
				ACCOUNT_COPY.thisDevice,
			),
		).toBeTruthy()
	})
})

describe("the confirmation", () => {
	it.each([
		[rowSignOut(MAC), ACCOUNT_COPY.signOutDeviceTitle(MAC)],
		[
			rowSignOut(ACCOUNT_COPY.unknownDevice),
			ACCOUNT_COPY.signOutThisDeviceTitle,
		],
		[ACCOUNT_COPY.signOutEverywhere, ACCOUNT_COPY.signOutEverywhereTitle],
		[ACCOUNT_COPY.signOut, ACCOUNT_COPY.signOutSiteTitle],
	])("asks before %s and sends nothing on Cancel", async (label, title) => {
		await openAccount()
		const callsBefore = calls.length

		press(label)

		const dialog = await confirmation()
		expect(within(dialog).getByRole("heading", { name: title })).toBeTruthy()
		expect(dialog.textContent).not.toMatch(/can’t be undone|can't be undone/)
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
		expect(calls).toHaveLength(callsBefore)
	})
})

describe("Sign out on a row", () => {
	it("removes the row only after the relay answers", async () => {
		const reply = deferredReply()
		routes[signOutOf("mac")] = reply.promise
		await openAccount()

		await pressAndConfirm(rowSignOut(MAC))

		await waitFor(() => expect(callsTo(signOutOf("mac"))).toHaveLength(1))
		expect(callsTo(signOutOf("mac"))[0]?.authorization).toBe(`Bearer ${BEARER}`)
		expect(rowOf(MAC)).toBeTruthy()
		reply.resolve(NO_CONTENT)
		await waitFor(() => expect(screen.queryByText(MAC)).toBeNull())
		expect(rowNames()).toEqual([ACCOUNT_COPY.unknownDevice, IPHONE])
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
	})

	it("disables the row's Sign out while the call is pending", async () => {
		routes[signOutOf("mac")] = deferredReply().promise
		await openAccount()

		await pressAndConfirm(rowSignOut(MAC))

		await expectPending(rowSignOut(MAC))
		expect(triggerOf(rowSignOut(IPHONE))?.hasAttribute("disabled")).toBe(false)
		expect(
			triggerOf(ACCOUNT_COPY.signOutEverywhere)?.hasAttribute("disabled"),
		).toBe(false)
	})

	it("removes the row when the relay answers 404", async () => {
		routes[signOutOf("mac")] = relayError(404, "NOT_FOUND")
		await openAccount()

		await pressAndConfirm(rowSignOut(MAC))

		await waitFor(() => expect(screen.queryByText(MAC)).toBeNull())
		expect(screen.queryByRole("alert")).toBeNull()
	})

	it.each([
		["network" as const, new TypeError("Failed to fetch")],
		["server" as const, relayError(500, "INTERNAL")],
	])(
		"keeps the row and shows what failed with a Retry (%s)",
		async (failureName, failure) => {
			routes[signOutOf("mac")] = failure
			await openAccount()

			await pressAndConfirm(rowSignOut(MAC))

			const alert = await within(rowOf(MAC)).findByRole("alert")
			expect(alert.textContent).toBe(LOGIN_COPY.failures[failureName])
			routes[signOutOf("mac")] = NO_CONTENT
			fireEvent.click(
				within(rowOf(MAC)).getByRole("button", { name: RETRY_LABEL }),
			)
			await waitFor(() => expect(screen.queryByText(MAC)).toBeNull())
			expect(callsTo(signOutOf("mac"))).toHaveLength(2)
		},
	)

	it("on the current row clears the bearer and leaves the site signed out", async () => {
		const router = await openAccount()

		await pressAndConfirm(rowSignOut(ACCOUNT_COPY.unknownDevice))

		await leftSignedOut(router)
		expect(callsTo(signOutOf("browser"))).toHaveLength(1)
	})
})

describe("Sign out everywhere", () => {
	it("signs every session out, clears the bearer and leaves the site signed out", async () => {
		const router = await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOutEverywhere)

		await leftSignedOut(router)
		expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(1)
		expect(callsTo(SIGN_OUT_EVERYWHERE)[0]?.authorization).toBe(
			`Bearer ${BEARER}`,
		)
	})

	it("disables itself while pending, then shows what failed with a Retry", async () => {
		const reply = deferredReply()
		routes[SIGN_OUT_EVERYWHERE] = reply.promise
		await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOutEverywhere)

		await expectPending(ACCOUNT_COPY.signOutEverywhere)
		reply.resolve(relayError(503, "UNAVAILABLE"))
		await screen.findByRole("alert")
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expect(rowNames()).toHaveLength(3)
		routes[SIGN_OUT_EVERYWHERE] = NO_CONTENT
		press(RETRY_LABEL)
		await waitFor(() => expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(2))
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
	})
})

describe("the site sign-out", () => {
	it("signs the bearer session out, clears it and leaves the site signed out", async () => {
		const router = await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOut)

		await leftSignedOut(router)
		expect(callsTo(SIGN_OUT_SITE)).toHaveLength(1)
		expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(0)
	})

	it("disables itself while pending, then shows what failed with a Retry", async () => {
		const reply = deferredReply()
		routes[SIGN_OUT_SITE] = reply.promise
		await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOut)

		await expectPending(ACCOUNT_COPY.signOut)
		reply.resolve(relayError(500, "INTERNAL"))
		await screen.findByRole("alert")
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		routes[SIGN_OUT_SITE] = { body: { success: true } }
		press(RETRY_LABEL)
		await waitFor(() => expect(callsTo(SIGN_OUT_SITE)).toHaveLength(2))
	})

	it("leaves the site signed out when the bearer is already rejected", async () => {
		routes[SIGN_OUT_SITE] = relayError(401, "UNAUTHENTICATED")
		const router = await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOut)

		await leftSignedOut(router)
	})
})
