import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown, type MarkdownProps } from "@workspace/ui/components/markdown"
import {
	attachmentPathOf,
	isStoredAttachmentPath,
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

const MINTED = "0b6f3c2e-8d41-4a7e-9c15-2f7d9e4a1b30"

const STORED_FILE = `/Users/ana/Library/Application Support/com.kiroshi.app/attachments/conversation-7/${MINTED}.pdf`

const FILE = `Read [the Q3 report](<${STORED_FILE}>) before Friday.`

describe("attachmentPathOf", () => {
	it.each([
		["photos/patio.jpg", "photos/patio.jpg"],
		["/Users/ana/patio.jpg", "/Users/ana/patio.jpg"],
		["reports/q3%20final.pdf", "reports/q3 final.pdf"],
		["attachments/50% off.pdf", "attachments/50% off.pdf"],
		["attachments/50%25%20off.pdf", "attachments/50% off.pdf"],
		["C:/Users/me/report.pdf", "C:/Users/me/report.pdf"],
		["C:\\Users\\me\\report.pdf", "C:\\Users\\me\\report.pdf"],
		["C:%5CUsers%5Cme%5Creport.pdf", "C:\\Users\\me\\report.pdf"],
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

describe("isStoredAttachmentPath", () => {
	it.each([
		["a POSIX stored path", `/Users/ana/kiroshi/attachments/c7/${MINTED}.pdf`],
		[
			"a Windows stored path with backslashes",
			`C:\\Users\\ana\\AppData\\Roaming\\kiroshi\\attachments\\c7\\${MINTED}.pdf`,
		],
		[
			"a percent-encoded stored path",
			`/Users/ana/Application%20Support/kiroshi/attachments/c7/${MINTED}.pdf`,
		],
		["a stored path with spaces", STORED_FILE],
		["a stored path without extension", `/data/attachments/c7/${MINTED}`],
	])("reads %s as stored", (_, address) => {
		expect(isStoredAttachmentPath(address)).toBe(true)
	})

	it.each([
		["no address", undefined],
		["a code path", "src/lib/host.ts"],
		["a relative path", "../notes/plan.md"],
		["an absolute path outside the store", "/Users/ana/reports/q3.pdf"],
		["a name that is no uuid", "/Users/ana/kiroshi/attachments/c7/q3.pdf"],
		["an uppercase uuid", `/data/attachments/c7/${MINTED.toUpperCase()}.pdf`],
		["no conversation segment", `/data/attachments//${MINTED}.pdf`],
		["too few segments", `attachments/c7/${MINTED}.pdf`],
		["a web address", `https://example.org/attachments/c7/${MINTED}.pdf`],
	])("reads %s as not stored", (_, address) => {
		expect(isStoredAttachmentPath(address)).toBe(false)
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

	it.each([
		[
			"a percent sign that is no escape",
			`/Users/ana/50% off/attachments/c7/${MINTED}.pdf`,
		],
		["a Windows drive path", `C:/Users/me/attachments/c7/${MINTED}.pdf`],
		[
			"a Windows drive path with backslashes",
			`C:\\Users\\me\\attachments\\c7\\${MINTED}.pdf`,
		],
	])("draws the file chip for %s", (_, path) => {
		const html = render({
			children: `Before.\n\nRead [the report](<${path}>).\n\nAfter.`,
			onOpenAttachment: openAttachment,
		})

		expect(html).toContain('aria-label="Open the report"')
		expect(html).toContain("<p>After.</p>")
	})

	it("reads a Windows drive image as its caption without a resolver", () => {
		const html = render({ children: "![The patio](<C:/Users/me/patio.jpg>)" })

		expect(html).toContain("<p>The patio</p>")
		expect(html).not.toContain("<img")
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
		["a code path", "[host.ts](src/lib/host.ts)", "<p>host.ts</p>"],
		["a relative path", "[the plan](../notes/plan.md)", "<p>the plan</p>"],
		[
			"an absolute path outside the store",
			"[the report](</Users/ana/reports/q3 final.pdf>)",
			"<p>the report</p>",
		],
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
