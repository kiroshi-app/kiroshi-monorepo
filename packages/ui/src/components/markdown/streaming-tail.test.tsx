import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"
import { Markdown } from "@workspace/ui/components/markdown"

const renderWriting = (source: string) =>
	renderToStaticMarkup(
		<I18nProvider>
			<Markdown isWriting>{source}</Markdown>
		</I18nProvider>,
	)

const renderComplete = (source: string) =>
	renderToStaticMarkup(
		<I18nProvider>
			<Markdown>{source}</Markdown>
		</I18nProvider>,
	)

const STREAMING_WORD =
	/data-slot="markdown-streaming-word" data-step="(\d)"[^>]*>([^<]+)</g

const tailOf = (html: string) =>
	Array.from(html.matchAll(STREAMING_WORD), ([, step, word]) => [
		word,
		Number(step),
	])

describe("streaming tail", () => {
	it("softens the last three words of the line being written, the last the most", () => {
		expect(tailOf(renderWriting("one two three four five"))).toEqual([
			["two", 0],
			["three", 1],
			["four", 2],
			["five", 3],
		])
	})

	it("keeps counting through emphasis", () => {
		expect(tailOf(renderWriting("one two **three four**"))).toEqual([
			["one", 0],
			["two", 1],
			["three", 2],
			["four", 3],
		])
	})

	it("takes the last line of the reply, a list item included", () => {
		expect(tailOf(renderWriting("Lead in.\n\n- first item\n- second"))).toEqual(
			[["second", 3]],
		)
	})

	it("stops at inline code", () => {
		expect(tailOf(renderWriting("one two `three` four"))).toEqual([["four", 3]])
		expect(tailOf(renderWriting("one two `three`"))).toEqual([])
	})

	it("softens nothing while a code block is being written", () => {
		expect(tailOf(renderWriting("one two\n\n```ts\nconst three = 4"))).toEqual(
			[],
		)
	})

	it("leaves the words of the line as written", () => {
		expect(renderWriting("one  two three four five ")).toContain(
			'<p>one  <span data-slot="markdown-streaming-word" data-step="0"',
		)
		expect(
			renderWriting("one two three four five").replace(/<[^>]+>/g, ""),
		).toBe("one two three four five")
	})

	it("softens nothing once the reply is complete", () => {
		expect(tailOf(renderComplete("one two three four five"))).toEqual([])
	})
})
