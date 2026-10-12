import { describe, expect, it } from "vitest"

import { landingOf, validateLoginSearch } from "./login-search"

describe("validateLoginSearch", () => {
	it.each([
		["/authorize", "/authorize"],
		["/authorize?client=desk#top", "/authorize?client=desk#top"],
		["/account/devices", "/account/devices"],
	])("keeps the same-origin path %s", (redirect, kept) => {
		expect(validateLoginSearch({ redirect }).redirect).toBe(kept)
	})

	it.each([
		"https://evil.example/account",
		"//evil.example/account",
		"/\\evil.example/account",
		"/\t/evil.example",
		"javascript:alert(1)",
		"account",
		42,
	])("drops the redirect %s", (redirect) => {
		expect(validateLoginSearch({ redirect }).redirect).toBeUndefined()
	})

	it("lands on /account without a redirect", () => {
		expect(landingOf(validateLoginSearch({}))).toBe("/account")
	})

	it("lands on the kept redirect", () => {
		expect(landingOf(validateLoginSearch({ redirect: "/authorize" }))).toBe(
			"/authorize",
		)
	})
})
