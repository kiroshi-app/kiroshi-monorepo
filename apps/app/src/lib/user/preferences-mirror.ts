import {
	activateLanguage,
	DEFAULT_LANGUAGE,
	type Language,
	languageOf,
} from "@workspace/ui/lib/i18n"

import type {
	BotIdBySpace,
	ColorScheme,
	UserPreferences,
} from "./preferences-contract"

import type { OpenOn } from "@/lib/bindings"

const COLOR_SCHEME_KEY = "theme"
const LANGUAGE_KEY = "language"
const SIDEBAR_WIDTH_KEY = "sidebarWidth"
const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed"
const DOCUMENT_PANEL_WIDTH_KEY = "documentPanelWidth"
const ACTIVITY_PANEL_OPEN_KEY = "activityPanelOpen"
const FIRST_RUN_DONE_KEY = "firstRunDone"
const LAST_SPACE_KEY = "lastSpaceId"
const LAST_BOT_BY_SPACE_KEY = "lastBotIdBySpace"
const DROPPED_LAST_BOT_KEY = "lastBotId"
const OPEN_ON_KEY = "openOn"

const COLOR_SCHEMES: ColorScheme[] = ["system", "light", "dark"]

const DEFAULT_COLOR_SCHEME: ColorScheme = "system"

const OPEN_ON_CHOICES: OpenOn[] = ["newConversation", "lastConversation"]

const DEFAULT_OPEN_ON: OpenOn = "newConversation"

const SWITCH_ON = "on"
const SWITCH_OFF = "off"

export type MirroredPreferences = {
	colorScheme: ColorScheme
	language: Language | null
	sidebarWidth: number | null
	sidebarCollapsed: boolean
	activityPanelOpen: boolean
	firstRunDone: boolean
	lastSpaceId: string | null
	lastBotIdBySpace: BotIdBySpace
	openOn: OpenOn
}

const colorSchemeOf = (value: string | null): ColorScheme =>
	COLOR_SCHEMES.find((scheme) => scheme === value) ?? DEFAULT_COLOR_SCHEME

const openOnOf = (value: string | null): OpenOn =>
	OPEN_ON_CHOICES.find((choice) => choice === value) ?? DEFAULT_OPEN_ON

const isBotIdBySpace = (value: unknown): value is BotIdBySpace =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((botId) => typeof botId === "string")

const botIdBySpaceOf = (value: unknown): BotIdBySpace =>
	isBotIdBySpace(value) ? value : {}

export const parseBotIdBySpace = (value: string | null): BotIdBySpace => {
	try {
		return botIdBySpaceOf(JSON.parse(value ?? ""))
	} catch {
		return {}
	}
}

const sameBotIdBySpace = (one: BotIdBySpace, other: BotIdBySpace) => {
	const spaceIds = Object.keys(one)
	return (
		spaceIds.length === Object.keys(other).length &&
		spaceIds.every((spaceId) => one[spaceId] === other[spaceId])
	)
}

export const lastBotIn = (
	mirrored: MirroredPreferences,
	spaceId: string | null,
) => (spaceId === null ? null : (mirrored.lastBotIdBySpace[spaceId] ?? null))

const widthOf = (value: string | null): number | null => {
	const width = Number.parseInt(value ?? "", 10)
	return Number.isNaN(width) ? null : width
}

const draggedWidthOf = (value: string | null): number | null => {
	const width = Number(value)
	return Number.isInteger(width) && width > 0 ? width : null
}

export const readDocumentPanelWidth = () =>
	draggedWidthOf(localStorage.getItem(DOCUMENT_PANEL_WIDTH_KEY))

export const keepDocumentPanelWidth = (width: number) => {
	localStorage.setItem(DOCUMENT_PANEL_WIDTH_KEY, String(width))
}

export const activeLanguageOf = (chosen: string | null): Language =>
	languageOf(chosen) ?? languageOf(navigator.language) ?? DEFAULT_LANGUAGE

export const applyLanguage = (chosen: Language | null) => {
	activateLanguage(activeLanguageOf(chosen))
}

export const mirrorOf = (record: UserPreferences): MirroredPreferences => ({
	colorScheme: colorSchemeOf(record.colorScheme),
	language: languageOf(record.language),
	sidebarWidth: record.sidebarWidth ?? null,
	sidebarCollapsed: record.sidebarCollapsed === true,
	activityPanelOpen: record.activityPanelOpen === true,
	firstRunDone: record.firstRunDone === true,
	lastSpaceId: record.lastSpaceId ?? null,
	lastBotIdBySpace: botIdBySpaceOf(record.lastBotIdBySpace),
	openOn: openOnOf(record.openOn),
})

export const sameMirror = (
	one: MirroredPreferences,
	other: MirroredPreferences,
) =>
	one.colorScheme === other.colorScheme &&
	one.language === other.language &&
	one.sidebarWidth === other.sidebarWidth &&
	one.sidebarCollapsed === other.sidebarCollapsed &&
	one.activityPanelOpen === other.activityPanelOpen &&
	one.firstRunDone === other.firstRunDone &&
	one.lastSpaceId === other.lastSpaceId &&
	sameBotIdBySpace(one.lastBotIdBySpace, other.lastBotIdBySpace) &&
	one.openOn === other.openOn

export const readMirror = (): MirroredPreferences => ({
	colorScheme: colorSchemeOf(localStorage.getItem(COLOR_SCHEME_KEY)),
	language: languageOf(localStorage.getItem(LANGUAGE_KEY)),
	sidebarWidth: widthOf(localStorage.getItem(SIDEBAR_WIDTH_KEY)),
	sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === SWITCH_ON,
	activityPanelOpen:
		localStorage.getItem(ACTIVITY_PANEL_OPEN_KEY) === SWITCH_ON,
	firstRunDone: localStorage.getItem(FIRST_RUN_DONE_KEY) === SWITCH_ON,
	lastSpaceId: localStorage.getItem(LAST_SPACE_KEY),
	lastBotIdBySpace: parseBotIdBySpace(
		localStorage.getItem(LAST_BOT_BY_SPACE_KEY),
	),
	openOn: openOnOf(localStorage.getItem(OPEN_ON_KEY)),
})

const keep = (key: string, value: string | number | null) => {
	if (value === null) {
		localStorage.removeItem(key)
		return
	}

	localStorage.setItem(key, String(value))
}

export const writeMirror = (mirrored: MirroredPreferences) => {
	localStorage.setItem(COLOR_SCHEME_KEY, mirrored.colorScheme)
	keep(LANGUAGE_KEY, mirrored.language)
	keep(SIDEBAR_WIDTH_KEY, mirrored.sidebarWidth)
	localStorage.setItem(
		SIDEBAR_COLLAPSED_KEY,
		mirrored.sidebarCollapsed ? SWITCH_ON : SWITCH_OFF,
	)
	localStorage.setItem(
		ACTIVITY_PANEL_OPEN_KEY,
		mirrored.activityPanelOpen ? SWITCH_ON : SWITCH_OFF,
	)
	localStorage.setItem(
		FIRST_RUN_DONE_KEY,
		mirrored.firstRunDone ? SWITCH_ON : SWITCH_OFF,
	)
	keep(LAST_SPACE_KEY, mirrored.lastSpaceId)
	keep(LAST_BOT_BY_SPACE_KEY, JSON.stringify(mirrored.lastBotIdBySpace))
	localStorage.removeItem(DROPPED_LAST_BOT_KEY)
	localStorage.setItem(OPEN_ON_KEY, mirrored.openOn)
}

const MIRROR_KEYS = [
	COLOR_SCHEME_KEY,
	LANGUAGE_KEY,
	SIDEBAR_WIDTH_KEY,
	SIDEBAR_COLLAPSED_KEY,
	ACTIVITY_PANEL_OPEN_KEY,
	FIRST_RUN_DONE_KEY,
	LAST_SPACE_KEY,
	LAST_BOT_BY_SPACE_KEY,
	OPEN_ON_KEY,
]

export const isMirrorKey = (key: string | null) =>
	MIRROR_KEYS.some((mirrored) => mirrored === key)
