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
		[
			"connection refused by mac-mini:45367",
			"connection refused by [redacted]",
		],
		["connection refused by studio:45367", "connection refused by [redacted]"],
	])("masks the bare host with its port in %s", (text, scrubbed) => {
		expect(scrubFailureText(text)).toBe(scrubbed)
	})

	it.each([
		"file.ts:42",
		"src/app.tsx:120:7",
		"chat-controller.ts:88",
		"src-tauri/src/hosting/mod.rs:240",
		"at <anonymous>:1:2",
	])("keeps the source reference %s", (reference) => {
		expect(scrubFailureText(`thrown from ${reference}`)).toBe(
			`thrown from ${reference}`,
		)
	})

	it.each([
		["the Anthropic message id", "msg_01XFDUDYJgAACzvnptvVoYEL"],
		["the Anthropic tool use id", "toolu_01A09q90qw90lq917835lq9"],
		["the Anthropic server tool use id", "srvtoolu_01ABCdefGHIjklMNOpqr"],
		["the Anthropic request id", "req_011CSHoEeqs5C35K2UUqR7Fy"],
		["a hyphenless UUID", "4f1c2e9a7b3d4c8e9a1f2b6d8e0c4a7f"],
	])("masks %s", (_shape, id) => {
		expect(scrubFailureText(`the agent refused ${id} (overloaded)`)).toBe(
			"the agent refused [redacted] (overloaded)",
		)
	})

	it("masks an id quoted in a relayed JSON error", () => {
		expect(
			scrubFailureText(
				'{"error":"overloaded","request_id":"req_011CSHoEeqs5C35K2UUqR7Fy"}',
			),
		).toBe('{"error":"overloaded","request_id":"[redacted]"}')
	})

	it.each([
		"reopen_session failed",
		"bot_list answered 500 after 3 retries",
		"conversation_list_v2 is unknown",
		"retried at 2026-10-11T09:30:00.000Z",
	])("leaves the command names, words and numbers of %s untouched", (text) => {
		expect(scrubFailureText(text)).toBe(text)
	})

	it("lets the Kiroshi ids and the agent session id through while it masks the URL, the home path, the email and the token", () => {
		expect(
			scrubFailureText(
				"space 4f1c2e9a-7b3d-4c8e-9a1f-2b6d8e0c4a7f conversation ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB session 00000000-0000-0000-0000-000000000000 failed reading /Users/ada/notes.md from https://relay.kiroshi.app/upload for ada@example.com with Bearer k1r0sh1-host-bearer-0042",
			),
		).toBe(
			"space 4f1c2e9a-7b3d-4c8e-9a1f-2b6d8e0c4a7f conversation ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB session 00000000-0000-0000-0000-000000000000 failed reading ~/notes.md from [redacted] for [redacted] with Bearer [redacted]",
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
