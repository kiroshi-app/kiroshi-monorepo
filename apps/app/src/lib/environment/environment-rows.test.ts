import { describe, expect, it } from "vitest"

import { toEnvironmentRows } from "./environment-rows"

import type { EnvScope } from "../conversations/store-contract"

const SPACE: EnvScope = { kind: "space", id: "s-1" }

const BOT: EnvScope = { kind: "bot", id: "b-1", spaceId: "s-1" }

describe("toEnvironmentRows", () => {
	it("reads a name the space defines as defined in the space", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
			]),
		).toEqual([
			{ name: "ATLAS_TOKEN", definedIn: "space", servedFrom: "space" },
		])
	})

	it("folds a name two scopes define into the narrower one overriding the wider", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_REGION", definedIn: BOT, servedFrom: BOT },
				{ name: "ATLAS_REGION", definedIn: SPACE, servedFrom: BOT },
			]),
		).toEqual([
			{
				name: "ATLAS_REGION",
				definedIn: "bot",
				servedFrom: "bot",
				overrides: "space",
			},
		])
	})

	it("marks a name declared without a value as unset", () => {
		expect(
			toEnvironmentRows([
				{
					name: "ATLAS_TOKEN",
					definedIn: SPACE,
					servedFrom: SPACE,
					isUnset: true,
				},
			]),
		).toEqual([
			{
				name: "ATLAS_TOKEN",
				definedIn: "space",
				servedFrom: "space",
				isUnset: true,
			},
		])
	})

	it("leaves the unset key off a name holding a value", () => {
		const [row] = toEnvironmentRows([
			{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
		])

		expect(row).not.toHaveProperty("isUnset")
	})

	it("keeps the unset mark of a narrower scope over a wider one holding a value", () => {
		expect(
			toEnvironmentRows([
				{
					name: "ATLAS_REGION",
					definedIn: BOT,
					servedFrom: SPACE,
					isUnset: true,
				},
				{ name: "ATLAS_REGION", definedIn: SPACE, servedFrom: SPACE },
			]),
		).toEqual([
			{
				name: "ATLAS_REGION",
				definedIn: "bot",
				servedFrom: "space",
				overrides: "space",
				isUnset: true,
			},
		])
	})

	it("drops the unset mark of a wider scope under a narrower one holding a value", () => {
		const rows = toEnvironmentRows([
			{ name: "ATLAS_REGION", definedIn: BOT, servedFrom: BOT },
			{
				name: "ATLAS_REGION",
				definedIn: SPACE,
				servedFrom: BOT,
				isUnset: true,
			},
		])

		expect(rows).toEqual([
			{
				name: "ATLAS_REGION",
				definedIn: "bot",
				servedFrom: "bot",
				overrides: "space",
			},
		])
		expect(rows[0]).not.toHaveProperty("isUnset")
	})

	it("keeps the order the scope listed its names in", () => {
		expect(
			toEnvironmentRows([
				{ name: "ATLAS_TOKEN", definedIn: SPACE, servedFrom: SPACE },
				{ name: "BOT_SEED", definedIn: BOT, servedFrom: BOT },
			]).map((row) => row.name),
		).toEqual(["ATLAS_TOKEN", "BOT_SEED"])
	})
})
