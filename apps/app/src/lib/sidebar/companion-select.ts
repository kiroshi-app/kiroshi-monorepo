import { useMemo } from "react"

import type { CompanionSelect } from "@workspace/ui/components/companion-select"

import type { ThreadSearch } from "../navigation/thread-search"
import { opensInNewTab } from "../tabs/new-tab-clicks"

type RosterMember = { id: string }

export type CompanionSelectSource = {
	rosters: Record<string, RosterMember[]>
	openSpaceId: string | null
	select: (companionId: string) => void
	leaveMission: () => void
	openThreadInNewTab: (thread: ThreadSearch) => void
}

const NO_COMPANION_SELECT: CompanionSelect = () => undefined

export const useCompanionSelectGuard = ({
	rosters,
	openSpaceId,
	select,
	leaveMission,
	openThreadInNewTab,
}: CompanionSelectSource): CompanionSelect =>
	useMemo(() => {
		if (!openSpaceId) return NO_COMPANION_SELECT

		const members = rosters[openSpaceId] ?? []

		return (companionId, modifiers) => {
			if (!members.some((member) => member.id === companionId)) {
				return
			}
			if (opensInNewTab(modifiers)) {
				openThreadInNewTab({ bot: companionId })
				return
			}
			leaveMission()
			select(companionId)
		}
	}, [rosters, openSpaceId, select, leaveMission, openThreadInNewTab])
