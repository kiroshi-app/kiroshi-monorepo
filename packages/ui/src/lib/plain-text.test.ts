import { describe, expect, it } from "vitest"

import { toPlainText } from "@workspace/ui/lib/plain-text"

describe("toPlainText", () => {
	it("drops emphasis marks", () => {
		expect(toPlainText("**Ran** the *suite* ~~twice~~, __both__ _green_")).toBe(
			"Ran the suite twice, both green",
		)
	})

	it("drops heading marks", () => {
		expect(toPlainText("### Release notes")).toBe("Release notes")
		expect(toPlainText("## Release notes ##")).toBe("Release notes")
	})

	it("drops list markers", () => {
		expect(toPlainText("- first\n* second\n+ third\n1. fourth\n2) fifth")).toBe(
			"first second third fourth fifth",
		)
	})

	it("drops task list markers", () => {
		expect(toPlainText("- [x] shipped\n- [ ] pending")).toBe("shipped pending")
	})

	it("drops blockquote markers", () => {
		expect(toPlainText("> > quoted words")).toBe("quoted words")
	})

	it("keeps the words of a link and drops its target", () => {
		expect(toPlainText("See [the report](https://example.com/report)")).toBe(
			"See the report",
		)
		expect(toPlainText("See [the report][one]")).toBe("See the report")
		expect(toPlainText("See <https://example.com>")).toBe(
			"See https://example.com",
		)
	})

	it("keeps the alt text of an image and drops its target", () => {
		expect(toPlainText("![the chart](chart.png) landed")).toBe(
			"the chart landed",
		)
	})

	it("drops inline code marks", () => {
		expect(toPlainText("Renamed `createChatDriver` today")).toBe(
			"Renamed createChatDriver today",
		)
	})

	it("drops fenced code marks and the language", () => {
		expect(toPlainText("Try:\n```ts\nconst a = 1\n```")).toBe(
			"Try: const a = 1",
		)
	})

	it("drops thematic breaks", () => {
		expect(toPlainText("before\n\n---\n\nafter")).toBe("before after")
	})

	it("reads several lines as one line", () => {
		expect(toPlainText("first line\n\nsecond line\nthird line")).toBe(
			"first line second line third line",
		)
	})

	it("leaves a message without markup unchanged", () => {
		expect(toPlainText("Ran the suite twice, both green.")).toBe(
			"Ran the suite twice, both green.",
		)
		expect(toPlainText("Renamed create_chat_driver to 2 * 3 today")).toBe(
			"Renamed create_chat_driver to 2 * 3 today",
		)
	})
})
