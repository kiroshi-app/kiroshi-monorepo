import { createContext, useContext } from "react"

import type { LiveHtmlTheme } from "@/lib/bindings"
import { spaceColourOf } from "@/lib/spaces/joined-spaces-controller"
import { useResolvedScheme } from "@/lib/theme/use-theme"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

export const LiveHtmlSpaceContext = createContext<string | null>(null)

export const useLiveHtmlTheme = (): LiveHtmlTheme => {
	const workspace = useContext(WorkspaceContext)
	const spaceId = useContext(LiveHtmlSpaceContext)
	const appearance = useResolvedScheme(
		workspace?.core.preferences.colorScheme ?? "system",
	)
	const hue = workspace
		? spaceColourOf(
				spaceId,
				workspace.core.spaces.state,
				workspace.core.joinedSpaces.state,
			)
		: null
	return { appearance, hue: hue ?? null }
}
