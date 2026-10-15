import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { AUTHOR_URL, REPOSITORY_URL, WEBSITE_COPY } from "./copy"
import { createSiteRouter } from "./router"
import { SITE_PAGES_COPY } from "./site-pages-copy"

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
	{ path: "/contact", title: support.title },
]

afterEach(cleanup)

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

const TERMS_HEADINGS = [
	"Who provides the service",
	"What the service is",
	"Accounts and eligibility",
	"The Pro plan and the beta",
	"Acceptable use",
	"Your content and the model provider",
	"The open-source code",
	"Availability and changes to the service",
	"Termination",
	"Warranties and limitation of liability",
	"Governing law",
	"Changes to these terms",
	"Contact",
]

const FORBIDDEN_TERMS_TEXT = [
	"[",
	"]",
	"todo",
	"placeholder",
	"lorem",
	"being written",
	"siren",
	"848 046 132",
]

const mainText = () =>
	(screen.getByRole("main").textContent ?? "").toLowerCase()

describe("the terms page", () => {
	it("is titled Terms of Use", async () => {
		await openPage("/terms", "Terms of Use")
	})

	it("renders its thirteen sections in order", async () => {
		await openPage("/terms", terms.title)
		expect(sectionHeadings()).toEqual(TERMS_HEADINGS)
	})

	it("dates the changes section", async () => {
		await openPage("/terms", terms.title)
		const changes = screen.getByRole("heading", {
			name: "Changes to these terms",
		}).parentElement as HTMLElement
		expect(
			within(changes).getByText("Last updated 15 October 2026."),
		).toBeDefined()
	})

	it("renders support@kiroshi.app as a mailto link under Contact", async () => {
		await openPage("/terms", terms.title)
		const contact = screen.getByRole("heading", { name: "Contact" })
			.parentElement as HTMLElement
		expect(
			within(contact).getByRole("link", { name: "support@kiroshi.app" }),
		).toHaveProperty("href", "mailto:support@kiroshi.app")
	})

	it.each(FORBIDDEN_TERMS_TEXT)("renders no %s", async (forbidden) => {
		await openPage("/terms", terms.title)
		expect(mainText()).not.toContain(forbidden)
	})
})

describe("the support page", () => {
	it("renders its six sections in order", async () => {
		await openPage("/support", support.title)
		expect(sectionHeadings()).toEqual([
			"What to write to us about",
			"How to reach us",
			"What helps us answer",
			"Privacy and account deletion",
			"When we answer",
			"Who runs Kiroshi",
		])
	})

	it("links the support address as a mailto under How to reach us", async () => {
		await openPage("/support", support.title)
		const contact = screen.getByRole("heading", { name: "How to reach us" })
			.parentElement as HTMLElement
		expect(
			within(contact).getByRole("link", { name: "support@kiroshi.app" }),
		).toHaveProperty("href", "mailto:support@kiroshi.app")
	})

	it("links bugs and feature requests to the GitHub issues", async () => {
		await openPage("/support", support.title)
		expect(
			screen.getByRole("link", { name: support.contact.issuesLink }),
		).toHaveProperty("href", `${REPOSITORY_URL}/issues`)
	})

	it("names who runs Kiroshi with no legal details", async () => {
		await openPage("/support", support.title)
		expect(
			screen.getByText(
				"Kiroshi, an independent project run from France by Steve Puget.",
			),
		).toBeTruthy()
		expect(screen.getByRole("main").textContent).not.toMatch(
			/SIREN|sole trader|\d{3} \d{3} \d{3}/i,
		)
	})

	it("serves the same page at /contact without changing the URL", async () => {
		const router = await openPage("/contact", support.title)
		expect(router.state.location.pathname).toBe("/contact")
		expect(
			screen.getByRole("link", { name: "support@kiroshi.app" }),
		).toHaveProperty("href", "mailto:support@kiroshi.app")
	})
})
