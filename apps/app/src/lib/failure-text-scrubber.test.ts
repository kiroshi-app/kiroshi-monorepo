import { describe, expect, it } from "vitest"

import { scrubFailureText } from "./failure-text-scrubber"

describe("scrubFailureText", () => {
	it.each([
		["/Users/shoto/Library/kiroshi/store.db", "~/Library/kiroshi/store.db"],
		["/home/shoto/.config/kiroshi", "~/.config/kiroshi"],
		["C:\\Users\\shoto\\AppData\\kiroshi", "~\\AppData\\kiroshi"],
	])("writes ~ in place of the home directory of %s", (path, scrubbed) => {
		expect(scrubFailureText(`couldn't open ${path}`)).toBe(
			`couldn't open ${scrubbed}`,
		)
	})

	it("masks a bearer", () => {
		expect(
			scrubFailureText("authorization: Bearer abc.def-ghi_123 was refused"),
		).toBe("authorization: Bearer [redacted] was refused")
	})

	it.each([
		["token=k1r0sh1-t0ken", "token=[redacted]"],
		['"access_token": "abc123"', '"access_token": "[redacted]"'],
		[
			"ws://127.0.0.1:45367/api/events?token=abc123",
			"ws://127.0.0.1:45367/api/events?token=[redacted]",
		],
	])("masks the token in %s", (text, scrubbed) => {
		expect(scrubFailureText(text)).toBe(scrubbed)
	})

	it.each([
		["api_key=AIzaSyD4-not-a-real-key", "api_key=[redacted]"],
		[
			"the key sk-ant-api03-abcdefghijklmnop expired",
			"the key [redacted] expired",
		],
		["ghp_abcdefghijklmnopqrstuvwxyz0123 is revoked", "[redacted] is revoked"],
	])("masks the key in %s", (text, scrubbed) => {
		expect(scrubFailureText(text)).toBe(scrubbed)
	})

	it("masks a secret-looking string", () => {
		expect(
			scrubFailureText("signature 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b"),
		).toBe("signature [redacted]")
	})

	it("masks an email", () => {
		expect(
			scrubFailureText("no account for ada+kiroshi@mail.example.com"),
		).toBe("no account for [redacted]")
	})

	it("leaves a plain failure untouched", () => {
		expect(scrubFailureText("the host of this space is offline")).toBe(
			"the host of this space is offline",
		)
	})
})
