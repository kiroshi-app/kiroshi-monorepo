import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import type { Space } from "@workspace/ui/components/space"

export const STUDIO: Space = { id: "studio", name: "Studio", colour: "orange" }

export const GARAGE: Space = { id: "garage", name: "Garage" }

export const TITLE_BAR: AppTitleBarProps = {
	"data-tauri-drag-region": "deep",
	insetWindowControls: true,
	spaces: [STUDIO, GARAGE],
	selectedSpaceId: STUDIO.id,
}
