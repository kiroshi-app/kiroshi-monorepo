import { afterEach, describe, expect, it } from "vitest"

import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	i18n,
	languageOf,
} from "@workspace/ui/lib/i18n"

describe("languageOf", () => {
	it("answers the catalogue a name asks for", () => {
		expect(languageOf("en")).toBe("en")
		expect(languageOf("fr")).toBe("fr")
	})

	it("drops the region and the case a machine names its locale with", () => {
		expect(languageOf("en-GB")).toBe("en")
		expect(languageOf("EN")).toBe("en")
		expect(languageOf("fr-CA")).toBe("fr")
	})

	it("answers nothing for a language this build ships no catalogue for", () => {
		expect(languageOf("de")).toBeNull()
		expect(languageOf("ja-JP")).toBeNull()
	})

	it("answers nothing when there is no name to look up", () => {
		expect(languageOf(null)).toBeNull()
		expect(languageOf(undefined)).toBeNull()
		expect(languageOf("")).toBeNull()
	})
})

describe("the runtime", () => {
	afterEach(() => {
		activateLanguage(DEFAULT_LANGUAGE)
	})

	it("opens in the default language and reads an activated one back", () => {
		expect(i18n.language).toBe(DEFAULT_LANGUAGE)

		activateLanguage("fr")

		expect(i18n.language).toBe("fr")
	})

	it("reads French once fr is active", () => {
		activateLanguage("fr")

		expect(i18n.t("composer.send")).toBe("Envoyer")
		expect(i18n.t("common:sidebar.close")).toBe("Fermer la barre latérale")
	})

	it("invites in French on the conversation nobody is in yet", () => {
		activateLanguage("fr")

		expect(i18n.t("chat:conversationEmptyState.nobody.description")).toBe(
			"Tapez @ et choisissez un nom. Le compagnon que vous mentionnez rejoint la conversation, et peut à son tour inviter ceux dont il a besoin.",
		)
	})

	it("says a mission the person closed was closed by you, in both languages", () => {
		expect(i18n.t("chat:missions.event.line.dismissed")).toBe("Closed by you")

		activateLanguage("fr")

		expect(i18n.t("chat:missions.event.line.dismissed")).toBe("Fermée par vous")
	})

	it("tells a failed companion deletion from a failed removal from a space, in both languages", () => {
		expect(i18n.t("bots:danger.failed")).toBe(
			"Couldn’t delete this companion. Retry.",
		)
		expect(i18n.t("bots:danger.failed")).not.toBe(
			i18n.t("bots:spaces.remove.failed"),
		)

		activateLanguage("fr")

		expect(i18n.t("bots:danger.failed")).toBe(
			"Impossible de supprimer ce compagnon. Réessayez.",
		)
		expect(i18n.t("bots:danger.failed")).not.toBe(
			i18n.t("bots:spaces.remove.failed"),
		)
	})

	it("counts in the plural forms French takes", () => {
		activateLanguage("fr")

		expect(i18n.t("pinned.counted", { count: 1 })).toBe(
			"Messages épinglés, 1 épinglé",
		)
		expect(i18n.t("pinned.counted", { count: 4 })).toBe(
			"Messages épinglés, 4 épinglés",
		)
		expect(i18n.t("pinned.counted", { count: 1_000_000 })).toBe(
			"Messages épinglés, 1000000 épinglés",
		)
	})
})
