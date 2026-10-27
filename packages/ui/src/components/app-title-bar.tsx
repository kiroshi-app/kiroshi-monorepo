"use client"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar-model"
import { SpaceSwitcher } from "@workspace/ui/components/space-switcher"
import {
	TitleBarTabs,
	type TitleBarTabsProps,
} from "@workspace/ui/components/title-bar-tabs"
import { cn } from "@workspace/ui/lib/utils"

const TITLE_BAR = "absolute inset-x-0 top-0 flex h-10 items-center gap-2 ps-3.5"

const NO_WINDOW_CONTROLS_END = "pe-2"

const TRAFFIC_LIGHTS_SLOT = "w-14.25 shrink-0 self-stretch"

const TITLE_BAR_WINDOW_CONTROLS = "ms-auto flex shrink-0 self-stretch"

// TODO: OPE-1334 drops the switcher and these props once apps/app passes tabs; the rail's Spaces menu takes it over.
type LegacySpaceSwitcherProps = Pick<
	AppSidebarProps,
	| "spaces"
	| "selectedSpaceId"
	| "badgesBySpaceId"
	| "hostBySpaceId"
	| "invitations"
	| "onSelectSpace"
	| "onCreateSpace"
	| "onAcceptInvitation"
	| "onDeclineInvitation"
	| "onRetryInvitation"
	| "onSpaceSwitcherOpenChange"
>

type AppTitleBarProps = TitleBarTabsProps &
	LegacySpaceSwitcherProps &
	Pick<
		AppSidebarProps,
		"insetWindowControls" | "windowControls" | "data-tauri-drag-region"
	>

const AppTitleBar = ({
	insetWindowControls = false,
	windowControls,
	"data-tauri-drag-region": dragRegion,
	spaces = [],
	selectedSpaceId,
	badgesBySpaceId,
	hostBySpaceId,
	invitations,
	onSelectSpace,
	onCreateSpace,
	onAcceptInvitation,
	onDeclineInvitation,
	onRetryInvitation,
	onSpaceSwitcherOpenChange,
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
		{tabStrip.tabs ? (
			<TitleBarTabs {...tabStrip} />
		) : (
			<SpaceSwitcher
				badgesBySpaceId={badgesBySpaceId}
				hostBySpaceId={hostBySpaceId}
				invitations={invitations}
				onAcceptInvitation={onAcceptInvitation}
				onCreateSpace={onCreateSpace}
				onDeclineInvitation={onDeclineInvitation}
				onOpenChange={onSpaceSwitcherOpenChange}
				onRetryInvitation={onRetryInvitation}
				onSelectSpace={onSelectSpace}
				selectedSpaceId={selectedSpaceId}
				spaces={spaces}
			/>
		)}
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
