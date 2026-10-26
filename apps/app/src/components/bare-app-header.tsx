import { AppHeader } from "@workspace/ui/components/app-header"

import { hasOverlayWindowControls } from "@/lib/host"

export const BareAppHeader = () => (
	<AppHeader
		data-tauri-drag-region="deep"
		insetWindowControls={hasOverlayWindowControls()}
	/>
)
