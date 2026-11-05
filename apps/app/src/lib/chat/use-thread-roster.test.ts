// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ReplyTarget } from "./screen-model"
import { useThreadNaming } from "./use-thread-roster"

const READER = "Sam"

const targetBy = (authorAccountId: string | null): ReplyTarget => ({
	messageId: "m-1",
	role: "user",
	excerpt: "hello",
	authorBotId: null,
	authorAccountId,
	authorName: authorAccountId ? "Tom" : null,
})

const renderNaming = () =>
	renderHook(() =>
		useThreadNaming({
			bots: [],
			present: [],
			authors: new Map(),
			botFace: null,
			reader: READER,
			unnamed: "No name",
			personOf: (author) =>
				author.authorAccountId === "account-tom"
					? (author.authorName ?? undefined)
					: undefined,
			isConversation: true,
			onJump: () => undefined,
		}),
	)

const quotedAuthorOf = (target: ReplyTarget) =>
	renderNaming().result.current.toQuote(target).author

describe("the author a reply quotes", () => {
	it("names another person's message after that person", () => {
		expect(quotedAuthorOf(targetBy("account-tom"))).toBe("Tom")
	})

	it("names the reader's own message after the reader", () => {
		expect(quotedAuthorOf(targetBy(null))).toBe(READER)
	})
})

const CITED_IMAGE =
	"/Users/sam/Library/Application Support/com.kiroshi.app/attachments/conv-1/0b1e7c52-6a1f-4c7e-9d3a-2f8e4b6c1a90.png"

describe("the excerpt of a message citing a file", () => {
	it("shows the file label, never the Markdown nor the path", () => {
		const cited = `Here is ![Harbour chart](<${CITED_IMAGE}>) for you`

		expect(renderNaming().result.current.toExcerpt(cited)).toBe(
			"Here is Harbour chart for you",
		)
	})
})
