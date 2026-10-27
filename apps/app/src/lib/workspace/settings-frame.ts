import type { AppFrameRailProps } from "@workspace/ui/components/app-frame"
import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"
import type { Space } from "@workspace/ui/components/space"

export type SettingsFrame = {
	rail: AppFrameRailProps
	currentSpace: Space | undefined
	currentSpaceHost: SpaceHost | undefined
	guardLeave: (requestLeave: SettingsScreenRequestLeave) => () => void
	titleBar: AppTitleBarProps
	width: number | undefined
	onWidthChange: (width: number) => void
	isResizable: boolean
	spaceTint: Space["colour"]
}
