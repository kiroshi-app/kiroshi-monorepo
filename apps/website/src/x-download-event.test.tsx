import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WEBSITE_COPY } from "./copy"
import { X_DOWNLOAD_EVENT_ID } from "./x-ads"

const MAC_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15"
const MAC_ASSET_URL =
	"https://github.com/kiroshi-app/kiroshi-monorepo/releases/download/v1.0.0/Kiroshi_1.0.0_aarch64.dmg"

let twq = vi.fn()

const answerLatestRelease = async () =>
	Response.json({
		assets: [
			{
				name: "Kiroshi_1.0.0_aarch64.dmg",
				browser_download_url: MAC_ASSET_URL,
			},
		],
	})

const PRODUCT_HUNT_URL =
	"https://www.producthunt.com/products/kiroshi?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-kiroshi"
const PRODUCT_HUNT_LIGHT_SRC =
	"https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1299478&theme=light&t=1793522267725"
const PRODUCT_HUNT_DARK_SRC =
	"https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1299478&theme=dark&t=1793522267725"

const neverAnswer = () => new Promise<Response>(() => {})

const openHome = async () => {
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue(MAC_AGENT)
	vi.resetModules()
	const { createSiteRouter } = await import("./router")
	const router = createSiteRouter(
		createMemoryHistory({ initialEntries: ["/"] }),
	)
	render(<RouterProvider router={router} />)
	const [downloadLink] = await screen.findAllByRole("link", {
		name: WEBSITE_COPY.downloadActionMacOS,
	})
	return downloadLink
}

beforeEach(() => {
	twq = vi.fn()
	vi.stubGlobal("twq", twq)
})

afterEach(() => {
	cleanup()
	vi.doUnmock("./x-ads")
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("a download CTA click", () => {
	it("reports one X Download event per click once the target is resolved", async () => {
		vi.stubGlobal("fetch", vi.fn(answerLatestRelease))
		const downloadLink = await openHome()
		await vi.waitFor(() =>
			expect(downloadLink.getAttribute("href")).toBe(MAC_ASSET_URL),
		)

		fireEvent.click(downloadLink)
		fireEvent.click(downloadLink)

		expect(twq.mock.calls).toEqual([
			["event", X_DOWNLOAD_EVENT_ID, {}],
			["event", X_DOWNLOAD_EVENT_ID, {}],
		])
	})

	it("reports one X Download event per click while the target is resolving", async () => {
		vi.stubGlobal("fetch", vi.fn(neverAnswer))
		const downloadLink = await openHome()

		fireEvent.click(downloadLink)

		expect(twq.mock.calls).toEqual([["event", X_DOWNLOAD_EVENT_ID, {}]])
	})

	it("reports nothing while the event id is empty", async () => {
		vi.doMock("./x-ads", () => ({ X_DOWNLOAD_EVENT_ID: "" }))
		vi.stubGlobal("fetch", vi.fn(neverAnswer))
		const downloadLink = await openHome()

		fireEvent.click(downloadLink)

		expect(twq).not.toHaveBeenCalled()
	})

	it("still lets the download through when the pixel is missing", async () => {
		vi.stubGlobal("twq", undefined)
		vi.stubGlobal("fetch", vi.fn(answerLatestRelease))
		const downloadLink = await openHome()
		await vi.waitFor(() =>
			expect(downloadLink.getAttribute("href")).toBe(MAC_ASSET_URL),
		)

		const thrown = vi.fn()
		window.addEventListener("error", thrown)

		expect(fireEvent.click(downloadLink)).toBe(true)
		window.removeEventListener("error", thrown)
		expect(thrown).not.toHaveBeenCalled()
	})
})

describe("the Product Hunt badge", () => {
	it("links to the Kiroshi product page in a new tab with both scheme images", async () => {
		vi.stubGlobal("fetch", vi.fn(neverAnswer))
		await openHome()

		const badgeImages = screen.getAllByAltText(
			"Kiroshi - Your team of agents | Product Hunt",
		)
		const badgeLink = badgeImages[0]?.closest("a")

		expect(badgeLink?.getAttribute("href")).toBe(PRODUCT_HUNT_URL)
		expect(badgeLink?.getAttribute("target")).toBe("_blank")
		expect(badgeLink?.getAttribute("rel")).toBe("noopener noreferrer")
		expect(badgeImages.map((image) => image.closest("a"))).toEqual([
			badgeLink,
			badgeLink,
		])
		expect(badgeImages.map((image) => image.getAttribute("src"))).toEqual([
			PRODUCT_HUNT_LIGHT_SRC,
			PRODUCT_HUNT_DARK_SRC,
		])
	})
})
