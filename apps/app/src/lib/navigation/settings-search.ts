export const COMPANION_DANGER_ENTRY = "danger"

export const APPLICATIONS_ENTRY = "mcp"

export type SettingsSearch = {
	entry?: string
	application?: string
}

export type CompanionSettingsSearch = SettingsSearch & {
	isFromSpaceSettings?: boolean
}

export const textOf = (value: unknown) =>
	typeof value === "string" ? value : undefined

export const validateSettingsSearch = (
	search: Record<string, unknown>,
): SettingsSearch => ({
	entry: textOf(search.entry),
	application: textOf(search.application),
})

export const validateCompanionSettingsSearch = (
	search: Record<string, unknown>,
): CompanionSettingsSearch => ({
	...validateSettingsSearch(search),
	isFromSpaceSettings: search.isFromSpaceSettings === true ? true : undefined,
})
