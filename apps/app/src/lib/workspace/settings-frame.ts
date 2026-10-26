import type { ReactNode } from "react"

import type { AppTitleBarProps } from "@workspace/ui/components/app-title-bar"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"

import type { ApplicationScopes } from "@/lib/workspace/use-application-scopes"

export type SettingsFrame = {
	rail: (requestLeave: SettingsScreenRequestLeave) => ReactNode
	titleBar: AppTitleBarProps
	width: number | undefined
	onWidthChange: (width: number) => void
	isResizable: boolean
	spaceTint: ApplicationScopes["spaceTint"]
}
