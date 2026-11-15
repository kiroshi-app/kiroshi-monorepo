import { afterEach, describe, expect, it, vi } from "vitest"

import { isCommandAltLetter } from "@workspace/ui/lib/letter-shortcut"

const MAC_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"

const WINDOWS_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"

const LINUX_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)"

const COMMAND_OPTION = { metaKey: true, altKey: true }

const CONTROL_ALT = { ctrlKey: true, altKey: true }

const ALT_GRAPH = { ctrlKey: false, altKey: false }

const NOTHING_HELD = {
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	isComposing: false,
}

const pressed = (agent: string, event: Partial<KeyboardEvent>) => {
	vi.stubGlobal("navigator", { userAgent: agent })
	return isCommandAltLetter({ ...NOTHING_HELD, ...event } as KeyboardEvent, "m")
}

afterEach(() => vi.unstubAllGlobals())

describe("isCommandAltLetter", () => {
	it.each([
		{ layout: "QWERTY", key: "µ", code: "KeyM", keyCode: 77 },
		{ layout: "AZERTY", key: "µ", code: "Semicolon", keyCode: 77 },
		{ layout: "QWERTZ", key: "µ", code: "KeyM", keyCode: 77 },
	])(
		"hears the M key of a $layout keyboard on macOS, where Option rewrites the key",
		({ layout: _, ...key }) => {
			expect(pressed(MAC_AGENT, { ...COMMAND_OPTION, ...key })).toBe(true)
		},
	)

	it.each([
		{ layout: "QWERTY", key: "m", code: "KeyM", keyCode: 77 },
		{ layout: "AZERTY", key: "m", code: "Semicolon", keyCode: 77 },
		{ layout: "Swiss QWERTZ", key: "m", code: "KeyM", keyCode: 77 },
	])(
		"hears the M key of a $layout keyboard on Windows",
		({ layout: _, ...key }) => {
			expect(pressed(WINDOWS_AGENT, { ...CONTROL_ALT, ...key })).toBe(true)
		},
	)

	it.each([
		{ layout: "QWERTY", key: "m", code: "KeyM", keyCode: 77 },
		{ layout: "AZERTY", key: "m", code: "Semicolon", keyCode: 77 },
		{ layout: "QWERTZ", key: "m", code: "KeyM", keyCode: 77 },
	])(
		"hears the M key of a $layout keyboard on Linux",
		({ layout: _, ...key }) => {
			expect(pressed(LINUX_AGENT, { ...CONTROL_ALT, ...key })).toBe(true)
		},
	)

	it.each([
		{
			platform: "macOS",
			agent: MAC_AGENT,
			chord: COMMAND_OPTION,
			key: "∞",
		},
		{
			platform: "Windows",
			agent: WINDOWS_AGENT,
			chord: CONTROL_ALT,
			key: ",",
		},
		{ platform: "Linux", agent: LINUX_AGENT, chord: CONTROL_ALT, key: "," },
	])(
		"leaves the AZERTY comma key alone on $platform",
		({ agent, chord, key }) => {
			expect(
				pressed(agent, { ...chord, key, code: "KeyM", keyCode: 188 }),
			).toBe(false)
		},
	)

	it.each([
		{
			layout: "QWERTY semicolon",
			key: "…",
			code: "Semicolon",
			keyCode: 186,
		},
		{ layout: "QWERTZ ö", key: "œ", code: "Semicolon", keyCode: 186 },
	])("leaves the $layout key alone on macOS", ({ layout: _, ...key }) => {
		expect(pressed(MAC_AGENT, { ...COMMAND_OPTION, ...key })).toBe(false)
	})

	it("leaves AltGr typing µ on a German QWERTZ keyboard on Windows, which reports Ctrl+Alt+M as AltGr", () => {
		expect(
			pressed(WINDOWS_AGENT, {
				...ALT_GRAPH,
				key: "µ",
				code: "KeyM",
				keyCode: 77,
			}),
		).toBe(false)
	})

	it("falls back to the physical position when the engine reports neither a Latin letter nor a key code", () => {
		const cyrillic = { ...CONTROL_ALT, key: "ь", keyCode: 0 }

		expect(pressed(LINUX_AGENT, { ...cyrillic, code: "KeyM" })).toBe(true)
		expect(pressed(LINUX_AGENT, { ...cyrillic, code: "Semicolon" })).toBe(false)
	})

	it("ignores the chord while an IME composes", () => {
		const key = { ...COMMAND_OPTION, key: "m", code: "KeyM" }

		expect(pressed(MAC_AGENT, { ...key, keyCode: 77, isComposing: true })).toBe(
			false,
		)
		expect(pressed(MAC_AGENT, { ...key, keyCode: 229 })).toBe(false)
	})

	it("ignores the letter without the platform chord", () => {
		const key = { key: "m", code: "KeyM", keyCode: 77 }

		expect(pressed(MAC_AGENT, { ...key, metaKey: true })).toBe(false)
		expect(pressed(MAC_AGENT, { ...key, ...CONTROL_ALT })).toBe(false)
		expect(pressed(WINDOWS_AGENT, { ...key, ...COMMAND_OPTION })).toBe(false)
		expect(pressed(LINUX_AGENT, { ...key, ctrlKey: true })).toBe(false)
	})
})
