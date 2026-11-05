import { describe, expect, it } from "vitest"

import { withCitedFileLabels } from "./cited-file-labels"

import type { SnippetPart } from "@/lib/bindings"

const PATH =
	"/Users/sam/Library/Application Support/com.kiroshi.app/attachments/conv-1/0b1e7c52-6a1f-4c7e-9d3a-2f8e4b6c1a90.png"

const plain = (text: string): SnippetPart => ({ text, matched: false })
const matched = (text: string): SnippetPart => ({ text, matched: true })

describe("a search snippet citing a file", () => {
	it("keeps the label of a whole citation and its matched word", () => {
		expect(
			withCitedFileLabels([
				plain("See ![Harbour "),
				matched("chart"),
				plain(`](<${PATH}>) below`),
			]),
		).toEqual([plain("See Harbour "), matched("chart"), plain(" below")])
	})

	it("drops a matched word that sits inside the path", () => {
		expect(
			withCitedFileLabels([
				plain("See [the brief](</Users/sam/"),
				matched("attachments"),
				plain("/conv-1/brief.pdf>) below"),
			]),
		).toEqual([plain("See the brief below")])
	})

	it("keeps the label of a citation the snippet cuts in its path", () => {
		expect(
			withCitedFileLabels([
				plain("…the "),
				matched("chart"),
				plain(" is ![Harbour chart](</Users/sam/Library/Application…"),
			]),
		).toEqual([plain("…the "), matched("chart"), plain(" is Harbour chart…")])
	})

	it("drops the tail of a path the snippet opens in", () => {
		expect(
			withCitedFileLabels([
				plain("…conv-1/0b1e7c52.png>) and the "),
				matched("harbour"),
			]),
		).toEqual([plain("… and the "), matched("harbour")])
	})

	it("drops the tail of a citation the snippet opens in its label", () => {
		expect(
			withCitedFileLabels([
				plain(`…chart](<${PATH}>) and the `),
				matched("harbour"),
			]),
		).toEqual([plain("…chart and the "), matched("harbour")])
	})

	it("keeps the label of a citation the snippet cuts in its label", () => {
		expect(
			withCitedFileLabels([matched("Harbour"), plain(" is ![Harbour ch…")]),
		).toEqual([matched("Harbour"), plain(" is Harbour ch…")])
	})

	it("leaves a snippet without citations as it is", () => {
		const snippet = [plain("the "), matched("harbour"), plain(" at dawn")]

		expect(withCitedFileLabels(snippet)).toEqual(snippet)
	})
})
