import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
	UserPreferences,
	UserPreferencesError,
} from "./preferences-contract"
import { userPreferencesStore } from "./preferences-transport"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

const RECORD: UserPreferences = {
	displayName: "Nyx",
	profilePicturePath: "/data/avatars/one.png",
	colorScheme: "dark",
	language: "fr",
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "conversations",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const DEFAULTS: UserPreferences = {
	displayName: "",
	profilePicturePath: null,
	colorScheme: "system",
	language: null,
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
	sidebarWidth: null,
	sidebarTab: "conversations",
	openOn: "newConversation",
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const FAILURES: UserPreferencesError[] = [
	{ kind: "unavailable", failure: { kind: "appDataDir" } },
	{ kind: "storage", failure: { kind: "sqlite", detail: "disk I/O error" } },
	{ kind: "rejectedProfilePicture", reason: { kind: "unknownFormat" } },
]

beforeEach(() => {
	hostInvoke.mockReset()
	hostInvoke.mockResolvedValue(undefined)
})

describe("userPreferencesStore", () => {
	it("reads the record from the host, defaults included", async () => {
		hostInvoke.mockResolvedValue(DEFAULTS)

		const read = await userPreferencesStore.read()

		expect(hostInvoke).toHaveBeenCalledWith("user_preferences")
		expect(read).toEqual(DEFAULTS)
	})

	it("writes the record whole, under the key the command names", async () => {
		hostInvoke.mockResolvedValue(RECORD)

		const written = await userPreferencesStore.write(RECORD)

		expect(hostInvoke).toHaveBeenCalledWith("user_set_preferences", {
			preferences: RECORD,
		})
		expect(written).toEqual(RECORD)
	})

	it("sends the picture as the bytes the host decodes", async () => {
		const bytes = new Uint8Array([1, 2, 3])
		hostInvoke.mockResolvedValue(RECORD)

		const worn = await userPreferencesStore.setProfilePicture(bytes)

		expect(hostInvoke).toHaveBeenCalledWith("user_set_profile_picture", {
			bytes,
		})
		expect(worn).toEqual(RECORD)
	})

	it.each(FAILURES)("hands back $kind as the host sent it", async (failure) => {
		hostInvoke.mockRejectedValue(failure)

		await expect(userPreferencesStore.read()).rejects.toEqual(failure)
	})
})
