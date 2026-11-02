import { useCallback, useState } from "react"

import type { User } from "./use-user"

import type { SidebarTab } from "@/lib/bindings"

export type SidebarPanel = Extract<SidebarTab, "conversations" | "missions">

const panelOf = (tab: SidebarTab): SidebarPanel =>
	tab === "missions" ? "missions" : "conversations"

export const useSidebarTab = ({ controller, state }: User) => {
	const [clickedTab, setClickedTab] = useState<SidebarPanel | null>(null)
	const openTab = clickedTab ?? panelOf(state.preferences.sidebarTab)

	const openSidebarTab = useCallback(
		(tab: SidebarPanel) => {
			setClickedTab(tab)
			void controller.setSidebarTab(tab)
		},
		[controller],
	)

	return { openTab, openSidebarTab }
}
