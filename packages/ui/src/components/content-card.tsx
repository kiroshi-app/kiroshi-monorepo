import { createContext, type ReactNode, useContext } from "react"

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

const ContentCardLandmarkId = createContext<string | undefined>(undefined)

interface ContentCardProps {
	isLandmark?: boolean
	id?: string
	children?: ReactNode
}

const ContentCard = ({ isLandmark = true, id, children }: ContentCardProps) => {
	const shellLandmarkId = useContext(ContentCardLandmarkId)
	const landmarkId = id ?? shellLandmarkId

	return isLandmark ? (
		<SidebarInset
			className={cn(SURFACE, landmarkId && "outline-none")}
			data-content-card=""
			id={landmarkId}
			tabIndex={landmarkId ? -1 : undefined}
		>
			{children}
		</SidebarInset>
	) : (
		<div className={SURFACE} data-content-card="" data-slot="sidebar-inset">
			{children}
		</div>
	)
}

export { ContentCard, ContentCardLandmarkId }
