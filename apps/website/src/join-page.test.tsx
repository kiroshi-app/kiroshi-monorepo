import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { RELEASES_URL } from "./copy"
import { APP_STORE_URL, JOIN_COPY } from "./join-copy"
import { createSiteRouter } from "./router"

const INVITATION = "7f3c9a2e-0b1d-4e6a-9c8f-2a1b3c4d5e6f"
const NUMERIC_LOOKING_INVITATION = "1e5"
const RELAY_ORIGIN = new URL(
	import.meta.env.VITE_RELAY_URL || "https://api.kiroshi.app",
).origin
const IPHONE_AGENT =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1"
const APP_TAKEOVER_WAIT_MS = 2000

type Reply = { status?: number; body?: unknown } | Error

let invitationReply: Reply = { status: 404, body: {} }
let fetched: URL[] = []
let assign = vi.fn()

const answer = async (input: URL | string) => {
	const url = new URL(input)
	fetched.push(url)
	if (invitationReply instanceof Error) throw invitationReply
	return Response.json(invitationReply.body ?? {}, {
		status: invitationReply.status ?? 200,
	})
}

const openJoin = (path: string) => {
	const router = createSiteRouter(
		createMemoryHistory({ initialEntries: [path] }),
	)
	render(
		<I18nProvider>
			<RouterProvider router={router} />
		</I18nProvider>,
	)
}

const joinPathOf = (invitation: string) =>
	`/join?${new URLSearchParams({ invitation })}`

const heading = (name: string) => screen.findByRole("heading", { name })

const linkNamed = (name: string) =>
	screen.getByRole<HTMLAnchorElement>("link", { name })

const kiroshiLinkOf = (invitation: string) =>
	`kiroshi://join?invitation=${encodeURIComponent(invitation)}`

const waitOutTheApp = () =>
	act(() => {
		vi.advanceTimersByTime(APP_TAKEOVER_WAIT_MS)
	})

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true })
	invitationReply = { status: 404, body: {} }
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

describe("the join page on a computer", () => {
	it.each([INVITATION, NUMERIC_LOOKING_INVITATION])(
		"hands invitation %s to kiroshi:// unchanged and shows Opening Kiroshi",
		async (invitation) => {
			openJoin(joinPathOf(invitation))

			await heading(JOIN_COPY.openingTitle)

			expect(assign).toHaveBeenCalledExactlyOnceWith(kiroshiLinkOf(invitation))
			const handedOver = new URL(assign.mock.calls[0]?.[0])
			expect(handedOver.searchParams.get("invitation")).toBe(invitation)
		},
	)

	it("offers the download for this computer once the app doesn't take over", async () => {
		openJoin(joinPathOf(INVITATION))
		await heading(JOIN_COPY.openingTitle)

		waitOutTheApp()

		await heading(JOIN_COPY.visitorTitle)
		expect(linkNamed(JOIN_COPY.download).href).toBe(RELEASES_URL)
		expect(linkNamed(JOIN_COPY.openAgain).href).toBe(kiroshiLinkOf(INVITATION))
		expect(document.body.textContent).not.toMatch(/\bMac\b/)
	})

	it("keeps Opening Kiroshi once the app takes the focus", async () => {
		openJoin(joinPathOf(INVITATION))
		await heading(JOIN_COPY.openingTitle)

		fireEvent.blur(window)
		waitOutTheApp()

		expect(screen.getByRole("heading").textContent).toBe(JOIN_COPY.openingTitle)
	})
})

describe("the join page on an iPhone", () => {
	it("offers Open the app and the App Store without leaving for kiroshi://", async () => {
		vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE_AGENT)
		openJoin(joinPathOf(INVITATION))

		await heading(JOIN_COPY.iphoneTitle)

		expect(linkNamed(JOIN_COPY.openApp).href).toBe(
			`https://kiroshi.app${joinPathOf(INVITATION)}`,
		)
		expect(linkNamed(JOIN_COPY.appStore).href).toBe(APP_STORE_URL)
		expect(assign).not.toHaveBeenCalled()
	})
})

describe("an invitation that can't be used", () => {
	it.each(["used", "expired", "withdrawn"])(
		"shows the closed state and never opens kiroshi:// when the relay answers %s",
		async (status) => {
			invitationReply = { body: { status } }
			openJoin(joinPathOf(INVITATION))

			await heading(JOIN_COPY.closedTitle)
			waitOutTheApp()

			expect(assign).not.toHaveBeenCalled()
		},
	)

	it.each(["/join", "/join?invitation=", "/join?invitation=..%2Fme"])(
		"shows the closed state for %s without asking the relay",
		async (path) => {
			openJoin(path)

			await heading(JOIN_COPY.closedTitle)

			expect(fetched).toEqual([])
			expect(assign).not.toHaveBeenCalled()
		},
	)
})

describe("an invitation the relay can't vouch for", () => {
	it.each<[string, Reply]>([
		["absent", { status: 404, body: {} }],
		["pending", { body: { status: "pending" } }],
		["failing", { status: 500, body: {} }],
		["unreachable", new TypeError("Failed to fetch")],
		["answering without a status", { body: {} }],
	])("counts as valid when the relay is %s", async (_, reply) => {
		invitationReply = reply
		openJoin(joinPathOf(INVITATION))

		await heading(JOIN_COPY.openingTitle)

		expect(assign).toHaveBeenCalledExactlyOnceWith(kiroshiLinkOf(INVITATION))
	})
})

describe("where the invitation goes", () => {
	it("reaches the relay alone, in the invitation path", async () => {
		openJoin(joinPathOf(INVITATION))
		await heading(JOIN_COPY.openingTitle)
		waitOutTheApp()
		await heading(JOIN_COPY.visitorTitle)

		const carriers = fetched.filter((url) => url.href.includes(INVITATION))
		expect(carriers.map((url) => url.origin)).toEqual([RELAY_ORIGIN])
		expect(carriers[0]?.pathname).toBe(`/invitations/${INVITATION}`)
	})
})
