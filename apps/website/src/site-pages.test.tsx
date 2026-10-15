import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { AUTHOR_URL, REPOSITORY_URL, WEBSITE_COPY } from "./copy"
import { createSiteRouter } from "./router"
import { SITE_PAGES_COPY } from "./site-pages-copy"

const supportEmail = vi.hoisted(() => ({ value: "" }))

vi.mock("./site-pages-copy", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./site-pages-copy")>()
	return {
		...actual,
		get SUPPORT_EMAIL() {
			return supportEmail.value
		},
	}
})

const { privacy, terms, support } = SITE_PAGES_COPY

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

const openPage = async (path: string, title: string) => {
	const router = renderSite(path)
	await screen.findByRole("heading", { level: 1, name: title })
	return router
}

const sectionHeadings = () =>
	screen
		.getAllByRole("heading", { level: 2 })
		.map((heading) => heading.textContent)

const footerLinks = () =>
	within(screen.getByRole("contentinfo"))
		.getAllByRole("link")
		.map((link) => [link.textContent, link.getAttribute("href")])

const FOOTER_LINKS = [
	[WEBSITE_COPY.credit, AUTHOR_URL],
	[privacy.navLabel, "/privacy"],
	[terms.navLabel, "/terms"],
	[support.navLabel, "/support"],
]

const PAGES = [
	{ path: "/privacy", title: privacy.title },
	{ path: "/terms", title: terms.title },
	{ path: "/support", title: support.title },
]

afterEach(() => {
	cleanup()
	supportEmail.value = ""
})

describe.each(PAGES)("$path", ({ path, title }) => {
	it("renders one h1 naming the page", async () => {
		await openPage(path, title)
		expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
	})

	it("links the hexagon mark to the home page", async () => {
		await openPage(path, title)
		expect(
			screen.getByRole("link", { name: SITE_PAGES_COPY.homeLink }),
		).toHaveProperty("pathname", "/")
	})

	it("renders the footer with the credit and the three page links", async () => {
		await openPage(path, title)
		expect(footerLinks()).toEqual(expect.arrayContaining(FOOTER_LINKS))
	})
})

describe("the home page", () => {
	it("renders the same footer", async () => {
		renderSite("/")
		await screen.findByRole("contentinfo")
		expect(footerLinks()).toEqual(expect.arrayContaining(FOOTER_LINKS))
	})
})

describe("the privacy page", () => {
	it("renders its four sections in order", async () => {
		await openPage("/privacy", privacy.title)
		expect(sectionHeadings()).toEqual([
			"What we collect",
			"Where messages go",
			"Third-party AI providers",
			"How to delete your account",
		])
	})
})

describe("the terms page", () => {
	it("renders its three sections in order", async () => {
		await openPage("/terms", terms.title)
		expect(sectionHeadings()).toEqual([
			"The service",
			"The Pro plan",
			"Acceptable use",
		])
	})
})

describe("the support page", () => {
	it("renders Contact, then Report a problem with a link to the issues", async () => {
		await openPage("/support", support.title)
		expect(sectionHeadings()).toEqual(["Contact", "Report a problem"])
		expect(
			screen.getByRole("link", { name: support.report.link }),
		).toHaveProperty("href", `${REPOSITORY_URL}/issues`)
	})

	it("renders no mailto link while the support email is empty", async () => {
		await openPage("/support", support.title)
		expect(document.querySelector('a[href^="mailto:"]')).toBeNull()
	})

	it("renders the support email as a mailto link under Contact", async () => {
		supportEmail.value = "help@kiroshi.app"
		await openPage("/support", support.title)
		const contact = screen.getByRole("heading", { name: "Contact" })
			.parentElement as HTMLElement
		expect(
			within(contact).getByRole("link", { name: "help@kiroshi.app" }),
		).toHaveProperty("href", "mailto:help@kiroshi.app")
	})
})
