import { describe, expect, it } from "vitest"

import type { ReaderPreferences } from "./preferences-controller"
import { toNotificationChange, toUserSettingsValue } from "./user-settings"

const RECORD: ReaderPreferences = {
	displayName: "Nyx",
	profilePicturePath: null,
	colorScheme: "dark",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: false,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarCollapsed: false,
	sidebarTab: "conversations",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const shown = (record: ReaderPreferences = RECORD) =>
	toUserSettingsValue(record)

describe("the theme the dialog draws", () => {
	it("stands where the record holds it", () => {
		expect(shown()).toMatchObject({ colorScheme: "dark" })
	})
})

describe("the switches the dialog draws", () => {
	it("stands each one where the record holds it", () => {
		expect(shown().notifications).toEqual({
			question: true,
			permission: false,
			turn: true,
			sound: true,
		})
	})

	it("reads the sound the dialog flipped as the field the record names", () => {
		const silenced = shown({ ...RECORD, notifyWithSound: false })

		expect(toNotificationChange(silenced, shown())).toEqual({
			field: "notifyWithSound",
			isEnabled: false,
		})
	})

	it("reads a flipped switch as the field the record names", () => {
		const flipped = shown({ ...RECORD, notifyOnFinishedTurn: false })

		expect(toNotificationChange(flipped, shown())).toEqual({
			field: "notifyOnFinishedTurn",
			isEnabled: false,
		})
	})

	it("reads an edit of another field as no switch at all", () => {
		const renamed = shown({ ...RECORD, displayName: "Nyxie" })

		expect(toNotificationChange(renamed, shown())).toBeNull()
	})
})
