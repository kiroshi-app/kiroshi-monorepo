import type { EnvironmentEntry } from "@workspace/ui/components/environment-panel"

import type { EnvEntry, EnvScope } from "../conversations/store-contract"

type PanelScope = EnvironmentEntry["definedIn"]

const PANEL_SCOPES: PanelScope[] = ["user", "space", "bot", "server"]

const panelScope = (scope: EnvScope): PanelScope | null =>
	PANEL_SCOPES.find((held) => held === scope.kind) ?? null

export const toEnvironmentRows = (entries: EnvEntry[]): EnvironmentEntry[] => {
	const rows = new Map<string, EnvironmentEntry>()

	for (const entry of entries) {
		const definedIn = panelScope(entry.definedIn)
		const servedFrom = panelScope(entry.servedFrom)
		if (!definedIn || !servedFrom) {
			continue
		}

		const narrower = rows.get(entry.name)
		if (narrower) {
			narrower.overrides ??= definedIn
			continue
		}
		rows.set(entry.name, {
			name: entry.name,
			definedIn,
			servedFrom,
			...(entry.isUnset && { isUnset: true }),
		})
	}

	return [...rows.values()]
}
