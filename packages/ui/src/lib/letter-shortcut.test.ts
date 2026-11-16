import { afterEach, describe, expect, it, vi } from "vitest"

import {
	isCommandAltLetter,
	isControlShiftLetterOffMac,
} from "@workspace/ui/lib/letter-shortcut"

const MAC_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"

const WINDOWS_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"

const LINUX_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)"

const COMMAND_OPTION = { metaKey: true, altKey: true }

const CONTROL_ALT = { ctrlKey: true, altKey: true }

const CONTROL_SHIFT = { ctrlKey: true, shiftKey: true }

const ALT_GRAPH = {
	getModifierState: (modifier: string) => modifier === "AltGraph",
}

const NOTHING_HELD = {
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	isComposing: false,
}

const eventOn = (agent: string, event: Partial<KeyboardEvent>) => {
	vi.stubGlobal("navigator", { userAgent: agent })
	return { ...NOTHING_HELD, ...event } as KeyboardEvent
}

const pressed = (agent: string, event: Partial<KeyboardEvent>) =>
	isCommandAltLetter(eventOn(agent, event), "m")

const pressedWithShift = (agent: string, event: Partial<KeyboardEvent>) =>
	isControlShiftLetterOffMac(eventOn(agent, event), "m")

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
		"hears the M key of a $layout keyboard on Linux, where WebKitGTK builds the event in Source/WebKit/Shared/gtk/WebEventFactory.cpp",
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

	it("leaves µ typed on a German QWERTZ keyboard on Windows, where Chromium reports Ctrl+Alt+M and AltGr+M as one AltGraph event in ui/events/keycodes/platform_key_map_win.cc", () => {
		expect(
			pressed(WINDOWS_AGENT, {
				...ALT_GRAPH,
				key: "µ",
				code: "KeyM",
				keyCode: 77,
			}),
		).toBe(false)
	})

	it("leaves AltGr typing µ on a German QWERTZ keyboard on Linux, where WebKitGTK reports Mod5 as AltGraph in Source/WebKit/Shared/gtk/WebEventFactory.cpp", () => {
		expect(
			pressed(LINUX_AGENT, {
				...ALT_GRAPH,
				key: "µ",
				code: "KeyM",
				keyCode: 0,
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

describe("isControlShiftLetterOffMac", () => {
	it.each([
		{ layout: "QWERTY", key: "M", code: "KeyM", keyCode: 77 },
		{ layout: "AZERTY", key: "M", code: "Semicolon", keyCode: 77 },
		{ layout: "German QWERTZ", key: "M", code: "KeyM", keyCode: 77 },
	])(
		"hears the M key of a $layout keyboard on Windows, where Chromium drops Ctrl and keeps Shift to name the key in ui/events/keycodes/platform_key_map_win.cc",
		({ layout: _, ...key }) => {
			expect(
				pressedWithShift(WINDOWS_AGENT, { ...CONTROL_SHIFT, ...key }),
			).toBe(true)
		},
	)

	it.each([
		{ layout: "QWERTY", key: "M", code: "KeyM", keyCode: 77 },
		{ layout: "AZERTY", key: "M", code: "Semicolon", keyCode: 77 },
		{ layout: "German QWERTZ", key: "M", code: "KeyM", keyCode: 77 },
	])(
		"hears the M key of a $layout keyboard on Linux, where WebKitGTK maps the keyval in Source/WebKit/Shared/gtk/WebKeyboardEventGtk.cpp",
		({ layout: _, ...key }) => {
			expect(pressedWithShift(LINUX_AGENT, { ...CONTROL_SHIFT, ...key })).toBe(
				true,
			)
		},
	)

	it.each([
		{ platform: "Windows", agent: WINDOWS_AGENT, keyCode: 188 },
		{ platform: "Linux", agent: LINUX_AGENT, keyCode: 191 },
	])(
		"leaves the AZERTY comma key alone on $platform, where Shift makes it print a question mark",
		({ agent, keyCode }) => {
			expect(
				pressedWithShift(agent, {
					...CONTROL_SHIFT,
					key: "?",
					code: "KeyM",
					keyCode,
				}),
			).toBe(false)
		},
	)

	it("ignores Cmd+Shift+M and Ctrl+Shift+M on macOS", () => {
		const key = { key: "M", code: "KeyM", keyCode: 77, shiftKey: true }

		expect(pressedWithShift(MAC_AGENT, { ...key, metaKey: true })).toBe(false)
		expect(pressedWithShift(MAC_AGENT, { ...key, ctrlKey: true })).toBe(false)
		expect(pressed(MAC_AGENT, { ...key, metaKey: true })).toBe(false)
		expect(pressed(MAC_AGENT, { ...key, ctrlKey: true })).toBe(false)
	})

	it.each([
		{ platform: "Windows", agent: WINDOWS_AGENT, keyCode: 77 },
		{ platform: "Linux", agent: LINUX_AGENT, keyCode: 0 },
	])(
		"leaves AltGr typing µ on a German QWERTZ keyboard on $platform, with or without Shift",
		({ agent, keyCode }) => {
			const key = { ...ALT_GRAPH, key: "µ", code: "KeyM", keyCode }

			expect(pressedWithShift(agent, key)).toBe(false)
			expect(pressedWithShift(agent, { ...key, shiftKey: true })).toBe(false)
		},
	)

	it("ignores the chord while an IME composes", () => {
		const key = { ...CONTROL_SHIFT, key: "M", code: "KeyM" }

		expect(
			pressedWithShift(WINDOWS_AGENT, {
				...key,
				keyCode: 77,
				isComposing: true,
			}),
		).toBe(false)
		expect(pressedWithShift(WINDOWS_AGENT, { ...key, keyCode: 229 })).toBe(
			false,
		)
	})

	it("ignores the letter without both Ctrl and Shift", () => {
		const key = { key: "m", code: "KeyM", keyCode: 77 }

		expect(pressedWithShift(WINDOWS_AGENT, { ...key, ctrlKey: true })).toBe(
			false,
		)
		expect(pressedWithShift(LINUX_AGENT, { ...key, shiftKey: true })).toBe(
			false,
		)
		expect(
			pressedWithShift(WINDOWS_AGENT, {
				...key,
				metaKey: true,
				shiftKey: true,
			}),
		).toBe(false)
	})
})
