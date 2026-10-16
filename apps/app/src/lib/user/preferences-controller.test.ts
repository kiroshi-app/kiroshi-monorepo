import { invoke } from "@tauri-apps/api/core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { UserPreferences } from "./preferences-contract"
import { createUserController } from "./preferences-controller"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

const hostInvoke = vi.mocked(invoke)

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
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
}

const WORN = "/data/avatars/worn.png"

const ALL_NOTIFIED = {
	notifyOnQuestion: true,
	notifyOnPermission: true,
	notifyOnFinishedTurn: true,
	notifyWithSound: true,
}

const aHost = (record: UserPreferences = DEFAULTS) => {
	let held = record

	hostInvoke.mockImplementation((command, args) => {
		if (command === "user_set_preferences") {
			held = (args as { preferences: UserPreferences }).preferences
		}
		if (command === "user_set_profile_picture") {
			held = { ...held, profilePicturePath: WORN }
		}
		return Promise.resolve(held)
	})

	return () => held
}

const aPicture = () =>
	({
		arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
	}) as File

const loaded = async () => {
	const controller = createUserController()
	await controller.load()
	return controller
}

const createStorage = () => {
	const entries = new Map<string, string>()

	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value)
		},
		removeItem: (key: string) => {
			entries.delete(key)
		},
	}
}

const listeners = new Map<string, (event: StorageEvent) => void>()

const anotherWindowChanging = (key: string, value: string | null) => {
	if (value === null) {
		localStorage.removeItem(key)
	} else {
		localStorage.setItem(key, value)
	}
	listeners.get("storage")?.({ key } as StorageEvent)
}

beforeEach(() => {
	hostInvoke.mockReset()
	listeners.clear()
	vi.stubGlobal("localStorage", createStorage())
	vi.stubGlobal("navigator", { language: "en-US" })
	vi.stubGlobal("window", {
		addEventListener: (
			name: string,
			listener: (event: StorageEvent) => void,
		) => {
			listeners.set(name, listener)
		},
		removeEventListener: (name: string) => {
			listeners.delete(name)
		},
	})
})

describe("the reader's own record", () => {
	it("opens on the name and the picture the host holds", async () => {
		aHost({ ...DEFAULTS, displayName: "Nyx", profilePicturePath: WORN })

		const controller = await loaded()

		expect(controller.getState().preferences).toEqual({
			...DEFAULTS,
			...ALL_NOTIFIED,
			displayName: "Nyx",
			profilePicturePath: WORN,
		})
	})

	it("shows a name on the keystroke and writes the record whole", async () => {
		const host = aHost({ ...DEFAULTS, colorScheme: "dark" })
		const controller = await loaded()

		controller.rename("Ny")
		controller.rename("Nyx")

		expect(controller.getState().preferences.displayName).toBe("Nyx")
		await vi.waitFor(() =>
			expect(host()).toEqual({
				...DEFAULTS,
				displayName: "Nyx",
				colorScheme: "dark",
			}),
		)
	})

	it("wears the picture the host answered with", async () => {
		aHost()
		const controller = await loaded()

		await controller.uploadPicture(aPicture())

		expect(hostInvoke).toHaveBeenCalledWith("user_set_profile_picture", {
			bytes: new Uint8Array([1, 2, 3]),
		})
		expect(controller.getState().preferences.profilePicturePath).toBe(WORN)
	})

	it("takes the picture off the record the host holds", async () => {
		const host = aHost()
		const controller = await loaded()
		await controller.uploadPicture(aPicture())

		await controller.removePicture()

		expect(host().profilePicturePath).toBeNull()
		expect(controller.getState().preferences.profilePicturePath).toBeNull()
	})

	it("keeps showing what the host last answered with when a write is refused", async () => {
		aHost({ ...DEFAULTS, displayName: "Nyx" })
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		controller.rename("Nix")

		await vi.waitFor(() =>
			expect(controller.getState().preferences.displayName).toBe("Nyx"),
		)
	})

	it("shows the switch on the press and writes the record whole", async () => {
		const host = aHost({ ...DEFAULTS, displayName: "Nyx", colorScheme: "dark" })
		const controller = await loaded()

		const written = controller.setNotification({
			field: "notifyOnPermission",
			isEnabled: false,
		})

		expect(controller.getState().preferences.notifyOnPermission).toBe(false)
		await written
		expect(host()).toEqual({
			...DEFAULTS,
			displayName: "Nyx",
			colorScheme: "dark",
			notifyOnPermission: false,
		})
	})

	it("puts a switch back on what the host last answered when its write is refused", async () => {
		aHost()
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await controller.setNotification({
			field: "notifyOnQuestion",
			isEnabled: false,
		})

		expect(controller.getState().preferences.notifyOnQuestion).toBe(true)
	})

	it("holds a scheme chosen between a keystroke's read and its write", async () => {
		const host = aHost({ ...DEFAULTS, displayName: "Nyx" })
		const controller = await loaded()

		controller.rename("Nyxie")
		await controller.setColorScheme("dark")

		await vi.waitFor(() =>
			expect(host()).toEqual({
				...DEFAULTS,
				displayName: "Nyxie",
				colorScheme: "dark",
			}),
		)
	})

	it("reads a field the record leaves out as none, and writes nothing for it", async () => {
		const { sidebarWidth, lastSpaceId, lastBotIdBySpace, ...older } = DEFAULTS
		const host = aHost(older as UserPreferences)
		const controller = await loaded()

		expect(controller.getState().preferences).toEqual(DEFAULTS)

		await controller.setColorScheme("dark")

		expect(host()).toEqual({ ...older, colorScheme: "dark" })
	})
})

describe("the window before the host has answered", () => {
	it("opens on the theme and the language the mirror holds", () => {
		localStorage.setItem("theme", "dark")
		localStorage.setItem("language", "fr")

		expect(createUserController().getState().preferences).toEqual({
			...DEFAULTS,
			colorScheme: "dark",
			language: "fr",
		})
	})

	it("opens on the defaults when nothing has been mirrored", () => {
		expect(createUserController().getState().preferences).toEqual(DEFAULTS)
	})
})

describe("the theme and the language the host holds", () => {
	it("are taken over the mirror and written back into it", async () => {
		localStorage.setItem("theme", "light")
		aHost({ ...DEFAULTS, colorScheme: "dark", language: "fr" })

		const controller = await loaded()

		expect(controller.getState().preferences).toEqual({
			...DEFAULTS,
			colorScheme: "dark",
			language: "fr",
		})
		expect(localStorage.getItem("theme")).toBe("dark")
		expect(localStorage.getItem("language")).toBe("fr")
		expect(i18n.language).toBe("fr")
	})

	it("are read on their defaults for the values this build does not ship", async () => {
		aHost({ ...DEFAULTS, language: "br" })

		const controller = await loaded()

		expect(controller.getState().preferences).toEqual(DEFAULTS)
	})

	it("mirror no language when the record holds none", async () => {
		localStorage.setItem("language", "fr")
		aHost()

		await loaded()

		expect(localStorage.getItem("language")).toBeNull()
	})

	it("leave the window as it opened when the host refuses", async () => {
		localStorage.setItem("theme", "dark")
		localStorage.setItem("language", "en")
		hostInvoke.mockRejectedValue({
			kind: "unavailable",
			failure: { kind: "appDataDir" },
		})

		const controller = await loaded()

		expect(controller.getState().preferences.colorScheme).toBe("dark")
		expect(localStorage.getItem("theme")).toBe("dark")
		expect(localStorage.getItem("language")).toBe("en")
	})
})

describe("the theme the reader chooses", () => {
	it("is shown, mirrored, and written into the record whole", async () => {
		const host = aHost({ ...DEFAULTS, displayName: "Nyx" })
		const controller = await loaded()

		const written = controller.setColorScheme("dark")

		expect(controller.getState().preferences.colorScheme).toBe("dark")
		expect(localStorage.getItem("theme")).toBe("dark")
		await written
		expect(host()).toEqual({
			...DEFAULTS,
			displayName: "Nyx",
			colorScheme: "dark",
		})
	})

	it("goes back to what the host last answered when its write is refused", async () => {
		aHost({ ...DEFAULTS, colorScheme: "dark" })
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await controller.setColorScheme("light")

		expect(controller.getState().preferences.colorScheme).toBe("dark")
		expect(localStorage.getItem("theme")).toBe("dark")
	})
})

describe("the language the reader chooses", () => {
	it("is read in, mirrored, and written into the record", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.setLanguage("fr")

		expect(i18n.language).toBe("fr")
		expect(localStorage.getItem("language")).toBe("fr")
		expect(host()).toEqual({ ...DEFAULTS, language: "fr" })
	})

	it("is forgotten when the reader hands the choice back", async () => {
		vi.stubGlobal("navigator", { language: "en-GB" })
		const host = aHost()
		const controller = await loaded()
		await controller.setLanguage("fr")

		await controller.setLanguage(null)

		expect(localStorage.getItem("language")).toBeNull()
		expect(i18n.language).toBe("en")
		expect(host()).toEqual({ ...DEFAULTS, language: null })
	})
})

describe("a preference another window changed", () => {
	it("is followed on the mirror the other window rewrote", async () => {
		aHost()
		const controller = await loaded()
		const stop = controller.followOtherWindows()

		anotherWindowChanging("theme", "dark")
		anotherWindowChanging("language", "fr")

		expect(controller.getState().preferences.colorScheme).toBe("dark")
		expect(controller.getState().preferences.language).toBe("fr")
		expect(i18n.language).toBe("fr")
		stop()
	})

	it("is left alone when the key is none of the mirror's", async () => {
		aHost()
		const controller = await loaded()
		controller.followOtherWindows()

		localStorage.setItem("theme", "dark")
		listeners.get("storage")?.({ key: "conversations" } as StorageEvent)

		expect(controller.getState().preferences.colorScheme).toBe("system")
	})

	it("stops being followed once the window lets go", async () => {
		aHost()
		const controller = await loaded()

		controller.followOtherWindows()()

		expect(listeners.has("storage")).toBe(false)
	})
})

describe("the sidebar edge the reader drags", () => {
	it("writes the width once, and shows it before the host answers", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.setSidebarWidth(320)

		expect(controller.getState().preferences.sidebarWidth).toBe(320)
		expect(localStorage.getItem("sidebarWidth")).toBe("320")
		expect(host()).toEqual({ ...DEFAULTS, sidebarWidth: 320 })
	})

	it("writes nothing for a width the record already holds", async () => {
		aHost({ ...DEFAULTS, sidebarWidth: 320 })
		const controller = await loaded()
		hostInvoke.mockClear()

		await controller.setSidebarWidth(320)

		expect(hostInvoke).not.toHaveBeenCalled()
	})
})

describe("the sidebar tab the reader selects", () => {
	it("writes the tab to the record, and shows it before the host answers", async () => {
		const host = aHost()
		const controller = await loaded()

		const written = controller.setSidebarTab("missions")

		expect(controller.getState().preferences.sidebarTab).toBe("missions")
		await written
		expect(host()).toEqual({ ...DEFAULTS, sidebarTab: "missions" })
	})

	it("writes nothing for a tab the record already holds", async () => {
		aHost({ ...DEFAULTS, sidebarTab: "missions" })
		const controller = await loaded()
		hostInvoke.mockClear()

		await controller.setSidebarTab("missions")

		expect(hostInvoke).not.toHaveBeenCalled()
	})

	it("shows the stored tab again when the write is refused", async () => {
		aHost()
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await controller.setSidebarTab("companions")

		expect(controller.getState().preferences.sidebarTab).toBe("conversations")
	})
})

describe("the conversation the reader opens", () => {
	it("is written to the record and to the mirror against its space", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.setLastBot({ spaceId: "vocca", botId: "nyx" })

		expect(controller.getState().preferences.lastBotIdBySpace).toEqual({
			vocca: "nyx",
		})
		expect(localStorage.getItem("lastBotIdBySpace")).toBe(
			JSON.stringify({ vocca: "nyx" }),
		)
		expect(host()).toEqual({
			...DEFAULTS,
			lastBotIdBySpace: { vocca: "nyx" },
		})
	})

	it("leaves the companion of every other space where it was", async () => {
		aHost({ ...DEFAULTS, lastBotIdBySpace: { atlas: "iris" } })
		const controller = await loaded()

		await controller.setLastBot({ spaceId: "vocca", botId: "nyx" })

		expect(controller.getState().preferences.lastBotIdBySpace).toEqual({
			atlas: "iris",
			vocca: "nyx",
		})
	})

	it("is written nowhere while no space is shown", async () => {
		aHost()
		const controller = await loaded()
		hostInvoke.mockClear()

		await controller.setLastBot({ spaceId: null, botId: "nyx" })

		expect(hostInvoke).not.toHaveBeenCalled()
	})

	it("is written once when it is the companion the record already names", async () => {
		aHost({
			...DEFAULTS,
			lastBotIdBySpace: { vocca: "nyx" },
		})
		const controller = await loaded()
		hostInvoke.mockClear()

		await controller.setLastBot({ spaceId: "vocca", botId: "nyx" })

		expect(hostInvoke).not.toHaveBeenCalled()
	})
})

describe("the space the reader is in", () => {
	it("is written to the record and to the mirror", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.setLastSpace("vocca")

		expect(controller.getState().preferences.lastSpaceId).toBe("vocca")
		expect(localStorage.getItem("lastSpaceId")).toBe("vocca")
		expect(host()).toEqual({ ...DEFAULTS, lastSpaceId: "vocca" })
	})

	it("is written once when it is the space the record already names", async () => {
		aHost({ ...DEFAULTS, lastSpaceId: "vocca" })
		const controller = await loaded()
		hostInvoke.mockClear()

		await controller.setLastSpace("vocca")

		expect(hostInvoke).not.toHaveBeenCalled()
	})
})

describe("the activity panel the reader opens", () => {
	it("is shown, mirrored, and written into the record", async () => {
		const host = aHost()
		const controller = await loaded()

		const written = controller.setActivityPanelOpen(true)

		expect(controller.getState().preferences.activityPanelOpen).toBe(true)
		await written
		expect(host()).toEqual({ ...DEFAULTS, activityPanelOpen: true })
	})

	it("goes back to what the host last answered when its write is refused", async () => {
		aHost({ ...DEFAULTS, activityPanelOpen: true })
		const controller = await loaded()
		hostInvoke.mockRejectedValue({
			kind: "storage",
			failure: { kind: "sqlite", detail: "disk I/O error" },
		})

		await controller.setActivityPanelOpen(false)

		expect(controller.getState().preferences.activityPanelOpen).toBe(true)
	})
})

describe("the first run the reader has been through", () => {
	it("is mirrored and written into the record once it is marked done", async () => {
		const host = aHost()
		const controller = await loaded()

		expect(controller.getState().preferences.firstRunDone).toBe(false)
		await controller.markFirstRunDone()

		expect(controller.getState().preferences.firstRunDone).toBe(true)
		expect(host()).toEqual({ ...DEFAULTS, firstRunDone: true })
	})
})

describe("the settings the chip opens", () => {
	it("stand open until they are closed, and nothing else moves", async () => {
		aHost()
		const controller = await loaded()

		controller.setSettingsOpen(true)
		expect(controller.getState().isSettingsOpen).toBe(true)

		controller.setSettingsOpen(false)
		expect(controller.getState().isSettingsOpen).toBe(false)
	})
})

describe("the update preferences of the About tab", () => {
	const REFUSED = {
		kind: "storage",
		failure: { kind: "sqlite", detail: "disk I/O error" },
	}

	it("writes the channel into the record", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.setUpdateChannel("beta")

		expect(controller.getState().preferences.updateChannel).toBe("beta")
		expect(host()).toEqual({ ...DEFAULTS, updateChannel: "beta" })
	})

	it("writes the What's new switch into the record", async () => {
		const host = aHost({ ...DEFAULTS, showWhatsNew: true })
		const controller = await loaded()

		await controller.setShowWhatsNew(false)

		expect(controller.getState().preferences.showWhatsNew).toBe(false)
		expect(host().showWhatsNew).toBe(false)
	})

	it("writes the version the reader has seen into the record", async () => {
		const host = aHost()
		const controller = await loaded()

		await controller.markVersionSeen("0.25.0")

		expect(controller.getState().preferences.lastSeenVersion).toBe("0.25.0")
		expect(host().lastSeenVersion).toBe("0.25.0")
	})

	it("shows the stored channel again and rejects when the write is refused", async () => {
		aHost({ ...DEFAULTS, updateChannel: "stable" })
		const controller = await loaded()
		hostInvoke.mockRejectedValue(REFUSED)

		await expect(controller.setUpdateChannel("beta")).rejects.toEqual(REFUSED)

		expect(controller.getState().preferences.updateChannel).toBe("stable")
	})

	it("shows the stored switch again and rejects when the write is refused", async () => {
		aHost({ ...DEFAULTS, showWhatsNew: true })
		const controller = await loaded()
		hostInvoke.mockRejectedValue(REFUSED)

		await expect(controller.setShowWhatsNew(false)).rejects.toEqual(REFUSED)

		expect(controller.getState().preferences.showWhatsNew).toBe(true)
	})
})
