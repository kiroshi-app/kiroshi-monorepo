import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import {
	attachmentPathOf,
	MarkdownAttachmentsContext,
} from "@workspace/ui/components/markdown/attachments"

const render = (props: MarkdownProps) =>
	renderToStaticMarkup(
		<I18nProvider>
			<Markdown {...props} />
		</I18nProvider>,
	)

const pendingResolve = () => new Promise<string>(() => {})

const openAttachment = () => {}

const IMAGE =
	"Before.\n\n![The patio at noon](<photos/garden patio.jpg>)\n\nAfter."

const FILE = "Read [the Q3 report](<reports/q3 final.pdf>) before Friday."

describe("attachmentPathOf", () => {
	it.each([
		["photos/patio.jpg", "photos/patio.jpg"],
		["/Users/ana/patio.jpg", "/Users/ana/patio.jpg"],
		["reports/q3%20final.pdf", "reports/q3 final.pdf"],
	])("reads %s as the local path %s", (address, path) => {
		expect(attachmentPathOf(address)).toBe(path)
	})

	it.each([
		undefined,
		"",
		"#notes",
		"//cdn.example.org/a.png",
		"https://example.org/a.png",
		"mailto:ana@example.org",
		"tel:+351210000000",
	])("reads %s as no local path", (address) => {
		expect(attachmentPathOf(address)).toBeNull()
	})
})

describe("a cited attachment image", () => {
	it("reads as its caption without a resolver", () => {
		const html = render({ children: IMAGE })

		expect(html).toContain("<p>The patio at noon</p>")
		expect(html).not.toContain("<img")
	})

	it("draws no image while the resolver runs", () => {
		const html = render({ children: IMAGE, resolveAttachment: pendingResolve })

		expect(html).toContain("The patio at noon")
		expect(html).not.toContain("<img")
	})

	it("keeps a remote image as it was", () => {
		const html = render({
			children: "![A sofa](https://images.example.org/sofa.jpg)",
			resolveAttachment: pendingResolve,
		})

		expect(html).toContain('src="https://images.example.org/sofa.jpg"')
	})
})

describe("a cited attachment file", () => {
	it("draws the file chip inside its paragraph", () => {
		const html = render({ children: FILE, onOpenAttachment: openAttachment })

		expect(html).toMatch(
			/<p>Read <button type="button" aria-label="Open the Q3 report" data-slot="attachment-chip"[^>]*>.*PDF<\/span><\/span><\/button> before Friday\.<\/p>/,
		)
	})

	it("reads as its text without an opener", () => {
		const html = render({ children: FILE })

		expect(html).toContain("<p>Read the Q3 report before Friday.</p>")
	})

	it("lends its opener to a Markdown mounted inside it", () => {
		const html = renderToStaticMarkup(
			<I18nProvider>
				<MarkdownAttachmentsContext
					value={{ onOpenAttachment: openAttachment }}
				>
					<Markdown>{FILE}</Markdown>
				</MarkdownAttachmentsContext>
			</I18nProvider>,
		)

		expect(html).toContain('data-slot="attachment-chip"')
	})

	it.each([
		[
			"a web link",
			"[Docs](https://example.org/docs)",
			'href="https://example.org/docs"',
		],
		["a fragment", "[Notes](#notes)", 'href="#notes"'],
		[
			"a mail link",
			"[Ana](mailto:ana@example.org)",
			'href="mailto:ana@example.org"',
		],
	])("keeps %s as it was", (_, source, href) => {
		const html = render({ children: source, onOpenAttachment: openAttachment })

		expect(html).toContain(href)
		expect(html).not.toContain("attachment-chip")
	})
})
