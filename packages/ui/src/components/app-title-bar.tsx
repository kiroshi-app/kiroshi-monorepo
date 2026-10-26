"use client"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar-model"
import { SpaceSwitcher } from "@workspace/ui/components/space-switcher"
import { cn } from "@workspace/ui/lib/utils"

const TITLE_BAR = "absolute inset-x-0 top-0 flex h-8.5 items-center gap-2"

const WINDOW_CONTROLS_INSET = "pl-[78px]"

const NO_WINDOW_CONTROLS_INSET = "pl-2.5"

const TITLE_BAR_WINDOW_CONTROLS = "ms-auto flex shrink-0 self-stretch"

type AppTitleBarProps = Pick<
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
	| "insetWindowControls"
	| "windowControls"
	| "data-tauri-drag-region"
>

const AppTitleBar = ({
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
	insetWindowControls = false,
	windowControls,
	"data-tauri-drag-region": dragRegion,
}: AppTitleBarProps) => (
	<div
		className={cn(
			TITLE_BAR,
			insetWindowControls ? WINDOW_CONTROLS_INSET : NO_WINDOW_CONTROLS_INSET,
		)}
		data-slot="app-title-bar"
		data-tauri-drag-region={dragRegion}
	>
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
