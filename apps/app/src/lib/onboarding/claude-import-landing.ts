import { i18n } from "@workspace/ui/lib/i18n"

import type { ClaudeImported } from "./claude-import-controller"

const listed = (parts: string[]) =>
	new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(parts)

const extrasOf = ({ hasInstructions, skillCount }: ClaudeImported) => [
	...(hasInstructions ? [i18n.t("common:claudeImport.done.instructions")] : []),
	...(skillCount > 0
		? [i18n.t("common:claudeImport.row.skills", { count: skillCount })]
		: []),
]

const companionsLandingOf = (companions: string[], extras: string[]) => {
	const filled = { companions: listed(companions), count: companions.length }
	return extras.length === 0
		? i18n.t("common:claudeImport.landing.companions", filled)
		: i18n.t("common:claudeImport.landing.companionsWith", {
				...filled,
				extras: listed(extras),
			})
}

export const landingTitleOf = (imported: ClaudeImported): string | null => {
	const extras = extrasOf(imported)
	if (imported.companions.length > 0) {
		return companionsLandingOf(imported.companions, extras)
	}
	if (extras.length > 0) {
		return i18n.t("common:claudeImport.landing.extras", {
			extras: listed(extras),
		})
	}
	return null
}
