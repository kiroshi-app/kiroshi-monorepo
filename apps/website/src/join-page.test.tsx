import {
	type AnyRouter,
	createMemoryHistory,
	RouterProvider,
} from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RELEASES_URL, WEBSITE_COPY } from "./copy"
import { APP_STORE_URL, JOIN_COPY } from "./join-copy"
import "./router"

const INVITATION = "7f3c9a2e-0b1d-4e6a-9c8f-2a1b3c4d5e6f"
const RELAY_ORIGIN = new URL(
	import.meta.env.VITE_RELAY_URL || "https://api.kiroshi.app",
).origin
const MAC_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15"
const WINDOWS_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
const IPHONE_AGENT =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1"
const APP_TAKEOVER_WAIT_MS = 2000

const VALID_ANSWER = {
	state: "valid",
	spaceName: "Studio",
	inviter: "Noa",
	expiresAt: "2026-10-25T12:00:00Z",
}

type Reply = { status?: number; body?: unknown } | Error

let invitationReply: Reply = { body: VALID_ANSWER }
let fetched: URL[] = []
let assign = vi.fn()
let router: AnyRouter

const answer = async (input: URL | string) => {
	const url = new URL(input)
	fetched.push(url)
	if (url.origin !== RELAY_ORIGIN) return Response.json({}, { status: 404 })
	if (invitationReply instanceof Error) throw invitationReply
	return Response.json(invitationReply.body ?? {}, {
		status: invitationReply.status ?? 200,
	})
}

const openJoin = async (path: string, agent = MAC_AGENT) => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent)
	vi.resetModules()
	const { createSiteRouter } = await import("./router")
	router = createSiteRouter(createMemoryHistory({ initialEntries: [path] }))
	render(<RouterProvider router={router} />)
}

const joinPathOf = (invitation: string) =>
	`/join?${new URLSearchParams({ invitation })}`

const kiroshiLinkOf = (invitation: string) =>
	`kiroshi://join?invitation=${invitation}`

const findText = (text: string) => screen.findByText(text)

const linkNamed = (name: string) =>
	screen.getByRole<HTMLAnchorElement>("link", { name })

const pageText = () => document.body.textContent ?? ""

const waitOutTheApp = () =>
	act(() => {
		vi.advanceTimersByTime(APP_TAKEOVER_WAIT_MS)
	})

const SIGN_IN_LINE = "Sign in with the email this invitation was sent to"

const headingsOfLevelOne = () =>
	screen
		.getAllByRole("heading", { level: 1 })
		.map((heading) => heading.textContent)

const expectSpaceLines = () => {
	expect(headingsOfLevelOne()).toEqual(["Studio"])
	expect(screen.getByText("Noa invited you to join")).toBeTruthy()
	expect(screen.getByText("Works once, until October 25")).toBeTruthy()
	expect(screen.getByText(JOIN_COPY.privacyIn("Studio"))).toBeTruthy()
}

const expectNoSpaceLines = () => {
	expect(headingsOfLevelOne()).toEqual([JOIN_COPY.unnamedSpaceHeading])
	expect(
		screen.getByRole("heading", { level: 1 }).classList.contains("sr-only"),
	).toBe(true)
	expect(pageText()).not.toMatch(/invited you|Works once/)
	expect(screen.getByText(JOIN_COPY.privacyInThisSpace)).toBeTruthy()
}

const expectClosed = async () => {
	await screen.findByRole("heading", { name: JOIN_COPY.closedTitle })
	expect(screen.getByText(JOIN_COPY.closedBody)).toBeTruthy()
	expect(screen.queryAllByRole("link", { name: /Kiroshi|Download/ })).toEqual(
		[],
	)
	expect(assign).not.toHaveBeenCalled()
}

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	invitationReply = { body: VALID_ANSWER }
	fetched = []
	vi.stubGlobal("fetch", vi.fn(answer))
	assign = vi.fn()
	vi.spyOn(window.location, "assign").mockImplementation(assign)
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("a valid invitation on a computer", () => {
	it("opens kiroshi:// once and shows Opening Kiroshi (5.1)", async () => {
		await openJoin(joinPathOf(INVITATION))

		await findText(JOIN_COPY.didntOpen)

		expectSpaceLines()
		expect(
			screen.getByRole<HTMLButtonElement>("button", {
				name: JOIN_COPY.openingKiroshi,
			}).disabled,
		).toBe(true)
		expect(linkNamed(WEBSITE_COPY.downloadActionMacOS).href).toBe(RELEASES_URL)
		expect(assign).toHaveBeenCalledExactlyOnceWith(kiroshiLinkOf(INVITATION))
	})

	it("offers Open in Kiroshi and the macOS download once the app doesn't take over (5)", async () => {
		await openJoin(joinPathOf(INVITATION))
		await findText(JOIN_COPY.didntOpen)

		waitOutTheApp()

		await findText(SIGN_IN_LINE)
		expectSpaceLines()
		expect(linkNamed(JOIN_COPY.openInKiroshi).href).toBe(
			kiroshiLinkOf(INVITATION),
		)
		expect(linkNamed(WEBSITE_COPY.downloadActionMacOS).href).toBe(RELEASES_URL)
		expect(linkNamed(JOIN_COPY.learnMore).getAttribute("href")).toBe("/privacy")
		expect(pageText()).not.toContain("@")
		expect(assign).toHaveBeenCalledOnce()
	})

	it("offers the Windows download beside the other platforms (5.2)", async () => {
		await openJoin(joinPathOf(INVITATION), WINDOWS_AGENT)
		await findText(JOIN_COPY.didntOpen)

		waitOutTheApp()

		await findText(JOIN_COPY.alsoOnBesideWindows)
		expect(screen.queryByText(SIGN_IN_LINE)).toBeNull()
		expect(linkNamed(WEBSITE_COPY.downloadActionWindows).href).toBe(
			RELEASES_URL,
		)
		expect(linkNamed(JOIN_COPY.openInKiroshi).href).toBe(
			kiroshiLinkOf(INVITATION),
		)
	})

	it("keeps Opening Kiroshi once the app takes the focus", async () => {
		await openJoin(joinPathOf(INVITATION))
		await findText(JOIN_COPY.didntOpen)

		fireEvent.blur(window)
		waitOutTheApp()

		expect(screen.getByText(JOIN_COPY.didntOpen)).toBeTruthy()
		expect(
			screen.queryByRole("link", { name: JOIN_COPY.openInKiroshi }),
		).toBeNull()
	})

	it("renders the inviter verbatim when it is an email", async () => {
		invitationReply = { body: { ...VALID_ANSWER, inviter: "noa@example.com" } }
		await openJoin(joinPathOf(INVITATION))

		expect(await findText("noa@example.com invited you to join")).toBeTruthy()
	})
})

describe("a valid invitation on an iPhone", () => {
	it("offers the app by its universal link and the App Store, never kiroshi:// (5.4)", async () => {
		await openJoin(joinPathOf(INVITATION), IPHONE_AGENT)

		await findText(JOIN_COPY.alsoOnBesideIPhone)

		expectSpaceLines()
		expect(linkNamed(JOIN_COPY.openInTheApp).href).toBe(
			`https://kiroshi.app${joinPathOf(INVITATION)}`,
		)
		expect(linkNamed(JOIN_COPY.appStore).href).toBe(APP_STORE_URL)
		waitOutTheApp()
		expect(assign).not.toHaveBeenCalled()
	})
})

describe("an invitation that can't be used (5.3)", () => {
	it.each(["used", "expired", "withdrawn"])(
		"shows 5.3 when the relay answers %s",
		async (state) => {
			invitationReply = { body: { state } }
			await openJoin(joinPathOf(INVITATION))

			await expectClosed()
		},
	)

	it("shows 5.3 when the relay doesn't know the invitation (404)", async () => {
		invitationReply = { status: 404, body: {} }
		await openJoin(joinPathOf(INVITATION))

		await expectClosed()
	})

	it.each([
		"/join",
		"/join?invitation=",
		"/join?invitation=..%2Fme",
		joinPathOf("a".repeat(129)),
		`/join?invitation=${INVITATION}&invitation=${INVITATION}`,
	])("shows 5.3 for %s without asking the relay", async (path) => {
		await openJoin(path)

		await expectClosed()
		expect(fetched.filter((url) => url.origin === RELAY_ORIGIN)).toEqual([])
	})
})

describe("a valid invitation without its Space lines", () => {
	it.each<[string, Reply]>([
		["answers valid without the Space fields", { body: { state: "valid" } }],
		["fails (500)", { status: 500, body: {} }],
		["is overloaded (503)", { status: 503, body: {} }],
		["limits the rate (429)", { status: 429, body: {} }],
		["is unreachable", new TypeError("Failed to fetch")],
	])("hands over to Kiroshi when the relay %s", async (_, reply) => {
		invitationReply = reply
		await openJoin(joinPathOf(INVITATION))
		await findText(JOIN_COPY.didntOpen)

		expectNoSpaceLines()
		expect(assign).toHaveBeenCalledExactlyOnceWith(kiroshiLinkOf(INVITATION))

		waitOutTheApp()

		await findText(SIGN_IN_LINE)
		expect(pageText()).not.toMatch(/Studio|undefined|null/)
	})
})

describe("the invitation reference", () => {
	it.each(["12345678901234567890", "0042", "1e5"])(
		"keeps %s as the string it is",
		async (invitation) => {
			await openJoin(joinPathOf(invitation))
			await findText(JOIN_COPY.didntOpen)

			expect(assign).toHaveBeenCalledExactlyOnceWith(kiroshiLinkOf(invitation))
			expect(router.state.location.href).toBe(joinPathOf(invitation))
			const [read] = fetched.filter((url) => url.origin === RELAY_ORIGIN)
			expect(read?.pathname).toBe(`/invitations/${invitation}/state`)
		},
	)

	it("reaches the relay alone, on the state path, without a bearer", async () => {
		localStorage.setItem("kiroshi.relay.bearer", "bearer-of-someone")
		await openJoin(joinPathOf(INVITATION))
		await findText(JOIN_COPY.didntOpen)
		waitOutTheApp()
		await findText(JOIN_COPY.signInWithInvitedEmail)
		localStorage.clear()

		const carriers = fetched.filter((url) => url.href.includes(INVITATION))
		expect(carriers.map((url) => url.origin)).toEqual([RELAY_ORIGIN])
		expect(carriers[0]?.pathname).toBe(`/invitations/${INVITATION}/state`)
		const [, relayInit] =
			vi
				.mocked(fetch)
				.mock.calls.find(([input]) => String(input).startsWith(RELAY_ORIGIN)) ??
			[]
		expect(new Headers(relayInit?.headers).has("Authorization")).toBe(false)
	})
})
