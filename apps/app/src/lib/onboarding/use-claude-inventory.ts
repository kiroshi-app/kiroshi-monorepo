import { useQuery, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { claudeImportQueryKeys } from "./claude-import-query-keys"
import { readClaudeInventory } from "./claude-import-transport"

import type { ClaudeInventory } from "@/lib/bindings"

type ClaudeInventoryRead = {
	inventory: ClaudeInventory | null
	readAgain: () => void
	readAfterImport: () => Promise<void>
}

const READ_FAILED: ClaudeInventory = { kind: "refused", cause: "" }

export const useClaudeInventory = (): ClaudeInventoryRead => {
	const queryClient = useQueryClient()
	const { data, isError, refetch } = useQuery({
		queryKey: claudeImportQueryKeys.inventory(),
		queryFn: readClaudeInventory,
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:claudeImport.unreadable.title"),
			}),
			raisedIn: "use-claude-inventory",
		},
	})

	return {
		inventory: isError ? READ_FAILED : (data ?? null),
		readAgain: () => void refetch(),
		readAfterImport: () =>
			queryClient.invalidateQueries({
				queryKey: claudeImportQueryKeys.inventory(),
			}),
	}
}
