import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	AppFrame,
	type AppFrameProps,
} from "@workspace/ui/components/app-frame"
import {
	STUDIO,
	TITLE_BAR,
} from "@workspace/ui/components/app-title-bar.fixtures"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { SpaceAvatarState } from "@workspace/ui/components/space-avatar"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const RAIL: AppFrameProps["rail"] = {
	selected: "conversations",
	spaces: [STUDIO],
	user: { name: "Ada Martin" },
	onSelectConversations: fn(),
	onSelectMissions: fn(),
	onOpenSpaceSettings: fn(),
	onOpenYou: fn(),
}

const renderFrame = (args: AppFrameProps) => (
	<WorkspaceShell sidebar={<AppFrame {...args} />}>{null}</WorkspaceShell>
)

const railAvatarStateIn = (canvasElement: HTMLElement) =>
	slotIn(slotIn(canvasElement, "app-rail"), "space-avatar").dataset.state

const drawing = (
	state: SpaceAvatarState,
	spaceHost?: SpaceHost,
	rail = RAIL,
) => ({
	args: { spaceHost, rail },
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expect(railAvatarStateIn(canvasElement)).toBe(state)
	},
})

const meta = preview.meta({
	title: "Navigation/AppFrame",
	component: AppFrame,
	render: renderFrame,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The one place the title bar, the rail and a left column meet: the conversations, missions and every settings screen draw their chrome through it. It takes the current Space and its host connection and hands both to the rail itself, so the Space logo at the top of the rail draws the same connection state on every screen for the same host. The left column is its children.",
			},
		},
	},
	args: {
		titleBar: TITLE_BAR,
		rail: RAIL,
		space: STUDIO,
		children: null,
	},
})

export const LocalSpace = meta.story({
	...drawing("local"),
	parameters: {
		docs: {
			description: {
				story:
					"A Space with no host connection. Check that the rail's Space logo draws the local state.",
			},
		},
	},
})

export const SharedSpace = meta.story({
	...drawing("shared", "shared"),
	parameters: {
		docs: {
			description: {
				story:
					"A Space the reader hosts and shares. Check that the rail's Space logo draws the shared state.",
			},
		},
	},
})

export const OnlineSpace = meta.story({
	...drawing("online", "up"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is reachable. Check that the rail's Space logo draws the online state.",
			},
		},
	},
})

export const ConnectingSpace = meta.story({
	...drawing("connecting", "connecting"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is being reached. Check that the rail's Space logo draws the connecting state.",
			},
		},
	},
})

export const OfflineSpace = meta.story({
	...drawing("offline", "down"),
	parameters: {
		docs: {
			description: {
				story:
					"A joined Space whose host is out of reach. Check that the rail's Space logo draws the offline state.",
			},
		},
	},
})

export const OfflineSpaceWithSpaceSettingsOpen = meta.story({
	...drawing("offline", "down", { ...RAIL, openSettings: "space" }),
	parameters: {
		docs: {
			description: {
				story:
					"`OfflineSpace` while the Space settings are open, the Space logo being the current rail entry. Check that the selection does not change the connection state the logo draws.",
			},
		},
	},
})

export const OfflineSpaceDark = meta.story({
	...drawing("offline", "down"),
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"`OfflineSpace` in the dark theme. Check that the rail's Space logo draws the offline state.",
			},
		},
	},
})
