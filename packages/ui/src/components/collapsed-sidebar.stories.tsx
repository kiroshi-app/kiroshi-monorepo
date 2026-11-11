import { useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	expectSpaceCarouselHeld,
	FRAME_POLL,
	isInBrowserRunner,
	realPointer,
	resolvedRootColor,
	scrollSpaceCarousel,
	slotIn,
	slotsIn,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { ATLAS, BEACON } from "@workspace/ui/components/app-sidebar.fixtures"
import type {
	AppSidebarConversation,
	AppSidebarRowMission,
} from "@workspace/ui/components/app-sidebar-model"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import {
	CollapsedSidebar,
	type CollapsedSidebarProps,
	type CollapsedSidebarZone,
} from "@workspace/ui/components/collapsed-sidebar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { Space } from "@workspace/ui/components/space"
import type { SpaceAvatarState } from "@workspace/ui/components/space-avatar"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

const KIROSHI: Space = {
	id: "kiroshi",
	name: "Kiroshi",
	colour: BLOT_HUES.blue,
	avatarSeed: "kiroshi",
}

const STUDIO: Space = {
	id: "studio",
	name: "Studio",
	colour: BLOT_HUES.purple,
	avatarSeed: "studio",
}

const SEVERAL_SPACES: Space[] = [
	KIROSHI,
	{ id: "perso", name: "Perso", colour: BLOT_HUES.green, avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.pink, avatarSeed: "vocca" },
]

const missionOf = (
	state: BotMissionState,
	externalId: string,
	title: string,
	agentName = "Atlas",
): AppSidebarRowMission => ({
	id: `mission-${externalId}`,
	state,
	ticket: { platform: "linear", externalId, title },
	agentName,
})

const conversationOf = (
	id: string,
	name: string,
	icon: string,
	color: number,
	missions?: AppSidebarRowMission[],
): AppSidebarConversation => ({
	id,
	name,
	icon,
	color,
	participants: [ATLAS, BEACON],
	missions,
})

const RELEASE_TRAIN = conversationOf(
	"release-train",
	"Release train",
	"Rocket",
	BLOT_HUES.orange,
	[
		missionOf("working", "OPE-512", "Rebuild the bundle"),
		missionOf("waiting", "OPE-510", "Ship the release notes", "Beacon"),
	],
)

const ROADMAP = conversationOf(
	"roadmap",
	"Q3 roadmap review",
	"ChartLine",
	BLOT_HUES.green,
)

const HIRING = conversationOf("hiring", "Hiring loop", "Users", BLOT_HUES.pink)

const PRICING = conversationOf(
	"pricing",
	"Pricing page",
	"CreditCard",
	BLOT_HUES.cyan,
)

const SUPPORT = conversationOf(
	"support",
	"Support inbox",
	"MessageSquare",
	BLOT_HUES.blue,
)

const DESIGN = conversationOf(
	"design",
	"Design review",
	"Palette",
	BLOT_HUES.purple,
)

const pinnedZone = (
	conversations: AppSidebarConversation[],
): CollapsedSidebarZone => ({ id: "pinned", conversations })

const recentZone = (
	conversations: AppSidebarConversation[],
): CollapsedSidebarZone => ({ id: "recent", conversations })

const ZONES: CollapsedSidebarZone[] = [
	pinnedZone([DESIGN, ROADMAP]),
	recentZone([RELEASE_TRAIN, HIRING, PRICING, SUPPORT]),
]

const zonesWith = (conversation: AppSidebarConversation) => [
	pinnedZone([DESIGN, ROADMAP]),
	recentZone([conversation, HIRING, PRICING]),
]

const ONE_MISSION = conversationOf(
	"release-train",
	"Release train",
	"Rocket",
	BLOT_HUES.orange,
	[missionOf("working", "OPE-512", "Rebuild the bundle")],
)

const EVERY_STATE = conversationOf(
	"release-train",
	"Release train",
	"Rocket",
	BLOT_HUES.orange,
	[
		missionOf("working", "OPE-512", "Rebuild the bundle"),
		missionOf("ready", "OPE-511", "Bump the runtime"),
		missionOf("waiting", "OPE-510", "Ship the release notes"),
	],
)

const BILLING = conversationOf(
	"billing",
	"Billing migration",
	"Server",
	BLOT_HUES.yellow,
	[
		missionOf("failed", "OPE-521", "Move the invoices table"),
		missionOf("waiting_agent", "OPE-520", "Backfill the ledger", "Beacon"),
	],
)

const OVERFLOWING = conversationOf(
	"release-train",
	"Release train",
	"Rocket",
	BLOT_HUES.orange,
	[
		missionOf("failed", "OPE-514", "Pin the toolchain"),
		missionOf("waiting_agent", "OPE-513", "Split the vendor chunk"),
		missionOf("working", "OPE-512", "Rebuild the bundle"),
		missionOf("ready", "OPE-511", "Bump the runtime"),
		missionOf("waiting", "OPE-510", "Ship the release notes"),
	],
)

const COMPLETED = conversationOf(
	"release-train",
	"Release train",
	"Rocket",
	BLOT_HUES.orange,
	[],
)

const DARK = { theme: "dark", theme_layout: "single" }

const OPEN_CONVERSATION = fn()

const OPEN_MISSION = fn()

const RETRY = fn()

const DOWNLOAD = fn()

const RESTART = fn()

const PAPER_WINDOW = (args: CollapsedSidebarProps) => (
	<WorkspaceShellRoot open={false}>
		<AppTitleBar
			canGoBack
			canGoForward
			insetWindowControls
			onGoBack={fn()}
			onGoForward={fn()}
			onToggleSidebar={fn()}
			tabs={[]}
		/>
		<CollapsedSidebar {...args} />
		<ContentCard />
	</WorkspaceShellRoot>
)

const meta = preview.meta({
	title: "Navigation/CollapsedSidebar",
	component: CollapsedSidebar,
	globals: DARK,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The 60px icon rail of the collapsed navigation shell, top to bottom: the Space avatar, Search, New conversation, Missions, Library, the pinned and conversation items with their missions grouped under them, then the update button and the person when they apply. A two finger horizontal swipe over the list changes Space. Every item names itself in a tooltip to the right of the rail. One story per Paper page A artboard.",
			},
		},
	},
	args: {
		spaces: [KIROSHI],
		selectedSpaceId: KIROSHI.id,
		destination: "newConversation" as const,
		zones: ZONES,
		user: { name: "Ada Martin" },
		onOpenSearch: fn(),
		onNewConversation: fn(),
		onSelectMissions: fn(),
		onSelectLibrary: fn(),
		onOpenSettings: fn(),
		onSelectSpace: fn(),
		onOpenConversation: OPEN_CONVERSATION,
		onOpenMission: OPEN_MISSION,
		onRetryList: RETRY,
	},
	render: PAPER_WINDOW,
})

const rail = (canvasElement: HTMLElement) =>
	within(slotIn(canvasElement, "collapsed-sidebar"))

const tooltipShown = async () => {
	const tooltip = await within(document.body).findByRole("tooltip")
	await waitFor(() => expect(tooltip).toBeVisible())
	return tooltip
}

const expectRightOfRail = async (
	canvasElement: HTMLElement,
	tooltip: HTMLElement,
) =>
	expect(tooltip.getBoundingClientRect().left).toBeGreaterThanOrEqual(
		slotIn(canvasElement, "collapsed-sidebar").getBoundingClientRect().right,
	)

const tileOf = (item: HTMLElement) => getComputedStyle(item, "::before")

const backgroundOf = (element: HTMLElement) =>
	getComputedStyle(element).backgroundColor

const expectHoverTile = async (item: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const pointer = (await import("vitest/browser")).userEvent
	try {
		await pointer.hover(item)
		await expect(tileOf(item).backgroundColor).toBe(
			resolvedRootColor("--title-bar-highlight"),
		)
		await withMotionAllowed(async () => {
			await expect(tileOf(item).transitionDuration).toBe("0s")
		})
	} finally {
		await pointer.unhover(item)
	}
}

const missionCellNamed = (canvasElement: HTMLElement, name: string) =>
	rail(canvasElement)
		.getByText(name)
		.closest('[data-slot="collapsed-sidebar-mission"]') as HTMLElement

const expectNoHoverFill = async (cell: HTMLElement) => {
	if (!isInBrowserRunner()) return
	const pointer = (await import("vitest/browser")).userEvent
	try {
		await pointer.hover(cell)
		await expect(tileOf(cell).backgroundColor).toBe("rgba(0, 0, 0, 0)")
	} finally {
		await pointer.unhover(cell)
	}
}

export const Hover3b = meta.story({
	name: "3b Hover",
	parameters: {
		docs: {
			description: {
				story:
					"The collapsed rail with the pointer on a mission cell. Check the cell is no button and draws no tile, the tooltip opens right of the rail with the ticket and title on line 1, the state in its colour and the agent on line 2, and Missions carries the attention dot.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const cell = missionCellNamed(
			canvasElement,
			"OPE-510 Ship the release notes",
		)
		await expect(cell.tagName).toBe("SPAN")
		await expect(cell.tabIndex).toBe(-1)
		await userEvent.hover(cell)
		const tooltip = await tooltipShown()
		await expect(tooltip).toHaveTextContent(
			"OPE-510Ship the release noteswaiting for you· Beacon",
		)
		await expectRightOfRail(canvasElement, tooltip)
		await expect(
			slotIn(canvasElement, "collapsed-sidebar-attention"),
		).toBeInTheDocument()
		await expectNoHoverFill(cell)
	},
})

export const OneMission = meta.story({
	name: "One mission",
	args: { zones: zonesWith(ONE_MISSION) },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation with one open mission. Check the conversation and its single 44x28 mission cell share one white 5 percent group with no +N, that a click on the cell does nothing and the conversation item opens its conversation.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const [group] = slotsIn(canvasElement, "collapsed-sidebar-group")
		await expect(slotsIn(group, "collapsed-sidebar-mission")).toHaveLength(1)
		await expect(slotsIn(group, "collapsed-sidebar-overflow")).toHaveLength(0)
		await userEvent.click(
			missionCellNamed(canvasElement, "OPE-512 Rebuild the bundle"),
		)
		await expect(OPEN_MISSION).not.toHaveBeenCalled()
		await expect(within(group).getAllByRole("button")).toHaveLength(1)
		const conversation = within(group).getByRole("button", {
			name: "Release train",
		})
		await userEvent.click(conversation)
		await expect(OPEN_CONVERSATION).toHaveBeenCalledWith("release-train")
		conversation.blur()
	},
})

export const EveryOpenState = meta.story({
	name: "Every open state",
	args: {
		zones: [pinnedZone([DESIGN, ROADMAP]), recentZone([EVERY_STATE, BILLING])],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The five open mission states across two groups. Check each glyph wears the state colour of the mission capsules and every group lists waiting, ready, working, waiting on an agent, then blocked.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-mission").map(
				(cell) => cell.dataset.state,
			),
		).toEqual(["waiting", "ready", "working", "waiting_agent", "failed"])
	},
})

export const OverflowCountIsPlainText = meta.story({
	name: "Overflow count is plain text",
	args: {
		destination: undefined,
		zones: zonesWith(OVERFLOWING),
		openMissionId: "mission-OPE-513",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A conversation with five open missions shows the first two then +3. Check +3 is 11px semibold text in the foreground colour with no tile, no button and no tab stop, that a click on it opens nothing, and that a screen reader hears +3 missions.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const [group] = slotsIn(canvasElement, "collapsed-sidebar-group")
		await expect(slotsIn(group, "collapsed-sidebar-mission")).toHaveLength(2)
		const overflow = slotIn(group, "collapsed-sidebar-overflow")
		await expect(overflow).toHaveTextContent("+3")
		await expect(overflow).toHaveTextContent("+3 missions")
		await expect(overflow.tagName).toBe("SPAN")
		await expect(overflow.tabIndex).toBe(-1)
		await expect(within(group).getAllByRole("button")).toHaveLength(1)
		await expect(tileOf(overflow).backgroundColor).toBe("rgba(0, 0, 0, 0)")
		const count = overflow.firstElementChild as HTMLElement
		await expect(getComputedStyle(count).fontSize).toBe("11px")
		await expect(getComputedStyle(count).fontWeight).toBe("600")
		await expect(getComputedStyle(count).color).toBe(
			resolvedRootColor("--foreground"),
		)
		await userEvent.click(overflow)
		await expect(within(document.body).queryByRole("menu")).toBeNull()
		await expectNoHoverFill(overflow)
	},
})

export const HoverOnConversation = meta.story({
	name: "Hover on a conversation",
	args: { zones: zonesWith(EVERY_STATE) },
	parameters: {
		pseudo: { hover: ['[aria-label="Release train"]'] },
		docs: {
			description: {
				story:
					"The pointer rests on a conversation with open missions. Check its 36x36 tile lights white 8 percent and the tooltip reads the title, then the mission count and the state of its first mission.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const item = rail(canvasElement).getByRole("button", {
			name: "Release train",
		})
		await userEvent.hover(item)
		const tooltip = await tooltipShown()
		await expect(tooltip).toHaveTextContent(
			"Release train3 missions· waiting for you",
		)
		await expectHoverTile(item)
	},
})

export const ConversationOpen = meta.story({
	name: "Conversation open",
	args: {
		destination: undefined,
		zones: zonesWith(EVERY_STATE),
		openConversationId: HIRING.id,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Hiring loop is the open conversation. Check its tile holds white 12 percent and it alone carries aria-current.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const item = rail(canvasElement).getByRole("button", {
			name: "Hiring loop",
		})
		await expect(item).toHaveAttribute("aria-current", "page")
		await expect(tileOf(item).backgroundColor).toBe(
			resolvedRootColor("--rail-item-selected"),
		)
		await expect(
			canvasElement.querySelectorAll('[aria-current="page"]'),
		).toHaveLength(1)
	},
})

export const MissionThreadOpen = meta.story({
	name: "Mission thread open",
	args: {
		destination: undefined,
		zones: zonesWith(EVERY_STATE),
		openMissionId: "mission-OPE-511",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The thread of OPE-511 is open. Check its 36x28 tile holds white 12 percent as a state marker on a cell that is no button, and it alone carries aria-current.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const cell = missionCellNamed(canvasElement, "OPE-511 Bump the runtime")
		await expect(cell.tagName).toBe("SPAN")
		await expect(cell).toHaveAttribute("aria-current", "page")
		await expect(tileOf(cell).backgroundColor).toBe(
			resolvedRootColor("--rail-item-selected"),
		)
		await expect(
			canvasElement.querySelectorAll('[aria-current="page"]'),
		).toHaveLength(1)
	},
})

export const TabSkipsTheMissionCells = meta.story({
	name: "Tab skips the mission cells",
	args: { zones: zonesWith(EVERY_STATE) },
	parameters: {
		docs: {
			description: {
				story:
					"Tab walks the whole rail. Check focus lands on the conversations and never on a mission cell.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const cells = slotsIn(canvasElement, "collapsed-sidebar-mission")
		await expect(cells.length).toBeGreaterThan(0)
		const reached = new Set<Element | null>()
		for (let step = 0; step < 40; step++) {
			await userEvent.tab()
			reached.add(document.activeElement)
		}
		await expect(
			reached.has(
				rail(canvasElement).getByRole("button", { name: "Release train" }),
			),
		).toBe(true)
		for (const cell of cells) await expect(reached.has(cell)).toBe(false)
	},
})

export const LastMissionCompletes = meta.story({
	name: "Last mission completes",
	args: { zones: zonesWith(COMPLETED) },
	parameters: {
		docs: {
			description: {
				story:
					"The last open mission of Release train has ended. Check the conversation is drawn as a plain item, with no group background and no mission cell.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const item = rail(canvasElement).getByRole("button", {
			name: "Release train",
		})
		await expect(
			item.closest('[data-slot="collapsed-sidebar-group"]'),
		).toBeNull()
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-group"),
		).toHaveLength(0)
	},
})

const updateSlotNamed = (canvasElement: HTMLElement, name: string) =>
	rail(canvasElement).getByRole("button", { name })

export const U1Collapsed = meta.story({
	name: "U1 Collapsed",
	args: { update: { status: "available", onDownload: DOWNLOAD } },
	parameters: {
		docs: {
			description: {
				story:
					"An update is available. Check the 28px foreground disc with the dark arrow sits above the person, its tooltip reads Download update and pressing it starts the download.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const update = updateSlotNamed(canvasElement, "Download update")
		await expect(update.nextElementSibling).toHaveAttribute(
			"data-slot",
			"collapsed-sidebar-person",
		)
		await userEvent.hover(update)
		await expect(await tooltipShown()).toHaveTextContent("Download update")
		await userEvent.click(update)
		await expect(DOWNLOAD).toHaveBeenCalled()
		update.blur()
	},
})

export const U2Collapsed = meta.story({
	name: "U2 Collapsed",
	args: { update: { status: "downloading", progress: 40 } },
	parameters: {
		docs: {
			description: {
				story:
					"The update is downloading. Check the 28px ring fills 40 percent in the foreground over a white 15 percent track, around a muted arrow.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const update = updateSlotNamed(canvasElement, "Downloading update")
		await expect(update).toHaveAttribute("aria-disabled", "true")
		await expect(within(update).getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"40",
		)
	},
})

export const U3Collapsed = meta.story({
	name: "U3 Collapsed",
	args: {
		update: { status: "ready", version: "0.15.0", onRestart: RESTART },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The update is downloaded. Check the foreground disc carries the counter-clockwise restart glyph and pressing it restarts.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const update = updateSlotNamed(canvasElement, "Restart to update to 0.15.0")
		await userEvent.click(update)
		await expect(RESTART).toHaveBeenCalled()
		update.blur()
	},
})

export const U4Collapsed = meta.story({
	name: "U4 Collapsed",
	args: {
		update: { status: "ready", version: "0.15.0", activeBotCount: 2 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The update is ready but two agents still run. Check the restart disc dims to 50 percent, stays focusable and its tooltip says why it waits.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const update = updateSlotNamed(
			canvasElement,
			"2 agents are still running. Stop them to restart.",
		)
		await expect(update).toHaveAttribute("aria-disabled", "true")
		await expect(
			getComputedStyle(slotIn(update, "collapsed-sidebar-update-disc")).opacity,
		).toBe("0.5")
	},
})

export const U5Collapsed = meta.story({
	name: "U5 Collapsed",
	args: { update: { status: "error", onDownload: DOWNLOAD } },
	parameters: {
		docs: {
			description: {
				story:
					"The update failed. Check the disc turns the failure red with a dark glyph and pressing it downloads again.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const update = updateSlotNamed(
			canvasElement,
			"Update failed, download again",
		)
		await expect(
			backgroundOf(slotIn(update, "collapsed-sidebar-update-disc")),
		).toBe(resolvedRootColor("--update-failed"))
	},
})

export const E1NoConversationsCollapsed = meta.story({
	name: "E1 No conversations Collapsed",
	args: { zones: [pinnedZone([]), recentZone([])] },
	parameters: {
		docs: {
			description: {
				story:
					"The Space holds no conversation yet. Check nothing follows Library, not even the separator.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-separator"),
		).toHaveLength(0)
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-conversation"),
		).toHaveLength(0)
	},
})

export const E2NothingPinnedCollapsed = meta.story({
	name: "E2 Nothing pinned Collapsed",
	args: {
		zones: [pinnedZone([]), recentZone([RELEASE_TRAIN, HIRING, PRICING])],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Nothing is pinned. Check the conversations follow the separator under Library with no pinned block and no second separator.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-separator"),
		).toHaveLength(1)
	},
})

export const E3EmptySectionCollapsed = meta.story({
	name: "E3 Empty section Collapsed",
	args: {
		zones: [
			pinnedZone([DESIGN, ROADMAP]),
			{ id: "clients", name: "Clients", conversations: [] },
			recentZone([RELEASE_TRAIN, HIRING]),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The Clients section is empty. Check a 28px dashed square stands for it between two separators and its tooltip reads Clients · Drop an agent here.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const empty = rail(canvasElement).getByRole("img", {
			name: "Clients · Drop an agent here",
		})
		await expect(empty.previousElementSibling).toHaveAttribute(
			"data-slot",
			"collapsed-sidebar-separator",
		)
		await expect(empty.nextElementSibling).toHaveAttribute(
			"data-slot",
			"collapsed-sidebar-separator",
		)
		await userEvent.hover(empty)
		await expect(await tooltipShown()).toHaveTextContent(
			"Clients· Drop an agent here",
		)
	},
})

export const L1LoadingCollapsed = meta.story({
	name: "L1 Loading Collapsed",
	args: { listStatus: "loading" },
	parameters: {
		docs: {
			description: {
				story:
					"The conversations are loading. Check 28px skeleton squares in 44px slots replace the list and fill its height.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "collapsed-sidebar-conversation"),
		).toHaveLength(0)
		await expectSkeletonFilledTo(canvasElement, "bottom")
	},
})

export const L2FailedCollapsed = meta.story({
	name: "L2 Failed Collapsed",
	args: { listStatus: "failed" },
	parameters: {
		docs: {
			description: {
				story:
					"The conversations could not load. Check one white 8 percent slot with the retry glyph replaces the list, its tooltip names the failure and pressing it retries.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const retry = rail(canvasElement).getByRole("button", { name: "Retry" })
		await userEvent.hover(retry)
		await expect(await tooltipShown()).toHaveTextContent(
			"RetryCouldn’t load your agents.",
		)
		await userEvent.click(retry)
		await expect(RETRY).toHaveBeenCalled()
		retry.blur()
	},
})

export const L3LoadingMoreCollapsed = meta.story({
	name: "L3 Loading more Collapsed",
	args: { listEnd: { hasNextPage: true, isFetchingNextPage: true } },
	parameters: {
		docs: {
			description: {
				story:
					"The next page of conversations is loading. Check two skeleton slots follow the last item.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(1),
		)
		await expect(
			slotsIn(
				slotIn(canvasElement, "list-end-skeleton"),
				"collapsed-sidebar-skeleton",
			),
		).toHaveLength(2)
	},
})

export const S1SeveralSpacesCollapsed = meta.story({
	name: "S1 Several spaces Collapsed",
	args: { spaces: SEVERAL_SPACES },
	parameters: {
		docs: {
			description: {
				story:
					"The person belongs to three spaces. Check the rail draws no Space dots, the Space avatar stays at its head and the person stays at its foot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "space-dots")).toHaveLength(0)
		await expect(
			slotIn(canvasElement, "collapsed-sidebar").firstElementChild,
		).toHaveAttribute("data-slot", "collapsed-sidebar-space")
		await expect(
			slotIn(canvasElement, "collapsed-sidebar").lastElementChild,
		).toHaveAttribute("data-slot", "collapsed-sidebar-person")
	},
})

export const S2SharedSpaceHostNotConnectedCollapsed = meta.story({
	name: "S2 Shared space host not connected Collapsed",
	args: {
		spaces: [STUDIO],
		selectedSpaceId: STUDIO.id,
		hostBySpaceId: { [STUDIO.id]: "down" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The current space is shared and its host is not connected. Check the Space avatar wears its offline hatching with the crossed badge at its corner and its tooltip reads Studio · Not connected.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const space = rail(canvasElement).getByRole("button", {
			name: "Studio · Not connected",
		})
		await expect(slotIn(space, "space-avatar").dataset.state).toBe("offline")
		await userEvent.hover(space)
		await expect(await tooltipShown()).toHaveTextContent(
			"Studio· Not connected",
		)
	},
})

type StoryCanvas = {
	canvasElement: HTMLElement
}

const triggerAt = (state: SpaceAvatarState, host?: SpaceHost) => ({
	args: {
		hostBySpaceId: host ? { [KIROSHI.id]: host } : undefined,
		badgesBySpaceId: { [KIROSHI.id]: "attention" as const },
	},
	parameters: {
		docs: {
			description: {
				story: `The trigger of a ${state} Space. Check the rail draws the generated 26px avatar in the Space colour with the ${state} host state, and no attention ring even though the Space waits on the person.`,
			},
		},
	},
	play: async ({ canvasElement }: StoryCanvas) => {
		const avatar = slotIn(
			slotIn(canvasElement, "collapsed-sidebar-space"),
			"space-avatar",
		)
		await expect(avatar.dataset.state).toBe(state)
		await expect(avatar.dataset.size).toBe("26")
		await expect(avatar.dataset.colour).toBe(String(KIROSHI.colour))
		await expect(avatar).not.toHaveAttribute("data-attention")
		await expect(slotsIn(avatar, "space-avatar-attention")).toHaveLength(0)
	},
})

export const TriggerLocalCollapsed = meta.story({
	name: "Trigger local Collapsed",
	...triggerAt("local"),
})

export const TriggerSharedCollapsed = meta.story({
	name: "Trigger shared Collapsed",
	...triggerAt("shared", "shared"),
})

export const TriggerOnlineCollapsed = meta.story({
	name: "Trigger online Collapsed",
	...triggerAt("online", "up"),
})

export const TriggerConnectingCollapsed = meta.story({
	name: "Trigger connecting Collapsed",
	...triggerAt("connecting", "connecting"),
})

export const TriggerOfflineCollapsed = meta.story({
	name: "Trigger offline Collapsed",
	...triggerAt("offline", "down"),
})

const SpaceFollowingWindow = (args: CollapsedSidebarProps) => {
	const [selectedSpaceId, setSelectedSpaceId] = useState(args.selectedSpaceId)

	return PAPER_WINDOW({
		...args,
		selectedSpaceId,
		onSelectSpace: (id) => {
			args.onSelectSpace?.(id)
			setSelectedSpaceId(id)
		},
	})
}

export const SwipeMovesBetweenSpacesCollapsed = meta.story({
	name: "Swipe moves between spaces Collapsed",
	args: { spaces: SEVERAL_SPACES },
	render: (args) => <SpaceFollowingWindow {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The rail list sits in the native scroll snap carousel of the pre-shell sidebar: a two finger swipe over it scrolls the panels under the fingers, and a panel covering more than half of the carousel selects its Space. Check a scroll of one panel width forward selects the next Space, shows it on the Space avatar and draws the list in its panel, and one back selects the first again. Swipe with a trackpad over the list to feel it. Pick `SwipeWithSwitchingNotAllowedDoesNothingCollapsed` for the held carousel.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const nav = slotIn(canvasElement, "collapsed-sidebar")

		await scrollSpaceCarousel(nav, 1)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("perso")
		await waitFor(() =>
			expect(
				rail(canvasElement).getByRole("button", { name: "Perso" }),
			).toBeVisible(),
		)
		await expect(
			slotIn(nav, "collapsed-sidebar-list").closest("[data-slot=space-panel]"),
		).not.toHaveAttribute("inert")

		await scrollSpaceCarousel(nav, -1)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("kiroshi")
		await expect(document.documentElement.scrollLeft).toBe(0)
	},
})

export const SwipeWithOneSpaceDoesNothingCollapsed = meta.story({
	name: "Swipe with one space does nothing Collapsed",
	parameters: {
		docs: {
			description: {
				story:
					"A single Space. Check the carousel refuses a sideways scroll and no selection is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectSpaceCarouselHeld(slotIn(canvasElement, "collapsed-sidebar"))
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const SwipeWithSwitchingNotAllowedDoesNothingCollapsed = meta.story({
	name: "Swipe with switching not allowed does nothing Collapsed",
	args: { spaces: SEVERAL_SPACES, isSpaceSwitchingEnabled: false },
	parameters: {
		docs: {
			description: {
				story:
					"Three Spaces while the host forbids changing Space. Check the carousel refuses a sideways scroll and no selection is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		await expectSpaceCarouselHeld(slotIn(canvasElement, "collapsed-sidebar"))
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const R1NotSentCollapsed = meta.story({
	name: "R1 Not sent Collapsed",
	args: {
		zones: [
			pinnedZone([DESIGN, { ...ROADMAP, isNotSent: true }]),
			recentZone([RELEASE_TRAIN, HIRING]),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The last message of Q3 roadmap review was not sent. Check a 10px red dot marks the corner of its icon and its tooltip reads Q3 roadmap review · Not sent.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const item = rail(canvasElement).getByRole("button", {
			name: "Q3 roadmap review · Not sent",
		})
		await expect(slotIn(item, "collapsed-sidebar-not-sent")).toBeInTheDocument()
		await userEvent.hover(item)
		await expect(await tooltipShown()).toHaveTextContent(
			"Q3 roadmap review· Not sent",
		)
	},
})

const LIGHT = { theme: "light", theme_layout: "single" }

const currentDestinationHoverStory = (globals: typeof DARK) => ({
	globals,
	parameters: {
		docs: {
			description: {
				story:
					"The pointer rests on the current destination. Check the slot leaves its resting fill for `--rail-item-selected-hover`.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const slot = rail(canvasElement).getByRole("button", {
			name: "New conversation",
		})
		const resting = backgroundOf(slot)
		const hoverFill = tokenStyleIn(
			slot,
			"bg-rail-item-selected-hover",
			"backgroundColor",
		)
		await expect(hoverFill).not.toBe(resting)
		const pointer = await realPointer()
		await pointer.hover(slot)
		await waitFor(() => expect(backgroundOf(slot)).toBe(hoverFill), FRAME_POLL)
		await pointer.unhover(slot)
	},
})

export const CurrentDestinationHoveredCollapsed = meta.story(
	currentDestinationHoverStory(DARK),
)

export const CurrentDestinationHoveredLightCollapsed = meta.story(
	currentDestinationHoverStory(LIGHT),
)

export const SearchStaysInTheRailCollapsed = meta.story({
	play: async ({ args, canvasElement, userEvent }) => {
		const destinations = slotsIn(canvasElement, "collapsed-sidebar-destination")
		const search = rail(canvasElement).getByRole("button", { name: "Search" })
		await expect(destinations[0]).toBe(search)
		await userEvent.click(search)
		await expect(args.onOpenSearch).toHaveBeenCalledOnce()
	},
})
