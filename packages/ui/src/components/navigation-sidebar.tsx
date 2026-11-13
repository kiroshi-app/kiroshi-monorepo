"use client"

import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import {
	SidebarPeek,
	useSidebarDock,
} from "@workspace/ui/components/sidebar-peek"
import { SidebarResizeHandle } from "@workspace/ui/components/sidebar-resize"
import { useSidebar } from "@workspace/ui/components/ui/sidebar"
import {
	type UpdateBadgeProps,
	UpdateRow,
} from "@workspace/ui/components/update-badge"

const SIDEBAR = "relative flex min-h-0 w-(--sidebar-width) shrink-0"

const CLIP = "flex min-h-0 min-w-0 flex-1 overflow-clip"

type NavigationSidebarProps = Omit<
	ExpandedSidebarProps,
	"update" | "trigger"
> & {
	update?: UpdateBadgeProps
}

const NavigationSidebar = ({ update, ...sidebar }: NavigationSidebarProps) => {
	const { open } = useSidebar()
	const { layout, isSliding } = useSidebarDock()
	const expanded = (
		<ExpandedSidebar
			{...sidebar}
			update={update ? <UpdateRow {...update} /> : null}
		/>
	)

	if (layout === "collapsed" && !isSliding)
		return <SidebarPeek>{expanded}</SidebarPeek>

	return (
		<div className={SIDEBAR} data-slot="navigation-sidebar" inert={!open}>
			<div className={CLIP}>{expanded}</div>
			<SidebarResizeHandle side="left" />
		</div>
	)
}

export { NavigationSidebar, type NavigationSidebarProps }
