import { useMutation } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import type { UserController } from "./preferences-controller"

type SidebarCollapseInput = {
	isCollapsed: boolean
	controller: Pick<UserController, "setSidebarCollapsed">
}

export type SidebarCollapse = {
	isOpen: boolean
	changeOpen: (isOpen: boolean) => void
	toggle: () => void
}

export const useSidebarCollapse = ({
	isCollapsed,
	controller,
}: SidebarCollapseInput): SidebarCollapse => {
	const save = useMutation({
		mutationFn: (shouldCollapse: boolean) =>
			controller.setSidebarCollapsed(shouldCollapse),
		meta: {
			failureNotice: () => ({
				title: i18n.t("common:sidebar.collapseUnsaved"),
			}),
			raisedIn: "use-sidebar-collapse",
		},
	})
	const changeOpen = (isOpen: boolean) => save.mutate(!isOpen)

	return {
		isOpen: !isCollapsed,
		changeOpen,
		toggle: () => changeOpen(isCollapsed),
	}
}
