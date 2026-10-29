import type {
	ImportAction,
	ImportItem,
	ImportScreenProps,
	ImportSection,
} from "@workspace/ui/components/import-screen"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ClaudeImportSession } from "./claude-import-controller"
import { onboardingStepOf } from "./onboarding-flow-controller"

import type {
	ClaudeImportResult,
	ClaudeInventory,
	ClaudeItem,
	UserPreferences,
} from "@/lib/bindings"

export type ClaudeImportVariant = "onboarding" | "atStart" | "fromSettings"

export type ClaudeImportView = {
	variant: ClaudeImportVariant
	inventory: ClaudeInventory
	session: ClaudeImportSession
}

export type ClaudeImportActions = {
	onToggle: (key: string, isChecked: boolean) => void
	onImport: () => void
	onRetryFailed: () => void
	onReadAgain: () => void
	onLeave: () => void
}

type FoundInventory = Extract<ClaudeInventory, { kind: "found" }>

type ImportOffer = Pick<
	UserPreferences,
	"onboardingStep" | "onboardingImportSeen"
>

const LONG_LIST_AGENT_COUNT = 10

const NO_ITEMS: FoundInventory = {
	kind: "found",
	agents: [],
	skills: [],
	claudeMd: null,
}

const ignorePress = () => undefined

const foundIn = (inventory: ClaudeInventory | null): FoundInventory =>
	inventory?.kind === "found" ? inventory : NO_ITEMS

const itemsOf = ({ agents, claudeMd, skills }: FoundInventory) => [
	...agents,
	...(claudeMd ? [claudeMd] : []),
	...skills,
]

export const offersClaudeImport = (inventory: ClaudeInventory | null) =>
	inventory?.kind === "refused" || itemsOf(foundIn(inventory)).length > 0

export const hasNewClaudeItem = (inventory: ClaudeInventory | null) =>
	itemsOf(foundIn(inventory)).some((item) => !item.alreadyImported)

export const isImportOfferedAtStart = (
	preferences: ImportOffer,
	inventory: ClaudeInventory | null,
) =>
	preferences.onboardingImportSeen === false &&
	onboardingStepOf(preferences) === "done" &&
	hasNewClaudeItem(inventory)

const isPickedIn =
	({ unchecked }: ClaudeImportSession) =>
	(item: ClaudeItem) =>
		!item.alreadyImported && !unchecked.includes(item.key)

export const pickedKeysOf = (
	inventory: ClaudeInventory,
	session: ClaudeImportSession,
) =>
	itemsOf(foundIn(inventory))
		.filter(isPickedIn(session))
		.map((item) => item.key)

const statusOf = (result: ClaudeImportResult | undefined) => {
	if (!result) return undefined
	return result.kind === "failed" ? "failed" : "done"
}

const renamedOf = (item: ClaudeItem, result: ClaudeImportResult | undefined) =>
	result?.kind === "imported" && result.name !== item.name ? result.name : null

const detailOf = (item: ClaudeItem, result: ClaudeImportResult | undefined) => {
	if (result?.kind === "failed") return result.cause
	const renamed = renamedOf(item, result)
	return renamed
		? i18n.t("common:claudeImport.row.nameTaken", { name: item.name, renamed })
		: item.description
}

const selectedItemOf = (
	item: ClaudeItem,
	session: ClaudeImportSession,
): Omit<ImportItem, "kind"> => ({
	id: item.key,
	title: item.name,
	detail: item.description,
	checked: isPickedIn(session)(item),
	isInKiroshi: item.alreadyImported,
})

const importedItemOf = (
	item: ClaudeItem,
	session: ClaudeImportSession,
): Omit<ImportItem, "kind"> => {
	const result = session.results[item.key]
	return {
		id: item.key,
		title: renamedOf(item, result) ?? item.name,
		detail: detailOf(item, result),
		checked: session.selection.includes(item.key),
		status: statusOf(result),
	}
}

const sectionsOf = (
	inventory: FoundInventory,
	session: ClaudeImportSession,
): ImportSection[] => {
	const itemOf = session.selection.length > 0 ? importedItemOf : selectedItemOf
	const rowsOf = (items: ClaudeItem[], kind: ImportItem["kind"]) =>
		items.map((item) => ({ ...itemOf(item, session), kind }))
	const sections: ImportSection[] = [
		{
			id: "companions",
			label: i18n.t("common:claudeImport.sections.companions"),
			items: rowsOf(inventory.agents, "companion"),
		},
		{
			id: "instructions-and-skills",
			label: i18n.t("common:claudeImport.sections.instructionsAndSkills"),
			items: [
				...rowsOf(
					inventory.claudeMd ? [inventory.claudeMd] : [],
					"instructions",
				),
				...rowsOf(inventory.skills, "skill"),
			],
		},
	]
	return sections.filter((section) => section.items.length > 0)
}

const leaveLabelOf = (variant: ClaudeImportVariant) => {
	switch (variant) {
		case "onboarding":
			return i18n.t("common:claudeImport.select.skip")
		case "atStart":
			return i18n.t("common:claudeImport.select.notNow")
		case "fromSettings":
			return i18n.t("common:claudeImport.fromSettings.cancel")
	}
}

const leaveActionOf = (
	variant: ClaudeImportVariant,
	onLeave: () => void,
): ImportAction => ({ label: leaveLabelOf(variant), onPress: onLeave })

const selectSubtitleOf = (
	{ variant, inventory }: ClaudeImportView,
	pickedCount: number,
) => {
	if (pickedCount === 0)
		return i18n.t("common:claudeImport.select.nothingSelected")
	if (variant === "fromSettings")
		return i18n.t("common:claudeImport.fromSettings.body")
	const agentCount = foundIn(inventory).agents.length
	return agentCount >= LONG_LIST_AGENT_COUNT
		? i18n.t("common:claudeImport.select.bodyMany", { count: agentCount })
		: i18n.t("common:claudeImport.select.body")
}

const importLabelOf = (inventory: FoundInventory, picked: string[]) => {
	if (picked.length === 0) return i18n.t("common:claudeImport.select.import")
	const isOnlyAgents = picked.every((key) =>
		inventory.agents.some((agent) => agent.key === key),
	)
	const count = picked.length
	return isOnlyAgents
		? i18n.t("common:claudeImport.select.importCompanions", { count })
		: i18n.t("common:claudeImport.select.importItems", { count })
}

const selectPropsOf = (
	view: ClaudeImportView,
	actions: ClaudeImportActions,
): ImportScreenProps => {
	const inventory = foundIn(view.inventory)
	const picked = pickedKeysOf(inventory, view.session)
	return {
		step: "select",
		title:
			view.variant === "fromSettings"
				? i18n.t("common:claudeImport.fromSettings.title")
				: i18n.t("common:claudeImport.select.title"),
		subtitle: selectSubtitleOf(view, picked.length),
		sections: sectionsOf(inventory, view.session),
		onToggle: actions.onToggle,
		primary: {
			label: importLabelOf(inventory, picked),
			onPress: actions.onImport,
		},
		secondary: leaveActionOf(view.variant, actions.onLeave),
	}
}

const firstFailedNameOf = (sections: ImportSection[]) =>
	sections
		.flatMap((section) => section.items)
		.find((item) => item.status === "failed")?.title

const donePropsOf = (
	{ inventory, session }: ClaudeImportView,
	actions: ClaudeImportActions,
): ImportScreenProps => {
	const sections = sectionsOf(foundIn(inventory), session)
	const failedName = firstFailedNameOf(sections)
	const primary = {
		label: i18n.t("common:claudeImport.done.continue"),
		onPress: actions.onLeave,
	}
	if (failedName === undefined) {
		return {
			step: "done",
			title: i18n.t("common:claudeImport.done.title"),
			sections,
			primary,
		}
	}
	return {
		step: "done",
		title: i18n.t("common:claudeImport.partlyFailed.title"),
		sections,
		primary,
		secondary: {
			label: i18n.t("common:claudeImport.partlyFailed.retry", {
				name: failedName,
			}),
			onPress: actions.onRetryFailed,
		},
	}
}

export const importScreenPropsOf = (
	view: ClaudeImportView,
	actions: ClaudeImportActions,
): ImportScreenProps => {
	const { variant, inventory, session } = view
	if (session.isImporting) {
		return {
			step: "importing",
			title: i18n.t("common:claudeImport.importing.title"),
			sections: sectionsOf(foundIn(inventory), session),
			primary: {
				label: i18n.t("common:claudeImport.importing.action"),
				onPress: ignorePress,
			},
		}
	}
	if (session.selection.length > 0) {
		return donePropsOf(view, actions)
	}
	if (inventory.kind === "refused") {
		return {
			step: "unreadable",
			title: i18n.t("common:claudeImport.unreadable.title"),
			subtitle: i18n.t("common:claudeImport.unreadable.body"),
			primary: {
				label: i18n.t("common:claudeImport.unreadable.retry"),
				onPress: actions.onReadAgain,
			},
			secondary: leaveActionOf(variant, actions.onLeave),
		}
	}
	return selectPropsOf(view, actions)
}
