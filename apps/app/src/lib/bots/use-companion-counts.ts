import { skipToken, useQuery } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { botQueryKeys } from "./bot-query-keys"

import type { CompanionCounts } from "../bindings"
import { invoke, isDesktopHost } from "../host/index"

type CompanionCountsOf = (botId: string) => CompanionCounts | undefined

const readCompanionCounts = (spaceId: string) =>
	invoke<CompanionCounts[]>("space_companion_counts", { spaceId })

export const useCompanionCounts = (
	shownSpaceId: string | undefined,
): CompanionCountsOf => {
	const readId = isDesktopHost() ? shownSpaceId : undefined
	const { data } = useQuery({
		queryKey: botQueryKeys.companionCountsOf(readId),
		queryFn: readId ? () => readCompanionCounts(readId) : skipToken,
		gcTime: 0,
		meta: {
			failureNotice: () => ({
				title: i18n.t("settings:space.agents.countsUnreadable"),
			}),
			raisedIn: "use-companion-counts",
		},
	})
	return (botId) => data?.find((counts) => counts.botId === botId)
}
