import { useMemo } from "react"

import type { WorkspaceTabs } from "./workspace-tabs"

import type { SidebarActions } from "../sidebar/use-sidebar-actions"
import {
	type JoinedSpacesController,
	openRowIdOf,
} from "../spaces/joined-spaces-controller"
import type { SpacesController } from "../spaces/spaces-controller"

export type SettingsSpaceSwitchSource = {
	joinedSpaces: JoinedSpacesController
	sidebarActions: Pick<SidebarActions, "onSelectSpace">
	spaces: SpacesController
	tabs: WorkspaceTabs
}

export const useSettingsSpaceSwitch = ({
	joinedSpaces,
	sidebarActions,
	spaces,
	tabs,
}: SettingsSpaceSwitchSource) =>
	useMemo(() => {
		const switchSpace = (id: string) => {
			sidebarActions.onSelectSpace(id)
			tabs.showSpace(id)
		}

		const createSpace = async (reopenSettings: () => void) => {
			await spaces.create()
			const openRowId = openRowIdOf(
				joinedSpaces.getState(),
				spaces.getState().selectedSpaceId,
			)
			if (openRowId !== null) {
				tabs.showSpace(openRowId)
			}
			reopenSettings()
		}

		return { switchSpace, createSpace }
	}, [joinedSpaces, sidebarActions, spaces, tabs])
