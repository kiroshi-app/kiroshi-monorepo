import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown } from "@workspace/ui/components/markdown"
import { RosterProvider } from "@workspace/ui/components/roster"
import { prepareHighlighter } from "@workspace/ui/lib/code-highlight"

prepareHighlighter()

const FOOTNOTE_SOURCE = "Claim[^1]\n\n[^1]: the proof\n"

const ALIGNED_TABLE =
	"| left | centre | right | default |\n| :--- | :---: | ---: | --- |\n| a | b | c | d |"

const MALFORMED_TABLE = "| a | b\n| ---\n| 1"

const render = (source: string) =>
	renderToStaticMarkup(
		createElement(I18nProvider, null, createElement(Markdown, null, source)),
	)

const renderTwice = (source: string) =>
	renderToStaticMarkup(
		createElement(
			I18nProvider,
			null,
			createElement(
				"div",
				null,
				createElement(Markdown, null, source),
				createElement(Markdown, null, source),
			),
		),
	)
		.split('<div data-slot="markdown"')
		.slice(1)

const capturedValues = (html: string, pattern: RegExp) =>
	[...html.matchAll(pattern)].map(([, value]) => value)

const definitionIds = (html: string) => capturedValues(html, /id="([^"]+)"/g)

const referenceFragments = (html: string) =>
	capturedValues(html, /href="#([^"]+)"/g)

const tokenColours = (html: string, theme: "light" | "dark") =>
	capturedValues(html, new RegExp(`--code-token-${theme}:([^;"]+)`, "g"))

describe("markdown constructions", () => {
	it("renders headings, emphasis and inline code", () => {
		const html = render(
			"# Title with `code`\n\n**bold** _italic_ ~~struck~~ `inline`",
		)

		expect(html).toContain("<h1>Title with <code>code</code></h1>")
		expect(html).toContain("<strong>bold</strong>")
		expect(html).toContain("<em>italic</em>")
		expect(html).toContain("<del>struck</del>")
	})

	it("renders lists nested three levels deep", () => {
		const html = render("- one\n\t- two\n\t\t- three\n\n1. first\n2. second")

		expect(html).toContain("<ol>")
		expect(html.match(/<ul>/g)).toHaveLength(3)
	})

	it("renders task lists as read-only named checkboxes", () => {
		const html = render("- [x] shipped\n- [ ] pending")

		expect(html).toContain('class="task-list-item"')
		expect(html).toContain('aria-label="Done"')
		expect(html).toContain('aria-label="To do"')
		expect(html.match(/disabled=""/g)).toHaveLength(2)
		expect(html.match(/checked=""/g)).toHaveLength(1)
	})

	it("renders blockquotes, thematic breaks and tables", () => {
		const html = render(
			"> quoted\n>\n> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n\n---\n",
		)

		expect(html).toContain("<blockquote>")
		expect(html).toContain("<hr/>")
		expect(html).toContain('data-slot="markdown-table"')
		expect(html).toContain("<thead><tr><th")
	})

	it("links a footnote to its definition", () => {
		const html = render(FOOTNOTE_SOURCE)
		const [reference] = referenceFragments(html)

		expect(reference).toBeDefined()
		expect(definitionIds(html)).toContain(reference)
	})

	it("keeps footnote ids distinct across instances on one page", () => {
		const [first, second] = renderTwice(FOOTNOTE_SOURCE)

		expect(definitionIds(first)).not.toEqual(definitionIds(second))
		expect(definitionIds(first)).toContain(referenceFragments(first)[0])
		expect(definitionIds(second)).toContain(referenceFragments(second)[0])
	})

	it("renders autolinks", () => {
		const html = render("Docs at https://kiroshi.dev and me@kiroshi.dev")

		expect(html).toContain('<a href="https://kiroshi.dev"')
		expect(html).toContain('<a href="mailto:me@kiroshi.dev"')
	})

	const HIGHLIGHTED_FENCES = [
		"```ts\nconst nest = 1\n```",
		"```rust\nlet nest: usize = 1;\n```",
		"```python\nnest = read_nest(42)\n```",
		"```css\n.nest { color: red; }\n```",
		'```html\n<p class="nest">hi</p>\n```',
		"```yaml\nnest: 42\n```",
		"```md\n# Nest **42**\n```",
	]

	it.each(HIGHLIGHTED_FENCES)("paints more than one colour in %j", (source) => {
		const html = render(source)

		expect(new Set(tokenColours(html, "light")).size).toBeGreaterThan(1)
		expect(new Set(tokenColours(html, "dark")).size).toBeGreaterThan(1)
	})

	it("shows a long fence as source text before painting it", () => {
		const source = Array.from(
			{ length: 240 },
			(_, index) => `const nest${index} = ${index}`,
		).join("\n")
		const html = render(`\`\`\`ts\n${source}\n\`\`\``)

		expect(html).toContain("const nest239 = 239")
		expect(tokenColours(html, "light")).toEqual([])
	})

	it("renders an unknown fence label as its source text, unpainted", () => {
		const html = render("```elixir\n%{id: nest.id}\n```")

		expect(html).toContain("%{id: nest.id}")
		expect(new Set(tokenColours(html, "light"))).toEqual(
			new Set(["currentColor"]),
		)
	})
})

describe("markdown math and diagrams", () => {
	it("holds an inline expression as its source until the typesetter lands", () => {
		const html = render("The window is $\\Delta t < 250$ ms.")

		expect(html).toContain(">\\Delta t &lt; 250<")
		expect(html).not.toContain("<code")
	})

	it("gives a display expression a block of its own", () => {
		const html = render("$$\nc(n) = \\sum_{i=1}^{n} o_i\n$$")

		expect(html).toContain("c(n) = \\sum_{i=1}^{n} o_i")
		expect(html).not.toContain("<p>")
	})

	it("leaves a lone dollar sign in the prose", () => {
		expect(render("The plan costs $5 a month.")).toContain(
			"The plan costs $5 a month.",
		)
	})

	it("holds a diagram as its source until mermaid lands, never as code", () => {
		const html = render("```mermaid\nflowchart TD\n\tA --> B\n```")

		expect(html).toContain("flowchart TD")
		expect(html).not.toContain("Code snippet")
	})
})

describe("markdown tables", () => {
	it("keeps every declared column alignment", () => {
		const html = render(ALIGNED_TABLE)

		expect(html.match(/text-align:left/g)).toHaveLength(2)
		expect(html.match(/text-align:center/g)).toHaveLength(2)
		expect(html.match(/text-align:right/g)).toHaveLength(2)
	})

	it("frames the table in a scrollable region with a copy action", () => {
		const html = render(ALIGNED_TABLE)

		expect(html).toContain('aria-label="Table"')
		expect(html).toContain('aria-label="Copy table"')
	})
})

describe("markdown raw html", () => {
	const ENTITIES: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#x27;",
	}

	const asSourceText = (source: string) =>
		source.replace(/[&<>"']/g, (character) => ENTITIES[character])

	const bodyOf = (html: string) =>
		html.replace(/^<div [^>]*>/, "").replace(/<\/div>$/, "")

	const elementsIn = (html: string) =>
		new Set(capturedValues(html, /<\/?([a-z][\w-]*)/gi))

	const HOSTILE = [
		'<script>alert("nest")</script>',
		"<style>body{display:none}</style>",
		'<iframe src="https://evil.test"></iframe>',
		'<img src="x" onerror="alert(1)" />',
		'<p onclick="alert(1)">tap</p>',
		'<a href="javascript:alert(1)">go</a>',
		'<body onload="alert(1)">',
		'<svg><animate onbegin="alert(1)" /></svg>',
	]

	it.each(HOSTILE)("shows %j as the source it was written with", (source) => {
		expect(bodyOf(render(source))).toBe(`<p>${asSourceText(source)}</p>`)
	})

	it.each(HOSTILE)("builds nothing %j declares", (source) => {
		const html = render(source)

		expect(elementsIn(html)).toEqual(new Set(["div", "p"]))
		expect(html).not.toMatch(/\s(href|on[a-z]+|src)="/)
	})

	it("keeps the prose around raw html rendered as markdown", () => {
		const html = render("The **tag** is <b>bold</b> in this _sentence_.")

		expect(html).toContain(
			"<p>The <strong>tag</strong> is &lt;b&gt;bold&lt;/b&gt; in this <em>sentence</em>.</p>",
		)
	})

	it("keeps the line breaks and the indentation of a block of source", () => {
		const source = '<section class="report">\n\t<h2>Occupants</h2>\n</section>'

		expect(render(source)).toContain(asSourceText(source))
	})

	const NESTED_IN_LIST_ITEM = [
		"- <div>\n    <span>x</span>\n  </div>",
		"- ```ts\n  const a = 1\n  ```\n  <div>\n    <span>x</span>\n  </div>",
		"- | a |\n  | --- |\n  | 1 |\n  <div>\n    <span>x</span>\n  </div>",
		"- > quoted\n  <div>\n    <span>x</span>\n  </div>",
		"- - inner\n  <div>\n    <span>x</span>\n  </div>",
	]

	it.each(NESTED_IN_LIST_ITEM)(
		"keeps the source a block of its own in %j",
		(source) => {
			expect(render(source)).toContain(
				"<p>&lt;div&gt;\n  &lt;span&gt;x&lt;/span&gt;\n&lt;/div&gt;</p>",
			)
		},
	)

	it("leaves a list holding no raw html tight", () => {
		expect(render("- one\n- two")).toContain("<li>one</li>")
	})

	it("shows source held by a quote, a list item and a cell alike", () => {
		expect(render("> <b>quoted</b>")).toContain(
			"<blockquote>\n<p>&lt;b&gt;quoted&lt;/b&gt;</p>\n</blockquote>",
		)
		expect(render("- <b>listed</b>")).toContain("&lt;b&gt;listed&lt;/b&gt;")
		expect(render("| a |\n| --- |\n| <b>celled</b> |")).toContain(
			"<td>&lt;b&gt;celled&lt;/b&gt;</td>",
		)
	})
})

describe("markdown sanitizing", () => {
	it("drops javascript urls while keeping the link text", () => {
		const html = render("[go](javascript:alert(1)) and [safe](https://ok.test)")

		expect(html).not.toContain("javascript:")
		expect(html).toContain("go")
		expect(html).toContain('href="https://ok.test"')
	})
})

describe("markdown links", () => {
	const EXTERNAL = 'target="_blank" rel="noreferrer noopener"'

	const shownHost = (html: string) =>
		capturedValues(html, /data-slot="markdown-link-host"[^>]*>\(([^)]+)\)/g)

	const DECEIVING = [
		{
			case: "userinfo before the host",
			source:
				"[https://kiroshi.dev@evil.test/reports](https://kiroshi.dev@evil.test/reports)",
			host: "evil.test",
		},
		{
			case: "text without a scheme",
			source: "[kiroshi.dev/download](https://evil.test/payload)",
			host: "evil.test",
		},
		{
			case: "punycode homograph",
			source:
				"[https://\u043Epennest.dev/login](https://\u043Epennest.dev/login)",
			host: "xn--pennest-8ig.dev",
		},
		{
			case: "emphasis instead of a plain string",
			source: "[**https://kiroshi.dev**](https://evil.test/steal)",
			host: "evil.test",
		},
		{
			case: "protocol-relative href",
			source: "[https://kiroshi.dev](//evil.test/steal)",
			host: "evil.test",
		},
	]

	it.each(DECEIVING)(
		"shows the destination past a $case",
		({ source, host }) => {
			const html = render(source)

			expect(shownHost(html)).toEqual([host])
			expect(html).toContain(EXTERNAL)
		},
	)

	it("keeps a mailto under url text in the mail client, not in a window", () => {
		const html = render("[https://kiroshi.dev](mailto:steal@evil.test)")

		expect(html).toContain('href="mailto:steal@evil.test"')
		expect(html).not.toContain("target=")
		expect(shownHost(html)).toEqual([])
	})

	it("shows the destination of an ordinary link and of an autolink alike", () => {
		expect(
			shownHost(render("[the changelog](https://kiroshi.dev/changelog)")),
		).toEqual(["kiroshi.dev"])
		expect(shownHost(render("Docs at https://kiroshi.dev/docs"))).toEqual([
			"kiroshi.dev",
		])
	})

	it("keeps the link text whatever the destination says", () => {
		expect(render("[the changelog](https://evil.test)")).toContain(
			">the changelog</span>",
		)
	})

	it("opens an external link in a new window without leaking the referrer", () => {
		expect(render("[docs](https://kiroshi.dev)")).toContain(EXTERNAL)
	})

	it("shows a subdomain as it stands", () => {
		expect(
			shownHost(render("[roadmap](https://www.kiroshi.dev/roadmap)")),
		).toEqual(["www.kiroshi.dev"])
	})

	it("keeps a fragment in the document", () => {
		const html = render("[summary](#summary)")

		expect(html).toContain('href="#summary"')
		expect(html).not.toContain("target=")
	})

	it("keeps a footnote reference and its backlink in the document", () => {
		expect(render(FOOTNOTE_SOURCE)).not.toContain("target=")
	})

	it("keeps a mailto autolink in place", () => {
		const html = render("Write to me@kiroshi.dev")

		expect(html).toContain('href="mailto:me@kiroshi.dev"')
		expect(html).not.toContain("target=")
	})

	it("renders a tel link as plain text while the allowlist drops it", () => {
		expect(render("[call us](tel:+33123456789)")).not.toContain("<a")
	})

	it("renders a scheme it cannot open as plain text", () => {
		expect(render("[join](irc://kiroshi.dev/nest)")).not.toContain("<a")
	})

	it("renders a path that would resolve against this window as plain text", () => {
		expect(render("[settings](/settings)")).not.toContain("<a")
	})

	it("truncates the text of a link and never its destination", () => {
		const html = render("https://kiroshi.dev/a/very/long/path")

		expect(html).toContain("truncate")
		expect(html).toContain("whitespace-nowrap")
	})

	it("marks a destination with an initial drawn from the host itself", () => {
		const html = render("[roadmap](https://www.kiroshi.dev/roadmap)")

		expect(html).toContain(">k<")
		expect(html).toContain('aria-hidden="true"')
		expect(html).toContain("select-none")
	})

	it("marks an internationalized host with the letter its reader sees, and spells it in punycode all the same", () => {
		const html = render("[login](https://\u043Epennest.dev/login)")

		expect(html).toContain(">\u043E<")
		expect(html).toContain("(xn--pennest-8ig.dev)")
	})

	it("marks an address with a neutral glyph instead of a digit", () => {
		expect(render("[admin](https://192.168.1.1/admin)")).toContain(">\u2022<")
	})

	it("renders a transcript of hosts without anything that would fetch", () => {
		const html = render(
			"[the spec](https://html.spec.whatwg.org/multipage/links.html), [a search](https://www.google.com/search?q=nest) and [a tracker](https://tracker.internal.test/issue/42)",
		)

		expect(html).not.toMatch(/<(img|iframe|object|embed)[\s>]/)
		expect(html).not.toContain("/favicon")
	})

	it("separates the text from its destination with a real space", () => {
		expect(render("[roadmap](https://kiroshi.dev)")).toContain("</span> <span")
	})
})

describe("markdown resilience", () => {
	const MALFORMED = [
		"# unclosed **bold and `code",
		MALFORMED_TABLE,
		"[broken](https://ok.test\n\n> quote without end",
		"- [x unclosed task\n\t- [ ]",
		"```ts\nconst never = closed",
		":::unknown-block\ncontent\n:::",
		"$\\frac{1}{$ and $$\\begin{bmatrix} 1 & 2 \\\\ 3$$",
		"```mermaid\nflowchart TD\n\tA[Read] -->\n\t--> {{\n```",
	]

	it.each(MALFORMED)("does not throw on %j", (source) => {
		expect(() => render(source)).not.toThrow()
	})

	it("keeps malformed source readable", () => {
		expect(render(MALFORMED_TABLE)).toContain("| a | b")
	})

	it("renders an empty string without content", () => {
		expect(render("")).toMatch(/^<div [^>]*><\/div>$/)
	})
})

describe("companion mentions", () => {
	const ATLAS = { id: "bot-atlas", name: "Atlas" }

	const count = (html: string, needle: string) => html.split(needle).length - 1

	const renderInConversation = (source: string) =>
		renderToStaticMarkup(
			createElement(
				I18nProvider,
				null,
				createElement(
					RosterProvider,
					{ bots: [ATLAS] },
					createElement(Markdown, null, source),
				),
			),
		)

	it("draws a mention of a known companion as a chip", () => {
		const html = renderInConversation("ask <@bot-atlas> for the notes")

		expect(html).toContain('data-slot="bot-mention"')
		expect(html).toContain("Atlas")
		expect(html).not.toContain("&lt;@bot-atlas&gt;")
	})

	it("draws a mention of an unknown companion as an unknown chip", () => {
		const html = renderInConversation("ask <@bot-ghost> instead")

		expect(html).toContain('data-unknown="true"')
		expect(html).toContain("Unknown agent")
	})

	it("keeps a mention written in code literal", () => {
		const html = renderInConversation("write `<@bot-atlas>` to name it")

		expect(html).not.toContain('data-slot="bot-mention"')
		expect(html).toContain("&lt;@bot-atlas&gt;")
	})

	it("keeps the words around a mention", () => {
		const html = renderInConversation("**ask** <@bot-atlas> now")

		expect(html).toContain("<strong>ask</strong>")
		expect(html).toContain(" now</p>")
	})

	it("draws repeated mentions of one companion as a single counted chip", () => {
		const html = renderInConversation(
			"ask <@bot-atlas> <@bot-atlas> to split it",
		)

		expect(count(html, 'data-slot="bot-mention"')).toBe(1)
		expect(html).toContain('data-slot="bot-mention-count"')
		expect(html).toContain("×2")
		expect(html).toContain("ask ")
		expect(html).toContain(" to split it")
	})

	it("draws a chip per token when words separate the repeats", () => {
		const html = renderInConversation("ask <@bot-atlas> then <@bot-atlas>")

		expect(count(html, 'data-slot="bot-mention"')).toBe(2)
		expect(html).not.toContain('data-slot="bot-mention-count"')
	})

	it("draws a chip per token when adjacent mentions name different companions", () => {
		const html = renderInConversation("ask <@bot-atlas> <@bot-ghost> now")

		expect(count(html, 'data-slot="bot-mention"')).toBe(2)
		expect(html).not.toContain('data-slot="bot-mention-count"')
	})

	it("counts repeats of an id the roster cannot resolve", () => {
		const html = renderInConversation("<@bot-ghost> <@bot-ghost> held the lock")

		expect(count(html, 'data-slot="bot-mention"')).toBe(1)
		expect(html).toContain("Unknown agent")
		expect(html).toContain("2 mentions")
	})

	it("leaves text without a mention untouched", () => {
		expect(renderInConversation("nothing here <@ or @companion")).not.toContain(
			'data-slot="bot-mention"',
		)
	})
})
