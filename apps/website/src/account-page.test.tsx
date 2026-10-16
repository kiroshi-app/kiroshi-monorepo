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

const EMAIL = "alex@example.com"
const NAME = "Alex Rivera"
const BEARER = "bearer-of-the-site"
const BEARER_KEY = "kiroshi.relay.bearer"
const ACCOUNT_PATH = "/account"
const HOUR_MS = 3_600_000
const MINI = "Alex’s Mac mini"
const MAC = "Alex’s MacBook Pro"
const IPHONE = "Alex’s iPhone"
const DAY_MS = 24 * HOUR_MS
const ME = "GET /me"
const SESSIONS = "GET /me/sessions"
const SEND_CODE = "POST /api/auth/email-otp/send-verification-otp"
const SIGN_IN = "POST /api/auth/sign-in/email-otp"
const SIGN_OUT_EVERYWHERE = "DELETE /me/sessions"
const SIGN_OUT = "POST /api/auth/sign-out"
const RETRY_LABEL = "Retry"

const signOutOf = (id: string) => `DELETE /me/sessions/${id}`

type Reply = { status?: number; body?: unknown }

type RelayRoutes = Record<string, Reply | Error | Promise<Reply>>

type RelayCall = {
	route: string
	authorization: string | null
	credentials: RequestCredentials | undefined
}

type Router = ReturnType<typeof createSiteRouter>

const NO_CONTENT: Reply = { status: 204 }

const SIGNED_OUT: Reply = { body: { status: true } }

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
	createdAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
	lastSeenAt: new Date(Date.now() - lastSeenAgo).toISOString(),
})

const SESSION_FIXTURES: SessionFixture[] = [
	{
		id: "mini",
		deviceName: MINI,
		platform: "macos",
		lastSeenAgo: 0,
		current: true,
	},
	{
		id: "mac",
		deviceName: MAC,
		platform: "macos",
		lastSeenAgo: 3 * DAY_MS,
		current: false,
	},
	{
		id: "iphone",
		deviceName: IPHONE,
		platform: "ios",
		lastSeenAgo: DAY_MS,
		current: false,
	},
	{
		id: "unnamed",
		deviceName: null,
		platform: null,
		lastSeenAgo: 2 * HOUR_MS,
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
	[signOutOf("mini")]: NO_CONTENT,
	[signOutOf("unnamed")]: NO_CONTENT,
	[SIGN_OUT_EVERYWHERE]: NO_CONTENT,
	[SIGN_OUT]: SIGNED_OUT,
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
		credentials: init?.credentials,
	})
	const reply = await routes[route]
	if (!reply) throw new Error(`The fake relay has no ${route}`)
	if (reply instanceof Error) throw reply
	return responseOf(reply)
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
	await heading(NAME)
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

const rowSignOut = (name: string) => `Sign out ${name}`

const confirmation = () => screen.findByRole("alertdialog")

const devicesSection = () => {
	const section = screen
		.getByRole("heading", { name: ACCOUNT_COPY.devicesHeading })
		.closest("section")
	if (!section) throw new Error("No devices section")
	return section
}

const accountSignOut = () => button(ACCOUNT_COPY.signOut)

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

		await heading(NAME)
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
	it("titles the page with the name, the email and the initials under it", async () => {
		await openAccount()

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(NAME)
		expect(screen.getByText(EMAIL)).toBeTruthy()
		expect(screen.getByText("AR")).toBeTruthy()
		expectBearerWithoutCredentials(ME)
	})

	it("names the plan and devices sections", async () => {
		await openAccount()

		expect(
			screen
				.getAllByRole("heading", { level: 2 })
				.map((sectionHeading) => sectionHeading.textContent),
		).toEqual(["Plan", "Signed-in devices"])
	})

	it("shows Pro, Free during the beta and the price struck through", async () => {
		await openAccount()

		expect(screen.getByText("Pro")).toBeTruthy()
		expect(screen.getByText("Free during the beta")).toBeTruthy()
		expect(screen.getByText("$15 / user / month").tagName).toBe("S")
		expect(screen.queryByText(/\$20/)).toBeNull()
	})

	it("shows the free plan without the beta tag", async () => {
		routes[ME] = { body: { email: EMAIL, name: NAME, plan: "free" } }
		await openAccount()

		expect(screen.getByText(ACCOUNT_COPY.plans.free.name)).toBeTruthy()
		expect(screen.queryByText("Free during the beta")).toBeNull()
		expect(screen.getByText(ACCOUNT_COPY.plans.free.price).tagName).not.toBe(
			"S",
		)
	})
})

describe("the signed-in devices", () => {
	it("lists one row per session in the order the relay answers", async () => {
		await openAccount()

		expect(rowNames()).toEqual([MINI, MAC, IPHONE, ACCOUNT_COPY.unknownDevice])
		expectBearerWithoutCredentials(SESSIONS)
	})

	it("captions a session seen under a minute ago Active now", async () => {
		await openAccount()

		expect(within(rowOf(MINI)).getByText(/· Active now$/)).toBeTruthy()
		expect(screen.queryByText(/Signed in just now/)).toBeNull()
	})

	it("names each row with its platform and last seen time", async () => {
		await openAccount()

		expect(
			within(rowOf(MINI)).getByText("Kiroshi for Mac · Active now"),
		).toBeTruthy()
		expect(
			within(rowOf(MAC)).getByText("Kiroshi for Mac · 3 days ago"),
		).toBeTruthy()
		expect(
			within(rowOf(IPHONE)).getByText("Kiroshi for iPhone · Yesterday"),
		).toBeTruthy()
	})

	it("names a session without a device name Unknown device", async () => {
		await openAccount()

		expect(
			within(rowOf(ACCOUNT_COPY.unknownDevice)).getByText("2 hours ago"),
		).toBeTruthy()
	})

	it("flags the current session as this device, and only it", async () => {
		await openAccount()

		expect(screen.getAllByText(ACCOUNT_COPY.thisDevice)).toHaveLength(1)
		expect(within(rowOf(MINI)).getByText(ACCOUNT_COPY.thisDevice)).toBeTruthy()
	})
})

describe("the confirmation", () => {
	it.each([
		[rowSignOut(MAC), ACCOUNT_COPY.signOutDeviceTitle(MAC)],
		[rowSignOut(MINI), ACCOUNT_COPY.signOutThisDeviceTitle],
		[ACCOUNT_COPY.signOutEverywhere, ACCOUNT_COPY.signOutEverywhereTitle],
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

describe("the confirmation copy", () => {
	it.each([
		[
			rowSignOut(MAC),
			"Sign out Alex’s MacBook Pro?",
			"You’ll need to sign in again on Alex’s MacBook Pro.",
		],
		[
			rowSignOut(MINI),
			"Sign out this device?",
			"You’ll need to sign in again to come back here.",
		],
		[
			"Sign out everywhere",
			"Sign out everywhere?",
			"Every device signed in to your account signs out, this one included. Sign in again on each one to come back.",
		],
	])(
		"before %s reads its title and description",
		async (label, title, description) => {
			await openAccount()

			press(label)

			const dialog = await confirmation()
			expect(within(dialog).getByRole("heading", { name: title })).toBeTruthy()
			expect(within(dialog).getByText(description)).toBeTruthy()
		},
	)
})

describe("Sign out on a row", () => {
	it("removes the row only after the relay answers", async () => {
		const reply = deferredReply()
		routes[signOutOf("mac")] = reply.promise
		await openAccount()

		await pressAndConfirm(rowSignOut(MAC))

		await waitFor(() => expect(callsTo(signOutOf("mac"))).toHaveLength(1))
		expectBearerWithoutCredentials(signOutOf("mac"))
		expect(rowOf(MAC)).toBeTruthy()
		reply.resolve(NO_CONTENT)
		await waitFor(() => expect(screen.queryByText(MAC)).toBeNull())
		expect(rowNames()).toEqual([MINI, IPHONE, ACCOUNT_COPY.unknownDevice])
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

		await pressAndConfirm(rowSignOut(MINI))

		await leftSignedOut(router)
		expect(callsTo(signOutOf("mini"))).toHaveLength(1)
	})
})

describe("Sign out everywhere", () => {
	it("signs every session out, clears the bearer and leaves the site signed out", async () => {
		const router = await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOutEverywhere)

		await leftSignedOut(router)
		expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(1)
		expectBearerWithoutCredentials(SIGN_OUT_EVERYWHERE)
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
		expect(rowNames()).toHaveLength(4)
		routes[SIGN_OUT_EVERYWHERE] = NO_CONTENT
		press(RETRY_LABEL)
		await waitFor(() => expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(2))
		expect(localStorage.getItem(BEARER_KEY)).toBeNull()
	})
})

describe("the actions under the device list", () => {
	it("offer Sign out everywhere and no standalone Sign out", async () => {
		await openAccount()

		const devices = within(devicesSection())
		expect(
			devices.getByRole("button", { name: "Sign out everywhere" }),
		).toBeTruthy()
		expect(devices.queryByRole("button", { name: "Sign out" })).toBeNull()
	})

	it("leave the site signed out when the bearer is already rejected", async () => {
		routes[SIGN_OUT_EVERYWHERE] = relayError(401, "UNAUTHENTICATED")
		const router = await openAccount()

		await pressAndConfirm(ACCOUNT_COPY.signOutEverywhere)

		await leftSignedOut(router)
	})
})

describe("the account Sign out", () => {
	it("sits outside the devices section, which still lists this device", async () => {
		await openAccount()

		expect(devicesSection().contains(accountSignOut())).toBe(false)
		expect(rowNames()).toEqual([MINI, MAC, IPHONE, ACCOUNT_COPY.unknownDevice])
		expect(triggerOf(rowSignOut(MINI))).toBeTruthy()
		expect(triggerOf(ACCOUNT_COPY.signOutEverywhere)).toBeTruthy()
	})

	it("signs this browser out without a confirmation and lands on /login", async () => {
		const router = await openAccount()

		fireEvent.click(accountSignOut())

		expect(screen.queryByRole("alertdialog")).toBeNull()
		await leftSignedOut(router)
		expect(callsTo(SIGN_OUT)).toHaveLength(1)
		expectBearerWithoutCredentials(SIGN_OUT)
		expect(callsTo(SIGN_OUT_EVERYWHERE)).toHaveLength(0)
	})

	it("lands on /login when the bearer is already rejected", async () => {
		routes[SIGN_OUT] = relayError(401, "UNAUTHENTICATED")
		const router = await openAccount()

		fireEvent.click(accountSignOut())

		await leftSignedOut(router)
	})

	it("disables itself while pending, then stays on /account and shows what failed with a Retry", async () => {
		const reply = deferredReply()
		routes[SIGN_OUT] = reply.promise
		const router = await openAccount()

		fireEvent.click(accountSignOut())

		await waitFor(() =>
			expect(accountSignOut().hasAttribute("disabled")).toBe(true),
		)
		reply.resolve(relayError(500, "INTERNAL"))
		const alert = await screen.findByRole("alert")
		expect(alert.textContent).toBe(LOGIN_COPY.failures.server)
		expect(devicesSection().contains(alert)).toBe(false)
		expect(router.state.location.pathname).toBe(ACCOUNT_PATH)
		expect(localStorage.getItem(BEARER_KEY)).toBe(BEARER)
		expect(accountSignOut().hasAttribute("disabled")).toBe(false)
		routes[SIGN_OUT] = SIGNED_OUT
		press(RETRY_LABEL)
		await leftSignedOut(router)
		expect(callsTo(SIGN_OUT)).toHaveLength(2)
	})
})
