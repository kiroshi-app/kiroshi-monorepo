import type { ReactNode } from "react"

import { SidebarInset } from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

const YIELDS_INSIDE_A_CARD = [
	"in-data-content-card:rounded-none",
	"in-data-content-card:border-0",
	"in-data-content-card:bg-transparent",
].join(" ")

const JOINS_THE_PANEL_BESIDE_IT =
	"peer-data-[slot=sidebar]:rounded-s-none peer-data-[slot=sidebar]:border-s-0 peer-data-[slot=settings-menu]:rounded-s-none peer-data-[slot=settings-menu]:border-s-0"

const SURFACE = `relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-control border border-shell-border bg-card ${JOINS_THE_PANEL_BESIDE_IT} ${YIELDS_INSIDE_A_CARD}`

interface ContentCardProps {
	isLandmark?: boolean
	id?: string
	children?: ReactNode
}

const ContentCard = ({ isLandmark = true, id, children }: ContentCardProps) =>
	isLandmark ? (
		<SidebarInset
			className={cn(SURFACE, id && "outline-none")}
			data-content-card=""
			id={id}
			tabIndex={id ? -1 : undefined}
		>
			{children}
		</SidebarInset>
	) : (
		<div className={SURFACE} data-content-card="" data-slot="sidebar-inset">
			{children}
		</div>
	)

export { ContentCard }
