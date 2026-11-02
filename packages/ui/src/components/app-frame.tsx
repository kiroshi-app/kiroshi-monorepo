"use client"

import type { ReactNode } from "react"

import { AppRail, type AppRailProps } from "@workspace/ui/components/app-rail"
import {
	AppTitleBar,
	type AppTitleBarProps,
} from "@workspace/ui/components/app-title-bar"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { Space } from "@workspace/ui/components/space"
import {
	WorkspaceShellRoot,
	type WorkspaceShellRootProps,
} from "@workspace/ui/components/workspace-shell"

type AppFrameRailProps = Omit<AppRailProps, "space" | "spaceHost"> &
	Pick<AppTitleBarProps, "data-tauri-drag-region">

type AppFrameProps = {
	titleBar: AppTitleBarProps
	rail: AppFrameRailProps
	space?: Space
	spaceHost?: SpaceHost
	children: ReactNode
}

const AppFrame = ({
	titleBar,
	rail,
	space,
	spaceHost,
	children,
}: AppFrameProps) => (
	<>
		<AppTitleBar {...titleBar} />
		<AppRail {...rail} space={space} spaceHost={spaceHost} />
		{children}
	</>
)

type AppFrameShellProps = AppFrameProps &
	Omit<WorkspaceShellRootProps, "children" | "className" | "isLandmark">

const AppFrameShell = ({
	titleBar,
	rail,
	space,
	spaceHost,
	children,
	...shell
}: AppFrameShellProps) => (
	<WorkspaceShellRoot {...shell}>
		<AppFrame
			rail={rail}
			space={space}
			spaceHost={spaceHost}
			titleBar={titleBar}
		>
			{children}
		</AppFrame>
	</WorkspaceShellRoot>
)

export {
	AppFrame,
	type AppFrameProps,
	type AppFrameRailProps,
	AppFrameShell,
	type AppFrameShellProps,
}
