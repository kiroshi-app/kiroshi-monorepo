import { afterEach, describe, expect, it, vi } from "vitest"

import { activateLanguage } from "@workspace/ui/lib/i18n"
import {
	formatDateTime,
	toElapsedTime,
	toRelativeTime,
} from "@workspace/ui/lib/time-format"

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0)

const ago = (ms: number) => toRelativeTime(NOW - ms, NOW)

const MONTH_AND_DAY: Intl.DateTimeFormatOptions = {
	month: "long",
	day: "numeric",
}

type FormatterGetters = Omit<Intl.DateTimeFormat, "format"> & {
	format: unknown
}

afterEach(() => {
	activateLanguage("en")
	vi.restoreAllMocks()
})

describe("toRelativeTime", () => {
	it("reads a moment at the largest distance that fits it", () => {
		expect(ago(90_000)).toBe("1 minute ago")
		expect(ago(7_200_000)).toBe("2 hours ago")
		expect(ago(172_800_000)).toBe("2 days ago")
		expect(ago(1_209_600_000)).toBe("2 weeks ago")
		expect(ago(63_072_000_000)).toBe("2 years ago")
	})

	it("abbreviates the unit in the short style", () => {
		expect(toRelativeTime(NOW - 7_200_000, NOW, "short")).toBe("2 hr. ago")
		expect(toRelativeTime(NOW - 45_000, NOW, "short")).toBe("now")

		activateLanguage("fr")

		expect(toRelativeTime(NOW - 7_200_000, NOW, "short")).toMatch(
			/^il y a 2\sh$/,
		)
	})

	it("says now for anything under a minute", () => {
		expect(ago(0)).toBe("now")
		expect(ago(45_000)).toBe("now")
	})

	it("says it in the language the runtime carries", () => {
		activateLanguage("fr")

		expect(ago(7_200_000)).toBe("il y a 2 heures")
	})
})

describe("toElapsedTime", () => {
	const since = (ms: number) => toElapsedTime(NOW - ms, NOW)

	it("reads the time since a moment in the largest unit it fills", () => {
		expect(since(30_000)).toBe("0m")
		expect(since(150_000)).toBe("2m")
		expect(since(7_200_000)).toBe("2h")
		expect(since(1_209_600_000)).toBe("14d")
		expect(since(63_072_000_000)).toBe("2y")
	})

	it("spells the unit short on demand", () => {
		expect(toElapsedTime(NOW - 240_000, NOW, "short")).toBe("4 min")
		expect(toElapsedTime(NOW - 7_200_000, NOW, "short")).toBe("2 hr")
	})

	it("says it in the language the runtime carries", () => {
		activateLanguage("fr")

		expect(since(172_800_000)).toBe("2j")
	})
})

describe("formatDateTime", () => {
	it("says it in the language the runtime carries at each call", () => {
		expect(formatDateTime(NOW, MONTH_AND_DAY)).toBe("January 15")

		activateLanguage("fr")

		expect(formatDateTime(NOW, MONTH_AND_DAY)).toBe("15 janvier")
	})

	it("builds one formatter per language and options", () => {
		const format = vi.spyOn(
			Intl.DateTimeFormat.prototype as FormatterGetters,
			"format",
			"get",
		)

		formatDateTime(NOW, MONTH_AND_DAY)
		formatDateTime(NOW, { ...MONTH_AND_DAY })

		const [first, second] = format.mock.contexts
		expect(second).toBe(first)
	})
})
