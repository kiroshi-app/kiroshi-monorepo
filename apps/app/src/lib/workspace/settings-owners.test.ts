import { describe, expect, it } from "vitest"

import {
	companionSettingsOwnerOf,
	spaceSettingsOwnerOf,
	userSettingsOwnerOf,
} from "./settings-owners"

import type { Bot } from "../conversations/store-contract"

const SELECTED = { selectedSpaceId: "vocca" }

const SCRIBE_LISTED = { bots: [{ id: "scribe" } as Bot] }

const SCRIBE_SETTINGS = {
	kind: "companion",
	companionId: "scribe",
	isFromSpaceSettings: false,
} as const

describe("settings owners", () => {
	it("owns the companion whose settings are open in the selected space", () => {
		expect(
			companionSettingsOwnerOf(SCRIBE_SETTINGS, SCRIBE_LISTED, SELECTED),
		).toEqual({ kind: "bot", id: "scribe", spaceId: "vocca" })
	})

	it("owns no companion while no companion settings are open", () => {
		expect(
			companionSettingsOwnerOf({ kind: "space" }, SCRIBE_LISTED, SELECTED),
		).toBeNull()
	})

	it("owns no companion the roster no longer lists", () => {
		expect(
			companionSettingsOwnerOf(SCRIBE_SETTINGS, { bots: [] }, SELECTED),
		).toBeNull()
	})

	it("owns the selected space while its settings are open", () => {
		expect(spaceSettingsOwnerOf({ kind: "space" }, SELECTED)).toEqual({
			kind: "space",
			id: "vocca",
		})
	})

	it("owns no space while none is selected", () => {
		expect(
			spaceSettingsOwnerOf({ kind: "space" }, { selectedSpaceId: null }),
		).toBeNull()
	})

	it("owns the person only while their settings are open", () => {
		expect(userSettingsOwnerOf({ kind: "user" })).toEqual({ kind: "user" })
		expect(userSettingsOwnerOf(null)).toBeNull()
	})
})
