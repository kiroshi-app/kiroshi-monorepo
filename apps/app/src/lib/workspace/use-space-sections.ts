import { useEffect, useMemo } from "react"

import type { RosterLines } from "./use-roster-lines"
import type { WorkspaceCore } from "./use-workspace-core"

type SpaceSectionsInput = {
	core: WorkspaceCore
	rosterLines: RosterLines
}

export const useSpaceSections = ({ core, rosterLines }: SpaceSectionsInput) => {
	const { collapsedSections, sections } = core
	const { rosters } = rosterLines

	const listedRosters = Object.keys(rosters).join(" ")

	useEffect(() => {
		const rosteredSpaceIds =
			listedRosters === "" ? [] : listedRosters.split(" ")
		sections.controller.keep(rosteredSpaceIds)
		collapsedSections.controller.keep(rosteredSpaceIds)
		const held = collapsedSections.controller.getState().collapsedBySpaceId
		for (const spaceId of rosteredSpaceIds) {
			if (!held[spaceId]) {
				void collapsedSections.controller.enter(spaceId)
			}
		}
	}, [sections.controller, collapsedSections.controller, listedRosters])

	return useMemo(
		() => Object.values(collapsedSections.state.collapsedBySpaceId).flat(),
		[collapsedSections.state.collapsedBySpaceId],
	)
}
