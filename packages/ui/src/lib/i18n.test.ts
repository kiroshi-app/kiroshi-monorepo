import { afterEach, describe, expect, it } from "vitest"

import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	i18n,
	languageOf,
} from "@workspace/ui/lib/i18n"

const NAMED_AGENT_KEYS = [
	"chat:screen.approval.descriptionNamed",
	"chat:screen.notice.crashedNamed",
	"chat:screen.notice.settingsRejectedNamed",
	"chat:screen.notice.unavailableNamed",
	"chat:screen.notice.stopFailedNamed",
	"chat:screen.transport.binaryNotFoundNamed",
	"chat:screen.transport.spawnFailedNamed",
	"chat:screen.transport.startupTimeoutNamed",
	"chat:screen.transport.crashedNamed",
	"chat:screen.transport.crashedDetailNamed",
	"chat:screen.transport.crashedUnknownCodeNamed",
	"chat:screen.transport.crashedUnknownCodeDetailNamed",
	"chat:screen.transport.resumeFailedNamed",
	"chat:screen.transport.runLapsedSilentNamed",
	"chat:screen.transport.runLapsedInterruptNamed",
] as const

const PLACEHOLDERS = {
	name: "Ada",
	code: 1,
	detail: "EACCES",
	timeoutMs: 30_000,
}

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
			"Tapez @ et choisissez un nom. L’agent que vous mentionnez rejoint la conversation, et peut à son tour inviter ceux dont il a besoin.",
		)
	})

	it("says a mission the person closed was closed by you, in both languages", () => {
		expect(i18n.t("chat:missions.event.line.dismissed")).toBe("Closed by you")

		activateLanguage("fr")

		expect(i18n.t("chat:missions.event.line.dismissed")).toBe("Fermée par vous")
	})

	it("tells a failed companion deletion from a failed removal from a space, in both languages", () => {
		expect(i18n.t("bots:danger.failed")).toBe(
			"Couldn’t delete this agent. Retry.",
		)
		expect(i18n.t("bots:danger.failed")).not.toBe(
			i18n.t("bots:spaces.remove.failed"),
		)

		activateLanguage("fr")

		expect(i18n.t("bots:danger.failed")).toBe(
			"Impossible de supprimer cet agent. Réessayez.",
		)
		expect(i18n.t("bots:danger.failed")).not.toBe(
			i18n.t("bots:spaces.remove.failed"),
		)
	})

	it.each(NAMED_AGENT_KEYS)(
		"names the agent in %s, in both languages",
		(key) => {
			const english = i18n.t(key, PLACEHOLDERS)

			activateLanguage("fr")

			const french = i18n.t(key, PLACEHOLDERS)

			expect(english).toContain("Ada")
			expect(french).toContain("Ada")
			expect(`${english} ${french}`).not.toContain("{{")
			expect(french).not.toBe(english)
		},
	)

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

	it("says what came over from Claude Code on landing, in both languages", () => {
		expect(
			i18n.t("common:claudeImport.landing.companionsWith", {
				companions: "Atlas and Wren",
				count: 2,
				extras: "your CLAUDE.md and 4 skills",
			}),
		).toBe(
			"You’re set up. Atlas and Wren came over from Claude Code, with your CLAUDE.md and 4 skills.",
		)
		expect(
			i18n.t("common:claudeImport.landing.companions", {
				companions: "Atlas",
				count: 1,
			}),
		).toBe("You’re set up. Atlas came over from Claude Code.")
		expect(
			i18n.t("common:claudeImport.landing.extras", { extras: "4 skills" }),
		).toBe("You’re set up, with 4 skills from Claude Code.")

		activateLanguage("fr")

		expect(
			i18n.t("common:claudeImport.landing.companionsWith", {
				companions: "Atlas et Wren",
				count: 2,
				extras: "votre CLAUDE.md et 4 compétences",
			}),
		).toBe(
			"Tout est prêt. Atlas et Wren viennent de Claude Code, avec votre CLAUDE.md et 4 compétences.",
		)
		expect(
			i18n.t("common:claudeImport.landing.companions", {
				companions: "Atlas",
				count: 1,
			}),
		).toBe("Tout est prêt. Atlas vient de Claude Code.")
	})
})
