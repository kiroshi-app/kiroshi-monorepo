import { textOf } from "./settings-search"

export type ThreadSearch = {
	bot?: string
	conversation?: string
	mission?: string
}

export const validateThreadSearch = (
	search: Record<string, unknown>,
): ThreadSearch => ({
	bot: textOf(search.bot),
	conversation: textOf(search.conversation),
	mission: textOf(search.mission),
})
