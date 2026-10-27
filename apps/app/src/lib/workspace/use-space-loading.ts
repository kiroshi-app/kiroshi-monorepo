import { useCallback, useEffect, useMemo } from "react"

import type { ApplicationScopes } from "./use-application-scopes"
import type { WorkspaceCore } from "./use-workspace-core"

import type { RosterSpace } from "../bots/roster-controller"
import { openRowIdOf, rosterSpacesOf } from "../spaces/joined-spaces-controller"
import { useSpaceEntry } from "../spaces/use-space-entry"
import { lastBotIn } from "../user/preferences-mirror"

type SpaceLoadingInput = {
	core: WorkspaceCore
	scopes: ApplicationScopes
	reopenedSpaceId: string | null
}

export const useSpaceLoading = ({
	core,
	scopes,
	reopenedSpaceId,
}: SpaceLoadingInput) => {
	const { joinedSpaces, roster, spaces, user } = core
	const { selectedSpaceId, openRowId } = scopes
	const activeHostId = joinedSpaces.hosts.active

	const listedSpaces = JSON.stringify(
		rosterSpacesOf(
			spaces.state.spaces,
			joinedSpaces.state.joinedSpaces,
			activeHostId,
		),
	)
	const rosterScope = useMemo(
		() => ({
			hostId: activeHostId,
			spaces: JSON.parse(listedSpaces) as RosterSpace[],
		}),
		[activeHostId, listedSpaces],
	)

	const loadSpaces = useCallback(() => {
		const spaceId =
			reopenedSpaceId ?? user.controller.getState().preferences.lastSpaceId
		void spaces.controller
			.load(spaceId)
			.then(() => joinedSpaces.controller.restore(spaceId))
	}, [
		spaces.controller,
		joinedSpaces.controller,
		user.controller,
		reopenedSpaceId,
	])

	useEffect(() => {
		loadSpaces()
	}, [loadSpaces])

	useEffect(() => {
		if (rosterScope.spaces.length === 0) {
			return
		}
		const spaceRowId = openRowIdOf(
			joinedSpaces.controller.getState(),
			spaces.controller.getState().selectedSpaceId,
		)
		void roster.controller.load({
			spaces: rosterScope.spaces,
			spaceRowId,
			lastRowId: lastBotIn(user.controller.getState().preferences, spaceRowId),
		})
	}, [
		roster.controller,
		spaces.controller,
		joinedSpaces.controller,
		user.controller,
		rosterScope,
	])

	useSpaceEntry({
		roster: roster.controller,
		user: user.controller,
		selectedSpaceId,
		openRowId,
	})

	return loadSpaces
}
