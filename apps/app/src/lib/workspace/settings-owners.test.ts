import { describe, expect, it } from "vitest"

import {
	companionSettingsOwnerOf,
	spaceSettingsOwnerOf,
	userSettingsOwnerOf,
} from "./settings-owners"

const SELECTED = { isSettingsOpen: true, selectedSpaceId: "vocca" }

describe("settings owners", () => {
	it("owns the companion being edited in the selected space", () => {
		expect(
			companionSettingsOwnerOf(
				{ isEditing: true, settingsBotId: "scribe" },
				SELECTED,
			),
		).toEqual({ kind: "bot", id: "scribe", spaceId: "vocca" })
	})

	it("owns no companion while none is edited", () => {
		expect(
			companionSettingsOwnerOf(
				{ isEditing: false, settingsBotId: "scribe" },
				SELECTED,
			),
		).toBeNull()
	})

	it("owns the selected space while its settings are open", () => {
		expect(spaceSettingsOwnerOf(SELECTED)).toEqual({
			kind: "space",
			id: "vocca",
		})
	})

	it("owns no space while none is selected", () => {
		expect(
			spaceSettingsOwnerOf({ isSettingsOpen: true, selectedSpaceId: null }),
		).toBeNull()
	})

	it("owns the person only while their settings are open", () => {
		expect(userSettingsOwnerOf(true)).toEqual({ kind: "user" })
		expect(userSettingsOwnerOf(false)).toBeNull()
	})
})
