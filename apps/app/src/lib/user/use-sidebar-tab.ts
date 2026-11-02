import { useCallback, useState } from "react"

import type { User } from "./use-user"

import type { SidebarTab } from "@/lib/bindings"

type PersistedPanel = Extract<SidebarTab, "conversations" | "missions">

export type SidebarPanel = PersistedPanel | "library"

const panelOf = (tab: SidebarTab): PersistedPanel =>
	tab === "missions" ? "missions" : "conversations"

const isPersisted = (panel: SidebarPanel): panel is PersistedPanel =>
	panel !== "library"

export const useSidebarTab = ({ controller, state }: User) => {
	const [clickedTab, setClickedTab] = useState<SidebarPanel | null>(null)
	const openTab = clickedTab ?? panelOf(state.preferences.sidebarTab)

	const openSidebarTab = useCallback(
		(tab: SidebarPanel) => {
			setClickedTab(tab)
			if (isPersisted(tab)) {
				void controller.setSidebarTab(tab)
			}
		},
		[controller],
	)

	return { openTab, openSidebarTab }
}
