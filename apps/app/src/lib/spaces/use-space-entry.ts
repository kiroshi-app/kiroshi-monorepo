import { useEffect } from "react"

import type { RosterController } from "../bots/roster-controller"
import { lastBotIn, type MirroredPreferences } from "../user/preferences-mirror"

type SpaceMemory = {
	getState: () => { preferences: MirroredPreferences }
	setLastSpace: (spaceId: string) => Promise<void>
}

export type SpaceEntry = {
	roster: RosterController
	user: SpaceMemory
	selectedSpaceId: string | null
	openRowId: string | null
	isMainWindow: boolean
}

export const useSpaceEntry = ({
	roster,
	user,
	selectedSpaceId,
	openRowId,
	isMainWindow,
}: SpaceEntry) => {
	useEffect(() => {
		if (!selectedSpaceId || !openRowId) {
			return
		}
		if (isMainWindow) {
			void user.setLastSpace(openRowId)
		}
		roster.enter({
			spaceRowId: openRowId,
			spaceId: selectedSpaceId,
			lastRowId: lastBotIn(user.getState().preferences, openRowId),
		})
	}, [roster, user, selectedSpaceId, openRowId, isMainWindow])
}
