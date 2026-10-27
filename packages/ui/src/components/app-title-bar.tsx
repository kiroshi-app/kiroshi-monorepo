"use client"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar-model"
import {
	TitleBarTabs,
	type TitleBarTabsProps,
} from "@workspace/ui/components/title-bar-tabs"
import { cn } from "@workspace/ui/lib/utils"

const TITLE_BAR = "absolute inset-x-0 top-0 flex h-10 items-center gap-2 ps-3.5"

const NO_WINDOW_CONTROLS_END = "pe-2"

const TRAFFIC_LIGHTS_SLOT = "w-14.25 shrink-0 self-stretch"

const TITLE_BAR_WINDOW_CONTROLS = "ms-auto flex shrink-0 self-stretch"

type AppTitleBarProps = TitleBarTabsProps &
	Pick<
		AppSidebarProps,
		"insetWindowControls" | "windowControls" | "data-tauri-drag-region"
	>

const AppTitleBar = ({
	insetWindowControls = false,
	windowControls,
	"data-tauri-drag-region": dragRegion,
	...tabStrip
}: AppTitleBarProps) => (
	<div
		className={cn(TITLE_BAR, !windowControls && NO_WINDOW_CONTROLS_END)}
		data-slot="app-title-bar"
		data-tauri-drag-region={dragRegion}
	>
		{insetWindowControls ? (
			<span
				aria-hidden="true"
				className={TRAFFIC_LIGHTS_SLOT}
				data-slot="app-title-bar-traffic-lights"
			/>
		) : null}
		<TitleBarTabs {...tabStrip} />
		{windowControls ? (
			<div
				className={TITLE_BAR_WINDOW_CONTROLS}
				data-slot="app-title-bar-window-controls"
			>
				{windowControls}
			</div>
		) : null}
	</div>
)

export { AppTitleBar, type AppTitleBarProps }
