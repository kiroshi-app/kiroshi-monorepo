import { describe, expect, it } from "vitest"

import { greetingPeriodOf } from "@workspace/ui/components/greeting-period"

const hourAt = (clock: string) => {
	const [hours, minutes] = clock.split(":").map(Number)
	return new Date(2026, 10, 9, hours, minutes).getHours()
}

describe("greetingPeriodOf", () => {
	it.each([
		["04:59", "night"],
		["05:00", "morning"],
		["11:59", "morning"],
		["12:00", "afternoon"],
		["17:59", "afternoon"],
		["18:00", "evening"],
		["21:59", "evening"],
		["22:00", "night"],
	] as const)("reads %s as %s", (clock, period) => {
		expect(greetingPeriodOf(hourAt(clock))).toBe(period)
	})
})
