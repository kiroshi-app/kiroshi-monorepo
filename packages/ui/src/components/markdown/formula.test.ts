import { describe, expect, it } from "vitest"

import { compileFormula } from "@workspace/ui/components/markdown/formula"

const NAMES = new Set(["x", "rate", "years_2"])

const evaluate = (source: string, values: Record<string, number> = {}) =>
	compileFormula(source, NAMES)?.(values)

describe("interactive formula", () => {
	it.each([
		["-x ^ 2", { x: 3 }, -9],
		["2 ^ 3 ^ 2", {}, 512],
		["2 ^ -1", {}, 0.5],
		["1 - 2 - 3", {}, -4],
		["12 / 3 / 2", {}, 2],
		["1 + 2 * 3", {}, 7],
		["(1 + 2) * 3", {}, 9],
		["--x", { x: 4 }, 4],
		[" min( x ,rate )+max(1,2) ", { x: 5, rate: 3 }, 5],
		["abs(-2) + sqrt(9) + floor(1.7) + ceil(1.2) + round(2.5)", {}, 11],
		["ln(exp(2)) + log10(100)", {}, 4],
		["years_2 * 0.5", { years_2: 8 }, 4],
	])("evaluates %s as the grammar groups it", (source, values, expected) => {
		expect(evaluate(source, values)).toBeCloseTo(expected)
	})

	it("evaluates the documented repayment formula", () => {
		const formula = compileFormula(
			"amount * rate / 1200 / (1 - (1 + rate / 1200) ^ -(years * 12))",
			new Set(["amount", "rate", "years"]),
		)

		expect(formula?.({ amount: 200000, rate: 3.5, years: 20 })).toBeCloseTo(
			1159.92,
			2,
		)
	})

	it.each([
		"y + 1",
		"pow(x, 2)",
		"min(x)",
		"abs(x, 1)",
		"x +",
		"(x",
		"x)",
		"x ** 2",
		"x % 2",
		"1e3",
		".5",
		"x; 1",
		"constructor(x)",
		"Math.max(1, 2)",
		"eval(x)",
		"",
	])("rejects %j as outside the grammar", (source) => {
		expect(compileFormula(source, NAMES)).toBeNull()
	})

	it("gives a non finite value where the formula is not defined", () => {
		expect(evaluate("1 / x", { x: 0 })).toBe(Number.POSITIVE_INFINITY)
		expect(evaluate("sqrt(x)", { x: -1 })).toBeNaN()
	})
})
