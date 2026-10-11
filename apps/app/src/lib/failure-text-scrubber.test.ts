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
		["refused with token: abc123", "refused with token: [redacted]"],
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

	it.each([
		[
			"error sending request for url (http://192.168.1.20:45367/invoke/send_message)",
			"error sending request for url ([redacted])",
		],
		[
			"https://relay.kiroshi.app/spaces/garage?invite=abc123 refused",
			"[redacted] refused",
		],
		[
			"ws://127.0.0.1:45367/api/events?token=abc123 closed",
			"[redacted] closed",
		],
		["wss://relay.kiroshi.app/member closed", "[redacted] closed"],
		["couldn't read file:///Users/ada/notes.md", "couldn't read [redacted]"],
		["tauri://localhost/index.html failed", "[redacted] failed"],
		[
			"asset://localhost/%2FUsers%2Fada%2Favatar.png is missing",
			"[redacted] is missing",
		],
	])("masks the whole URL in %s", (text, scrubbed) => {
		expect(scrubFailureText(text)).toBe(scrubbed)
	})

	it.each([
		[
			"connection refused by 192.168.1.20:45367",
			"connection refused by [redacted]",
		],
		[
			"connection refused by mac-mini.local:45367",
			"connection refused by [redacted]",
		],
		[
			"connection refused by localhost:1420",
			"connection refused by [redacted]",
		],
		["connection refused by [::1]:45367", "connection refused by [redacted]"],
	])("masks the bare host with its port in %s", (text, scrubbed) => {
		expect(scrubFailureText(text)).toBe(scrubbed)
	})

	it.each([
		"4f1c2e9a-7b3d-4c8e-9a1f-2b6d8e0c4a7f",
		"00000000-0000-0000-0000-000000000000",
		"ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB",
	])("masks the UUID %s", (uuid) => {
		expect(scrubFailureText(`no conversation ${uuid} here`)).toBe(
			"no conversation [redacted] here",
		)
	})

	it("keeps a home path outside a URL rewritten to ~ beside a masked URL", () => {
		expect(
			scrubFailureText(
				"couldn't upload /Users/ada/notes.md to https://relay.kiroshi.app/upload",
			),
		).toBe("couldn't upload ~/notes.md to [redacted]")
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
