export const DRAG_GHOST_WINDOW = "drag-ghost"

export const DRAG_GHOST_STATE_EVENT = "drag-ghost-state"

export type DockTarget = "outside" | "sameSpace" | "otherSpace"

export type DragGhostState = {
	tabId: string
	spaceId: string
	target: DockTarget
}
