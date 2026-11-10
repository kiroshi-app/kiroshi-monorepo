import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "@workspace/ui/lib/i18n"

import type { UserPreferences } from "./preferences-contract"
import type { MirroredPreferences } from "./preferences-mirror"
import {
	activeLanguageOf,
	applyLanguage,
	isMirrorKey,
	keepDocumentPanelWidth,
	mirrorOf,
	readDocumentPanelWidth,
	readMirror,
	sameMirror,
	writeMirror,
} from "./preferences-mirror"

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

const MIRRORED: MirroredPreferences = {
	colorScheme: "light",
	language: null,
	sidebarWidth: null,
	activityPanelOpen: false,
	firstRunDone: false,
	lastSpaceId: null,
	lastBotIdBySpace: {},
	openOn: "newConversation",
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

const machineReadingIn = (language: string) => {
	vi.stubGlobal("navigator", { language })
}

beforeEach(() => {
	vi.stubGlobal("localStorage", createStorage())
	machineReadingIn("en-US")
})

describe("the mirror", () => {
	it("holds the scheme and the language that were chosen", () => {
		writeMirror({ ...MIRRORED, language: "fr" })

		expect(localStorage.getItem("theme")).toBe("light")
		expect(localStorage.getItem("language")).toBe("fr")
		expect(readMirror()).toEqual({ ...MIRRORED, language: "fr" })
	})

	it("holds no language while the record follows the machine", () => {
		writeMirror({ ...MIRRORED, language: "fr" })

		writeMirror({ ...MIRRORED, language: null })

		expect(localStorage.getItem("language")).toBeNull()
		expect(readMirror().language).toBeNull()
	})

	it("reads the defaults when nothing has been mirrored", () => {
		expect(readMirror()).toEqual({
			colorScheme: "system",
			language: null,
			sidebarWidth: null,
			activityPanelOpen: false,
			firstRunDone: false,
			lastSpaceId: null,
			lastBotIdBySpace: {},
			openOn: "newConversation",
		})
	})

	it("holds the page the main window opens on", () => {
		writeMirror({ ...MIRRORED, openOn: "lastConversation" })

		expect(localStorage.getItem("openOn")).toBe("lastConversation")
		expect(isMirrorKey("openOn")).toBe(true)
		expect(readMirror().openOn).toBe("lastConversation")
	})

	it("reads the New conversation page for a launch page it cannot serve", () => {
		localStorage.setItem("openOn", "lastMission")

		expect(readMirror().openOn).toBe("newConversation")
	})

	it("holds the companion last opened in each space", () => {
		writeMirror({
			...MIRRORED,
			lastBotIdBySpace: { vocca: "nyx", atlas: "iris" },
		})

		expect(localStorage.getItem("lastBotIdBySpace")).toBe(
			JSON.stringify({ vocca: "nyx", atlas: "iris" }),
		)
		expect(readMirror().lastBotIdBySpace).toEqual({
			vocca: "nyx",
			atlas: "iris",
		})
	})

	it("reads no companion per space when the mirror holds nothing readable", () => {
		localStorage.setItem("lastBotIdBySpace", "{not json")

		expect(readMirror().lastBotIdBySpace).toEqual({})
	})

	it("reads no companion per space when the mirror holds a shape it cannot serve", () => {
		localStorage.setItem("lastBotIdBySpace", JSON.stringify(["nyx"]))

		expect(readMirror().lastBotIdBySpace).toEqual({})
	})

	it("reads the default scheme for a scheme that is not one of the three", () => {
		localStorage.setItem("theme", "sepia")

		expect(readMirror().colorScheme).toBe("system")
	})

	it("holds the width the reader dragged the edge to", () => {
		writeMirror({ ...MIRRORED, sidebarWidth: 320 })

		expect(localStorage.getItem("sidebarWidth")).toBe("320")
		expect(readMirror().sidebarWidth).toBe(320)
	})

	it("holds no width once the record holds none", () => {
		writeMirror({ ...MIRRORED, sidebarWidth: 320 })

		writeMirror({ ...MIRRORED, sidebarWidth: null })

		expect(localStorage.getItem("sidebarWidth")).toBeNull()
		expect(readMirror().sidebarWidth).toBeNull()
	})

	it("reads no width for a width that is not a count of pixels", () => {
		localStorage.setItem("sidebarWidth", "wide")

		expect(readMirror().sidebarWidth).toBeNull()
	})

	it("holds the panel the reader left open", () => {
		writeMirror({ ...MIRRORED, activityPanelOpen: true })

		expect(isMirrorKey("activityPanelOpen")).toBe(true)
		expect(readMirror().activityPanelOpen).toBe(true)
	})

	it("holds the panel the reader left closed", () => {
		writeMirror({ ...MIRRORED, activityPanelOpen: true })

		writeMirror({ ...MIRRORED, activityPanelOpen: false })

		expect(readMirror().activityPanelOpen).toBe(false)
	})

	it("reads a first run nobody has been through as not done", () => {
		expect(readMirror().firstRunDone).toBe(false)
	})

	it("holds the first run the reader has been through", () => {
		writeMirror({ ...MIRRORED, firstRunDone: true })

		expect(isMirrorKey("firstRunDone")).toBe(true)
		expect(readMirror().firstRunDone).toBe(true)
	})

	it("drops the single companion an older build left behind", () => {
		localStorage.setItem("lastBotId", "nyx")

		writeMirror(MIRRORED)

		expect(localStorage.getItem("lastBotId")).toBeNull()
	})

	it("holds the space the reader was left in", () => {
		writeMirror({ ...MIRRORED, lastSpaceId: "vocca" })

		expect(localStorage.getItem("lastSpaceId")).toBe("vocca")
		expect(readMirror().lastSpaceId).toBe("vocca")
	})

	it("reads no language for a catalogue this build does not ship", () => {
		localStorage.setItem("language", "br")

		expect(readMirror().language).toBeNull()
	})
})

describe("the width of the document panel", () => {
	it("holds the width the reader dragged the edge to", () => {
		keepDocumentPanelWidth(640)

		expect(localStorage.getItem("documentPanelWidth")).toBe("640")
		expect(readDocumentPanelWidth()).toBe(640)
	})

	it("reads no width when no edge was ever dragged", () => {
		expect(readDocumentPanelWidth()).toBeNull()
	})

	it.each(["wide", "", "640.5", "640px", "0", "-640"])(
		"reads no width for %j",
		(stored) => {
			localStorage.setItem("documentPanelWidth", stored)

			expect(readDocumentPanelWidth()).toBeNull()
		},
	)
})

describe("the record the host holds", () => {
	it("is read down to the fields the mirror serves", () => {
		expect(
			mirrorOf({
				...RECORD,
				sidebarWidth: 320,
				lastSpaceId: "vocca",
				lastBotIdBySpace: {},
			}),
		).toEqual({
			colorScheme: "dark",
			language: "fr",
			sidebarWidth: 320,
			activityPanelOpen: false,
			firstRunDone: false,
			lastSpaceId: "vocca",
			lastBotIdBySpace: {},
			openOn: "newConversation",
		})
	})

	it("is read with no companion per space when the record leaves the map out", () => {
		const { lastBotIdBySpace, ...older } = RECORD

		expect(mirrorOf(older as UserPreferences).lastBotIdBySpace).toEqual({})
	})

	it("is read on its defaults for the values this build does not ship", () => {
		expect(mirrorOf({ ...RECORD, language: "br" })).toEqual({
			colorScheme: "dark",
			language: null,
			sidebarWidth: null,
			activityPanelOpen: false,
			firstRunDone: false,
			lastSpaceId: null,
			lastBotIdBySpace: {},
			openOn: "newConversation",
		})
	})
})

describe("the active language", () => {
	it("is the one that was chosen when this build ships its catalogue", () => {
		machineReadingIn("fr-FR")

		expect(activeLanguageOf("en")).toBe("en")
	})

	it("is the machine's own when nothing was chosen", () => {
		machineReadingIn("en-GB")

		expect(activeLanguageOf(null)).toBe("en")
	})

	it("is en when neither the choice nor the machine has a catalogue", () => {
		machineReadingIn("br-FR")

		expect(activeLanguageOf("br")).toBe("en")
	})

	it("is read in as soon as the mirror is applied", () => {
		machineReadingIn("fr-FR")

		applyLanguage(null)

		expect(i18n.language).toBe("fr")
	})
})

describe("isMirrorKey", () => {
	it("tells the keys the mirror holds from the rest of the storage", () => {
		expect(isMirrorKey("theme")).toBe(true)
		expect(isMirrorKey("language")).toBe(true)
		expect(isMirrorKey("sidebarWidth")).toBe(true)
		expect(isMirrorKey("lastSpaceId")).toBe(true)
		expect(isMirrorKey("conversations")).toBe(false)
		expect(isMirrorKey(null)).toBe(false)
	})
})

describe("sameMirror", () => {
	it("tells a pair apart on any axis", () => {
		const mirrored = {
			colorScheme: "dark",
			language: "fr",
			sidebarWidth: 320,
			activityPanelOpen: false,
			firstRunDone: false,
			lastSpaceId: "vocca",
			lastBotIdBySpace: {},
			openOn: "newConversation",
		} as const

		expect(sameMirror(mirrored, { ...mirrored })).toBe(true)
		expect(sameMirror(mirrored, { ...mirrored, colorScheme: "light" })).toBe(
			false,
		)
		expect(sameMirror(mirrored, { ...mirrored, language: null })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, sidebarWidth: 256 })).toBe(false)
		expect(sameMirror(mirrored, { ...mirrored, activityPanelOpen: true })).toBe(
			false,
		)
		expect(sameMirror(mirrored, { ...mirrored, lastSpaceId: null })).toBe(false)
		expect(
			sameMirror(mirrored, { ...mirrored, lastBotIdBySpace: { vocca: "nyx" } }),
		).toBe(false)
		expect(
			sameMirror(mirrored, { ...mirrored, openOn: "lastConversation" }),
		).toBe(false)
	})
})
