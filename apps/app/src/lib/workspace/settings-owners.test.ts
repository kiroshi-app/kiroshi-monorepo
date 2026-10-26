import { describe, expect, it } from "vitest"

import {
	companionSettingsOwnerOf,
	spaceSettingsOwnerOf,
	userSettingsOwnerOf,
} from "./settings-owners"

import type { Bot, Space } from "../conversations/store-contract"

const SELECTED = { selectedSpaceId: "vocca" }

const HELD_VOCCA_CURRENT = {
	spaces: [{ id: "vocca" }, { id: "studio" }] as Space[],
	selectedSpaceId: "vocca",
}

const SCRIBE_LISTED = { bots: [{ id: "scribe" } as Bot] }

const VOCCA_SETTINGS = { kind: "space", spaceId: "vocca" } as const

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
			companionSettingsOwnerOf(VOCCA_SETTINGS, SCRIBE_LISTED, SELECTED),
		).toBeNull()
	})

	it("owns no companion the roster no longer lists", () => {
		expect(
			companionSettingsOwnerOf(SCRIBE_SETTINGS, { bots: [] }, SELECTED),
		).toBeNull()
	})

	it("owns the space of yours whose settings are open, the current one", () => {
		expect(
			spaceSettingsOwnerOf(VOCCA_SETTINGS, HELD_VOCCA_CURRENT, "vocca"),
		).toEqual({ kind: "space", id: "vocca" })
	})

	it("owns the space of yours whose settings are open, though another is current", () => {
		expect(
			spaceSettingsOwnerOf(
				{ kind: "space", spaceId: "studio" },
				HELD_VOCCA_CURRENT,
				"vocca",
			),
		).toEqual({ kind: "space", id: "studio" })
	})

	it("owns the shared space of the current joined space whose settings are open", () => {
		expect(
			spaceSettingsOwnerOf(
				{ kind: "space", spaceId: "joined:harbor" },
				{ ...HELD_VOCCA_CURRENT, selectedSpaceId: "harbor-on-host" },
				"joined:harbor",
			),
		).toEqual({ kind: "space", id: "harbor-on-host" })
	})

	it("owns no joined space other than the current one", () => {
		expect(
			spaceSettingsOwnerOf(
				{ kind: "space", spaceId: "joined:harbor" },
				HELD_VOCCA_CURRENT,
				"vocca",
			),
		).toBeNull()
	})

	it("owns no space while no space settings are open", () => {
		expect(
			spaceSettingsOwnerOf({ kind: "user" }, HELD_VOCCA_CURRENT, "vocca"),
		).toBeNull()
	})

	it("owns the person only while their settings are open", () => {
		expect(userSettingsOwnerOf({ kind: "user" })).toEqual({ kind: "user" })
		expect(userSettingsOwnerOf(null)).toBeNull()
	})
})
