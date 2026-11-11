import { type ReactNode, useRef, useState } from "react"
import { expect, fireEvent, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	expectSkeletonFilledTo,
	FRAME_POLL,
	realPointer,
	slotIn,
	slotsIn,
	swipeEnded,
	swipeOn,
	tokenStyleIn,
	wheelTrainOn,
} from "@workspace/storybook/story-utils"
import { pointerAt } from "@workspace/storybook/tab-drag-gesture"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import type { AppSidebarSection } from "@workspace/ui/components/app-sidebar-model"
import {
	PINNED_ZONE,
	SORTED,
	SORTED_ZONE,
} from "@workspace/ui/components/app-sidebar-pins"
import {
	emptySlotOf,
	headSlotOf,
	useRosterDrag,
} from "@workspace/ui/components/app-sidebar-roster-drag"
import { rosterEntriesOf } from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	type RosterRowsContext,
	recentMenuOf,
	rosterMenuOf,
} from "@workspace/ui/components/app-sidebar-roster-menu"
import {
	RosterDropArea,
	RosterLiftFrame,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
	type ExpandedSidebarSection,
} from "@workspace/ui/components/expanded-sidebar"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { Space } from "@workspace/ui/components/space"
import type { SpaceAvatarState } from "@workspace/ui/components/space-avatar"
import {
	SidebarMenu,
	SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar"
import { UpdateRow } from "@workspace/ui/components/update-badge"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { mergeRefs } from "@workspace/ui/lib/utils"

const KIROSHI: Space = {
	id: "kiroshi",
	name: "Kiroshi",
	colour: BLOT_HUES.blue,
	avatarSeed: "kiroshi",
}

const SEVERAL_SPACES: Space[] = [
	KIROSHI,
	{ id: "perso", name: "Perso", colour: BLOT_HUES.green, avatarSeed: "perso" },
	{ id: "vocca", name: "Vocca", colour: BLOT_HUES.pink, avatarSeed: "vocca" },
]

const PINNED: AppSidebarConversation[] = [
	DESK_ROOM,
	{
		id: "roadmap",
		name: "Roadmap",
		participants: [ATLAS],
		lastMessage: "Q3 themes are drafted.",
		lastSpeaker: "Atlas",
		timestamp: "Yesterday",
		pinPosition: 2,
	},
]

const RECENT: AppSidebarConversation[] = [
	{
		id: "hiring",
		name: "Hiring loop",
		participants: [BEACON],
		lastMessage: "Two candidates booked for Thursday.",
		lastSpeaker: "Beacon",
		timestamp: "09:12",
	},
	{
		id: "pricing",
		name: "Pricing page",
		participants: [ATLAS, BEACON],
		lastMessage: "The new tiers read well.",
		lastSpeaker: "Atlas",
		timestamp: "Mon",
	},
	{
		id: "support",
		name: "Support inbox",
		participants: [BEACON],
		lastMessage: "Three tickets need a reply.",
		lastSpeaker: "Beacon",
		timestamp: "Sun",
	},
]

const rowsOf = (conversations: AppSidebarConversation[], isPinned: boolean) => (
	<SidebarMenu>
		{conversations.map((conversation) => (
			<ConversationRosterRow
				conversation={conversation}
				isPinned={isPinned}
				isSelected={false}
				key={conversation.id}
				lift={STILL_LIFT}
				sections={[SIDEBAR_SECTION]}
			/>
		))}
	</SidebarMenu>
)

const sectionOf = (
	id: string,
	name: string,
	rows: ReactNode,
): ExpandedSidebarSection => ({
	id,
	name,
	rows,
	isOpen: true,
	onOpenChange: fn(),
	lift: STILL_LIFT,
	dropArea: { landing: id, isLanding: false },
})

const STUDIO: Space = {
	id: "studio",
	name: "Studio",
	colour: BLOT_HUES.blue,
	avatarSeed: "studio",
}

const STATE_ARTBOARD = {
	spaces: [STUDIO],
	selectedSpaceId: STUDIO.id,
	user: { name: "Maya" },
}

const NO_ROWS_ARTBOARD = {
	...STATE_ARTBOARD,
	missionCount: undefined,
	pinned: [],
	conversations: [],
}

const artboardRow = (name: string): AppSidebarConversation => ({
	id: name,
	name,
	participants: [ATLAS],
	lastMessage: "The first draft is ready for a read.",
	lastSpeaker: "Atlas",
	timestamp: "09:12",
})

const ONBOARDING_EMAIL = artboardRow("Onboarding email draft")
const ROADMAP_REVIEW = artboardRow("Q3 roadmap review")
const LISBON_OFFSITE = artboardRow("Lisbon offsite plan")
const PRICING_COPY = artboardRow("Fix the pricing page copy")
const RELEASE_NOTES = artboardRow("Weekly release notes")

const POPULATED_ARTBOARD = {
	...STATE_ARTBOARD,
	missionCount: 5,
	pinned: rowsOf([LISBON_OFFSITE, RELEASE_NOTES], true),
	conversations: rowsOf(
		[ONBOARDING_EMAIL, ROADMAP_REVIEW, PRICING_COPY],
		false,
	),
}

const LIST_END_BAR_WIDTHS = [
	[140, 180],
	[112, 164],
]

const DOWNLOAD = fn()

const DARK = { theme: "dark", theme_layout: "single" }

type PaperWindowProps = {
	children: ReactNode
}

const PaperWindow = ({ children }: PaperWindowProps) => (
	<WorkspaceShellRoot>
		<AppTitleBar
			canGoBack
			canGoForward
			insetWindowControls
			onGoBack={fn()}
			onGoForward={fn()}
			onToggleSidebar={fn()}
			tabs={[]}
		/>
		{children}
		<ContentCard />
	</WorkspaceShellRoot>
)

const PAPER_WINDOW = (args: ExpandedSidebarProps) => (
	<PaperWindow>
		<ExpandedSidebar {...args} />
	</PaperWindow>
)

const meta = preview.meta({
	title: "Navigation/ExpandedSidebar",
	component: ExpandedSidebar,
	globals: DARK,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The expanded sidebar of the navigation shell, top to bottom: Space switcher, the destinations menu, Pinned and Conversations, then the space dots, the update row and the person footer when they apply. A two finger horizontal swipe anywhere over it changes Space. One story per Paper page A artboard; the row list is the current conversation rows, restyled in OPE-2148.",
			},
		},
	},
	args: {
		spaces: [KIROSHI],
		selectedSpaceId: KIROSHI.id,
		destination: "newConversation" as const,
		missionCount: 3,
		pinned: rowsOf(PINNED, true),
		conversations: rowsOf(RECENT, false),
		user: { name: "Ada Martin" },
		onOpenSearch: fn(),
		onNewConversation: fn(),
		onSelectMissions: fn(),
		onSelectLibrary: fn(),
		onOpenSettings: fn(),
		onSelectSpace: fn(),
	},
	render: PAPER_WINDOW,
})

const sidebarIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "expanded-sidebar")

const sectionHeadersIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "fold-section-trigger").map(
		(trigger) => trigger.textContent,
	)

const boxOf = (element: Element) => element.getBoundingClientRect()

export const ExpandedNewConversation = meta.story({
	name: "1 Expanded New conversation",
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1: one space, no pending update, New conversation open. Check the blocks run switcher, menu, Pinned, Conversations, footer with nothing between the list and the footer, that New conversation alone wears the selected fill and reports itself as the current page, that a section header folds its rows and says so, and that the title bar and footer buttons carry a name and a focus ring. Pick `ExpandedMissions` for the other destination.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const sidebar = within(sidebarIn(canvasElement))
		const current = sidebar.getByRole("button", { name: "New conversation" })
		await expect(current).toHaveAttribute("aria-current", "page")
		await expect(
			sidebar.getByRole("button", { name: /^Missions/ }),
		).not.toHaveAttribute("aria-current")
		await expect(
			Array.from(sidebarIn(canvasElement).children, (block) =>
				block.getAttribute("data-slot"),
			),
		).toEqual([
			"expanded-sidebar-switcher-row",
			"sidebar-menu",
			"sidebar-content",
			"expanded-sidebar-footer",
		])
		await expect(
			canvasElement.querySelector('[data-slot="update-row"]'),
		).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="space-dots"]'),
		).toBeNull()

		const pinned = sidebar.getByRole("button", { name: "Pinned" })
		await expect(pinned).toHaveAttribute("aria-expanded", "true")
		await userEvent.click(pinned)
		await expect(pinned).toHaveAttribute("aria-expanded", "false")
		await userEvent.click(pinned)
		await expect(pinned).toHaveAttribute("aria-expanded", "true")

		const canvas = within(canvasElement)
		for (const name of ["Toggle sidebar", "Back", "Forward"])
			await expect(canvas.getByRole("button", { name })).toBeVisible()

		const settings = canvas.getByRole("button", {
			name: "Ada Martin, Settings",
		})
		await userEvent.click(settings)
		await expect(args.onOpenSettings).toHaveBeenCalledOnce()
		await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
		await userEvent.tab()
		await expect(settings).toHaveFocus()
		await expect(getComputedStyle(settings).outlineStyle).toBe("solid")
	},
})

export const ExpandedMissions = meta.story({
	name: "2 Expanded Missions",
	args: { destination: "missions" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2, sidebar side: the Missions page is open. Check that Missions wears the selected fill with its count still muted on the right, and that New conversation went back to rest.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = within(sidebarIn(canvasElement))
		await expect(
			sidebar.getByRole("button", { name: /^Missions/ }),
		).toHaveAttribute("aria-current", "page")
		await expect(
			sidebar.getByRole("button", { name: "New conversation" }),
		).not.toHaveAttribute("aria-current")
	},
})

export const U1Expanded = meta.story({
	name: "U1 Expanded",
	args: { update: <UpdateRow onDownload={DOWNLOAD} status="available" /> },
	parameters: {
		docs: {
			description: {
				story:
					"An update is available. Check the row sits between the list and the footer with the arrow-up disc and Download update in the foreground, and that pressing it starts the download.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const row = within(canvasElement).getByRole("button", {
			name: "Download update",
		})
		await expect(row.nextElementSibling).toHaveAttribute(
			"data-slot",
			"expanded-sidebar-footer",
		)
		await userEvent.click(row)
		await expect(DOWNLOAD).toHaveBeenCalled()
	},
})

export const U2Expanded = meta.story({
	name: "U2 Expanded",
	args: { update: <UpdateRow progress={40} status="downloading" /> },
	parameters: {
		docs: {
			description: {
				story:
					"The update is downloading. Check the disc gives way to a progress ring at 40 percent and the label reads muted, with nothing to press.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("progressbar", {
				name: "Downloading update",
			}),
		).toHaveAttribute("aria-valuenow", "40")
	},
})

export const U3Expanded = meta.story({
	name: "U3 Expanded",
	args: {
		update: <UpdateRow onRestart={fn()} status="ready" version="0.15.0" />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The update is downloaded and nothing is running. Check the counterclockwise disc and Restart to update to 0.15.0 in the foreground. Pick `U4Expanded` when agents still run.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("button", {
				name: "Restart to update to 0.15.0",
			}),
		).toBeVisible()
	},
})

export const U4Expanded = meta.story({
	name: "U4 Expanded",
	args: {
		update: <UpdateRow activeBotCount={2} status="ready" version="0.15.0" />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The update is ready but two agents still run. Check the row grows to fit its second line, the disc and label are dimmed, the reason reads under the label, and that nothing offers to restart.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "update-row")
		await expect(row.tagName).toBe("DIV")
		await expect(
			within(row).getByText(
				"2 agents are still running. Stop them to restart.",
			),
		).toBeVisible()
	},
})

export const U5Expanded = meta.story({
	name: "U5 Expanded",
	args: { update: <UpdateRow onDownload={fn()} status="error" /> },
	parameters: {
		docs: {
			description: {
				story:
					"The update failed. Check the red tinted row, the clockwise disc and Update failed, download again in the failure colour, and that pressing it downloads again.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("button", {
				name: "Update failed, download again",
			}),
		).toBeVisible()
	},
})

export const S1SeveralSpacesExpanded = meta.story({
	name: "S1 Several spaces Expanded",
	args: { spaces: SEVERAL_SPACES },
	parameters: {
		docs: {
			description: {
				story:
					"The person belongs to three spaces. Check the dots row sits between the list and the footer, the current space is the pill in its colour and the others are small neutral dots.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const dots = slotIn(canvasElement, "space-dots")
		await expect(dots.nextElementSibling).toHaveAttribute(
			"data-slot",
			"expanded-sidebar-footer",
		)
		await expect(
			within(dots).getByRole("button", { name: "Open Kiroshi" }),
		).toHaveAttribute("aria-current", "true")
	},
})

export const S2SharedSpaceHostNotConnectedExpanded = meta.story({
	name: "S2 Shared space host not connected Expanded",
	args: { hostBySpaceId: { [KIROSHI.id]: "down" } },
	parameters: {
		docs: {
			description: {
				story:
					"The current space is shared and its host is not connected. Check the switcher avatar wears its offline hatching with the crossed badge at its corner and Not connected follows the name before the chevron.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const switcher = slotIn(canvasElement, "space-switcher")
		await expect(within(switcher).getByText("Not connected")).toBeVisible()
		await expect(slotIn(switcher, "space-avatar").dataset.state).toBe("offline")
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
				story: `The switcher of a ${state} Space. Check the row stays 36px tall with an 8px gap, and draws the generated 26px avatar in the Space colour with the ${state} host state, then the name and the chevron, with no attention ring even though the Space waits on the person.`,
			},
		},
	},
	play: async ({ canvasElement }: StoryCanvas) => {
		const switcher = slotIn(canvasElement, "space-switcher")
		const avatar = slotIn(switcher, "space-avatar")
		await expect(switcher.getBoundingClientRect().height).toBe(36)
		await expect(getComputedStyle(switcher).columnGap).toBe("8px")
		await expect(avatar.dataset.state).toBe(state)
		await expect(avatar.dataset.size).toBe("26")
		await expect(avatar.dataset.colour).toBe(String(KIROSHI.colour))
		await expect(avatar).not.toHaveAttribute("data-attention")
		await expect(slotsIn(avatar, "space-avatar-attention")).toHaveLength(0)
		await expect(avatar.nextElementSibling).toHaveAttribute(
			"data-slot",
			"space-switcher-name",
		)
	},
})

export const TriggerLocalExpanded = meta.story({
	name: "Trigger local Expanded",
	...triggerAt("local"),
})

export const TriggerSharedExpanded = meta.story({
	name: "Trigger shared Expanded",
	...triggerAt("shared", "shared"),
})

export const TriggerOnlineExpanded = meta.story({
	name: "Trigger online Expanded",
	...triggerAt("online", "up"),
})

export const TriggerConnectingExpanded = meta.story({
	name: "Trigger connecting Expanded",
	...triggerAt("connecting", "connecting"),
})

export const TriggerOfflineExpanded = meta.story({
	name: "Trigger offline Expanded",
	...triggerAt("offline", "down"),
})

const SpaceFollowingWindow = (args: ExpandedSidebarProps) => {
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

export const SwipeMovesBetweenSpacesExpanded = meta.story({
	name: "Swipe moves between spaces Expanded",
	args: { spaces: SEVERAL_SPACES },
	render: (args) => <SpaceFollowingWindow {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A two finger swipe over the sidebar as a macOS trackpad sends it: a burst of small horizontal deltas, then a decaying momentum tail. Check each swipe moves the Space by exactly one, forward then back. Outside reduced motion the list follows the fingers and settles; the test browser runs under reduced motion, where the Space changes and nothing moves. Pick `SwipeWithOneSpaceDoesNothingExpanded` for a lone Space.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const target = within(sidebarIn(canvasElement)).getByRole("button", {
			name: "Library",
		})

		await expect(swipeOn(target, 1)).not.toContain(false)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("perso")
		await waitFor(() =>
			expect(
				within(sidebarIn(canvasElement)).getByRole("button", {
					name: "Change space, Perso open",
				}),
			).toBeVisible(),
		)

		await swipeEnded()
		await expect(swipeOn(target, -1)).not.toContain(false)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("kiroshi")
		await expect(sidebarIn(canvasElement).scrollLeft).toBe(0)
		await expect(document.documentElement.scrollLeft).toBe(0)
		await expect(sidebarIn(canvasElement)).not.toHaveAttribute(
			"data-space-swipe",
		)
	},
})

export const SwipeWithOneSpaceDoesNothingExpanded = meta.story({
	name: "Swipe with one space does nothing Expanded",
	parameters: {
		docs: {
			description: {
				story:
					"A swipe with a single Space. Check the Space stays and no selection is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		swipeOn(sidebarIn(canvasElement), 1)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const SwipeWithSwitchingNotAllowedDoesNothingExpanded = meta.story({
	name: "Swipe with switching not allowed does nothing Expanded",
	args: { spaces: SEVERAL_SPACES, isSpaceSwitchingEnabled: false },
	parameters: {
		docs: {
			description: {
				story:
					"A swipe while the host forbids changing Space, with three Spaces. Check the Space stays and no selection is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		swipeOn(sidebarIn(canvasElement), 1)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const SwipePastTheEdgesKeepsSpaceExpanded = meta.story({
	name: "Swipe past the edges keeps the space Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	render: (args) => <SpaceFollowingWindow {...args} />,
	play: async ({ args, canvasElement }) => {
		const nav = sidebarIn(canvasElement)

		swipeOn(nav, -1)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()

		for (const expected of ["perso", "vocca"]) {
			await swipeEnded()
			swipeOn(nav, 1)
			await expect(args.onSelectSpace).toHaveBeenLastCalledWith(expected)
		}

		await swipeEnded()
		swipeOn(nav, 1)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
	},
})

export const VerticalGestureKeepsSpaceExpanded = meta.story({
	name: "Vertical gesture keeps the space Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	play: async ({ args, canvasElement }) => {
		const cancelled = wheelTrainOn(
			sidebarIn(canvasElement),
			Array.from({ length: 15 }, () => [16, 40] as const),
		)
		await expect(cancelled).not.toContain(true)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const SmallDriftKeepsSpaceExpanded = meta.story({
	name: "Small drift keeps the space Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	play: async ({ args, canvasElement }) => {
		wheelTrainOn(
			sidebarIn(canvasElement),
			Array.from({ length: 5 }, () => [8, 0] as const),
		)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

const DOT_POINTER = { button: 0, pointerId: 1 }

export const SwipeWhileDotIsDraggedKeepsSpaceExpanded = meta.story({
	name: "Swipe while a dot is dragged keeps the space Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	play: async ({ args, canvasElement }) => {
		const [dot] = slotsIn(canvasElement, "space-dot-button")
		if (!dot) throw new Error("No Space dot to drag")
		const { left, top } = dot.getBoundingClientRect()
		const at = { clientX: Math.round(left), clientY: Math.round(top) }

		fireEvent.pointerDown(dot, { ...DOT_POINTER, ...at })
		fireEvent.pointerMove(dot, {
			...DOT_POINTER,
			clientX: at.clientX + 12,
			clientY: at.clientY,
		})
		swipeOn(sidebarIn(canvasElement), 1)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
		fireEvent.pointerUp(dot, { ...DOT_POINTER, ...at })
	},
})

export const SwipeInsideOpenMenuKeepsSpaceExpanded = meta.story({
	name: "Swipe inside an open menu keeps the space Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	parameters: { a11y: A11Y_FLOATING_FOCUS_GUARDS },
	play: async ({ args, canvasElement }) => {
		fireEvent.click(slotIn(canvasElement, "space-switcher"))
		const menu = await within(document.body).findByRole("menu")
		swipeOn(menu, 1)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const SwipeOverTextFieldKeepsSpaceExpanded = meta.story({
	name: "Swipe over a text field keeps the space Expanded",
	tags: ["test-only"],
	args: {
		spaces: SEVERAL_SPACES,
		pinned: (
			<SidebarMenu>
				<SidebarMenuItem>
					<input aria-label="Rename" defaultValue="Design review" />
				</SidebarMenuItem>
			</SidebarMenu>
		),
	},
	play: async ({ args, canvasElement }) => {
		const field = within(canvasElement).getByRole("textbox", { name: "Rename" })
		await expect(swipeOn(field, 1)).not.toContain(true)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

export const E1NoAgentsYetExpanded = meta.story({
	name: "E1 No agents yet Expanded",
	args: NO_ROWS_ARTBOARD,
	parameters: {
		docs: {
			description: {
				story:
					"The Space holds nothing yet. Check one faint start aligned line replaces both sections, with no header above it and no mission count. Pick `E2NothingPinnedExpanded` when conversations exist.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const copy = within(canvasElement).getByText("No agents yet")
		await expect(copy).toBeVisible()
		await expect(getComputedStyle(copy).textAlign).toBe("start")
		await expect(getComputedStyle(copy).padding).toBe("12px")
		await expect(sectionHeadersIn(canvasElement)).toEqual([])
	},
})

export const E2NothingPinnedExpanded = meta.story({
	name: "E2 Nothing pinned Expanded",
	args: {
		...STATE_ARTBOARD,
		missionCount: 5,
		pinned: [],
		conversations: rowsOf(
			[
				ONBOARDING_EMAIL,
				ROADMAP_REVIEW,
				LISBON_OFFSITE,
				PRICING_COPY,
				RELEASE_NOTES,
			],
			false,
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Nothing is pinned. Check Conversations opens the list right under the destinations menu with no Pinned header.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual(["Conversations"])
		await expect(
			within(canvasElement).getByText("Weekly release notes"),
		).toBeVisible()
	},
})

export const E3EmptySectionExpanded = meta.story({
	name: "E3 Empty section Expanded",
	args: {
		...POPULATED_ARTBOARD,
		sections: [sectionOf("clients", "Clients", [])],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The Clients section is empty. Check its header stays between Pinned and Conversations and a dashed zone sits 2px under it, its copy start aligned where the roster centres it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual([
			"Pinned",
			"Clients",
			"Conversations",
		])
		const zone = slotIn(canvasElement, "roster-section-drop")
		await expect(zone).toHaveTextContent("Drop an agent here")
		await expect(getComputedStyle(zone).borderTopStyle).toBe("dashed")
		await expect(getComputedStyle(zone).borderTopLeftRadius).toBe("10px")
		await expect(getComputedStyle(zone).textAlign).toBe("start")
		const clients = slotsIn(canvasElement, "fold-section-trigger")[1]
		await expect(boxOf(zone).top - boxOf(clients).bottom).toBe(2)
	},
})

export const L1LoadingExpanded = meta.story({
	name: "L1 Loading Expanded",
	args: { ...NO_ROWS_ARTBOARD, listStatus: "loading" },
	parameters: {
		docs: {
			description: {
				story:
					"The list is loading. Check the skeleton replaces every section, runs flat with its second header bar after two rows, and reaches the bottom of the list area.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual([])
		await expect(
			slotsIn(canvasElement, "sidebar-list-skeleton-header"),
		).toHaveLength(2)
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(
			boxOf(slotIn(canvasElement, "sidebar-list-skeleton")).bottom,
		).toBe(boxOf(slotIn(canvasElement, "sidebar-content")).bottom)
	},
})

export const L2FailedExpanded = meta.story({
	name: "L2 Failed Expanded",
	args: {
		...NO_ROWS_ARTBOARD,
		listStatus: "failed",
		onRetryList: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The list could not load. Check the failure copy and Retry replace every section, both start aligned, and that pressing Retry asks for the list again.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText("Couldn’t load your agents.")).toBeVisible()
		await expect(sectionHeadersIn(canvasElement)).toEqual([])
		const retry = canvas.getByRole("button", { name: "Retry" })
		await expect(getComputedStyle(retry).borderTopLeftRadius).toBe("6px")
		await expect(boxOf(retry).left).toBe(
			boxOf(canvas.getByText("Couldn’t load your agents.")).left,
		)
		await userEvent.click(retry)
		await expect(args.onRetryList).toHaveBeenCalledOnce()
	},
})

export const L3LoadingMoreExpanded = meta.story({
	name: "L3 Loading more Expanded",
	args: {
		...POPULATED_ARTBOARD,
		listEnd: { hasNextPage: true, isFetchingNextPage: true },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The next page is loading. Check two skeleton rows follow the last conversation row 2px under it, inside the Conversations body.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await waitFor(() =>
			expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(1),
		)
		await expect(sectionHeadersIn(canvasElement)).toEqual([
			"Pinned",
			"Conversations",
		])
		const body = slotsIn(canvasElement, "fold-section")[1]
		const lastRow = Array.from(slotIn(body, "sidebar-menu").children).at(
			-1,
		) as Element
		const rows = slotsIn(
			slotIn(body, "list-end-skeleton"),
			"sidebar-list-skeleton-row",
		)
		await expect(rows).toHaveLength(2)
		await expect(boxOf(rows[0]).top - boxOf(lastRow).bottom).toBe(2)
		await expect(boxOf(rows[1]).top - boxOf(rows[0]).bottom).toBe(2)
		await expect(
			rows.map((row) => {
				const [title, preview] = Array.from(
					(row.lastElementChild as Element).children,
				)
				return [boxOf(title).width, boxOf(preview).width]
			}),
		).toEqual(LIST_END_BAR_WIDTHS)
	},
})

const RENAME_SECTION = fn()
const MOVE_SECTION = fn()
const DELETE_SECTION = fn()
const REPORT_FOLD = fn()
const PRESS_HEADER = fn()

const PRESSABLE_LIFT: Lifter = {
	handlersFor: (id) => ({ onPointerDown: () => PRESS_HEADER(id) }),
	hasJustDropped: () => false,
}

const namedSectionOf = (
	id: string,
	name: string,
	rows: ReactNode,
	isOpen: boolean,
): ExpandedSidebarSection => ({
	...sectionOf(id, name, rows),
	isOpen,
	lift: PRESSABLE_LIFT,
	onDelete: DELETE_SECTION,
	onMove: MOVE_SECTION,
	onOpenChange: REPORT_FOLD,
	onRename: RENAME_SECTION,
})

const headerNamed = (canvasElement: HTMLElement, name: string) =>
	within(sidebarIn(canvasElement)).getByRole("button", { name })

const page = () => within(document.body)

const openSectionMenu = async (header: HTMLElement) => {
	fireEvent.contextMenu(header)
	return page().findByRole("menu")
}

const chooseFromMenu = async (header: HTMLElement, item: string) => {
	const menu = await openSectionMenu(header)
	fireEvent.click(within(menu).getByRole("menuitem", { name: item }))
	await waitFor(() => expect(page().queryByRole("menu")).toBeNull())
}

const closeMenu = async () => {
	fireEvent.keyDown(page().getByRole("menu"), { key: "Escape" })
	await waitFor(() => expect(page().queryByRole("menu")).toBeNull())
}

const renameFieldIn = (canvasElement: HTMLElement) =>
	within(canvasElement).findByRole("textbox", { name: "Rename Clients" })

export const N1NamedSectionExpanded = meta.story({
	name: "N1 Named section Expanded",
	args: {
		...POPULATED_ARTBOARD,
		sections: [
			namedSectionOf(
				"clients",
				"Clients",
				rowsOf([ROADMAP_REVIEW], false),
				true,
			),
			namedSectionOf("press", "Press", rowsOf([PRICING_COPY], false), false),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A named section with rows between Pinned and Conversations. Check Clients wears the same header as Pinned, that pressing a header only reports the next open state and the header follows what comes back, that the context menu offers Rename, Move up, Move down and Delete with the ends disabled, and that Escape or an empty name restores the header.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual([
			"Pinned",
			"Clients",
			"Press",
			"Conversations",
		])

		const clients = headerNamed(canvasElement, "Clients")
		const pinned = headerNamed(canvasElement, "Pinned")
		const style = getComputedStyle(clients)
		await expect(style.padding).toBe("6px")
		await expect(style.borderTopLeftRadius).toBe("8px")
		await expect(style.columnGap).toBe("4px")
		await expect(style.justifyContent).toBe("space-between")
		await expect(style.fontSize).toBe("12px")
		await expect(style.lineHeight).toBe("16px")
		await expect(style.fontWeight).toBe("500")
		await expect(style.color).toBe(getComputedStyle(pinned).color)
		await expect(boxOf(clients).height).toBe(boxOf(pinned).height)
		await expect(boxOf(clients.querySelector("svg") as Element).width).toBe(14)
		await expect(getComputedStyle(pinned).columnGap).toBe("4px")

		const bodyId = clients.getAttribute("aria-controls") as string
		await expect(
			within(document.getElementById(bodyId) as HTMLElement).getByText(
				ROADMAP_REVIEW.name,
			),
		).toBeVisible()

		const press = headerNamed(canvasElement, "Press")
		await expect(press).toHaveAttribute("aria-expanded", "false")
		await userEvent.click(press)
		await expect(REPORT_FOLD).toHaveBeenLastCalledWith(true)
		await expect(press).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(clients)
		await expect(REPORT_FOLD).toHaveBeenLastCalledWith(false)
		await expect(clients).toHaveAttribute("aria-expanded", "true")

		await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
		await userEvent.tab()
		await expect(clients).toHaveFocus()
		await expect(getComputedStyle(clients).outlineStyle).toBe("solid")

		fireEvent.pointerDown(clients, pointerAt(10, 10))
		await expect(PRESS_HEADER).toHaveBeenCalledWith("clients")

		const firstMenu = within(await openSectionMenu(clients))
		for (const name of ["Rename", "Move up", "Move down", "Delete"])
			await expect(firstMenu.getByRole("menuitem", { name })).toBeVisible()
		await expect(
			firstMenu.getByRole("menuitem", { name: "Move up" }),
		).toHaveAttribute("aria-disabled", "true")
		await expect(
			firstMenu.getByRole("menuitem", { name: "Move down" }),
		).not.toHaveAttribute("aria-disabled", "true")
		await closeMenu()

		const lastMenu = within(await openSectionMenu(press))
		await expect(
			lastMenu.getByRole("menuitem", { name: "Move down" }),
		).toHaveAttribute("aria-disabled", "true")
		await closeMenu()

		await chooseFromMenu(clients, "Rename")
		const field = await renameFieldIn(canvasElement)
		await userEvent.clear(field)
		await userEvent.type(field, "  Partners  {Enter}")
		await expect(RENAME_SECTION).toHaveBeenCalledOnce()
		await expect(RENAME_SECTION).toHaveBeenCalledWith("clients", "Partners")

		await chooseFromMenu(headerNamed(canvasElement, "Clients"), "Rename")
		await userEvent.type(await renameFieldIn(canvasElement), "Other{Escape}")
		await expect(RENAME_SECTION).toHaveBeenCalledOnce()
		await expect(headerNamed(canvasElement, "Clients")).toBeVisible()

		await chooseFromMenu(headerNamed(canvasElement, "Clients"), "Rename")
		const emptied = await renameFieldIn(canvasElement)
		await userEvent.clear(emptied)
		await userEvent.keyboard("{Enter}")
		await expect(RENAME_SECTION).toHaveBeenCalledOnce()
		await expect(headerNamed(canvasElement, "Clients")).toBeVisible()

		await chooseFromMenu(headerNamed(canvasElement, "Clients"), "Delete")
		await expect(DELETE_SECTION).toHaveBeenCalledOnce()
		await expect(DELETE_SECTION).toHaveBeenCalledWith("clients")
	},
})

const appSlotOf = (landing: string, menu: ReactNode) => (
	<RosterDropArea isLanding={false} landing={landing}>
		{menu}
	</RosterDropArea>
)

export const A1SlotsComposedAsTheAppExpanded = meta.story({
	name: "A1 Slots composed as the app Expanded",
	args: {
		...POPULATED_ARTBOARD,
		pinned: appSlotOf(PINNED_ZONE, rowsOf([LISBON_OFFSITE], true)),
		conversations: appSlotOf(SORTED_ZONE, rowsOf([ONBOARDING_EMAIL], false)),
		sections: [
			sectionOf("clients", "Clients", rowsOf([ROADMAP_REVIEW], false)),
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The slots as the app feeds them, a drop area around a menu around rows. Check the list reads the same as the plain slots, and that the menu the app passes is the only list around its rows.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const content = slotIn(canvasElement, "sidebar-content")
		const lists = Array.from(content.querySelectorAll("ul"))
		await expect(lists).toHaveLength(3)
		for (const list of lists)
			await expect(list.parentElement?.closest("ul")).toBeNull()
		for (const item of content.querySelectorAll("li"))
			await expect(item.parentElement?.tagName).toBe("UL")
	},
})

const CARRIED_SECTIONS: AppSidebarSection[] = [
	{ id: "clients", name: "Clients", position: 2 },
	{ id: "press", name: "Press", position: 4 },
]

const CLIENT_KICKOFF = artboardRow("Client kickoff")
const PRESS_KIT = artboardRow("Press kit")

const CARRIED_CONVERSATIONS: AppSidebarConversation[] = [
	{ ...LISBON_OFFSITE, pinPosition: 0 },
	{ ...RELEASE_NOTES, pinPosition: 1 },
	{ ...CLIENT_KICKOFF, sectionId: "clients", pinPosition: 3 },
	{ ...PRESS_KIT, sectionId: "press", pinPosition: 5 },
	ONBOARDING_EMAIL,
	ROADMAP_REVIEW,
]

const LAND_ROW = fn()
const REORDER_SECTION = fn()

type CarriedSidebarProps = ExpandedSidebarProps & {
	collapsedSectionIds: string[]
}

const CarriedSidebar = ({
	collapsedSectionIds,
	...args
}: CarriedSidebarProps) => {
	const frameRef = useRef<HTMLDivElement>(null)
	const entries = rosterEntriesOf({
		bots: [],
		conversations: CARRIED_CONVERSATIONS,
		naming: null,
		sections: CARRIED_SECTIONS,
	})
	const drag = useRosterDrag({
		collapsedSectionIds,
		containerRef: frameRef,
		entries,
		onLand: LAND_ROW,
		onMoveSection: REORDER_SECTION,
	})
	const rows: RosterRowsContext = {
		keepFocus: drag.keepFocus,
		lift: drag.rosterLift,
		liftedId: drag.liftedId,
		membershipsOf: () => [],
		onMoveKey: drag.moveRowByKey,
		sections: CARRIED_SECTIONS,
		shiftOf: drag.rowShiftOf,
		spaces: [STUDIO],
	}

	return (
		<PaperWindow>
			<RosterLiftFrame
				isLifting={drag.isLifting}
				ref={mergeRefs(frameRef, drag.rosterLift.followRef)}
			>
				<ExpandedSidebar
					{...args}
					conversations={
						<RosterDropArea
							isLanding={drag.isLandingSorted}
							landing={SORTED_ZONE}
						>
							{recentMenuOf(entries.sortedConversations, [], rows)}
						</RosterDropArea>
					}
					pinned={appSlotOf(
						PINNED_ZONE,
						rosterMenuOf(
							entries.topLevel.filter(({ section }) => !section),
							true,
							rows,
						),
					)}
					sections={CARRIED_SECTIONS.map(({ id, name }) => ({
						id,
						name,
						rows: rosterMenuOf(entries.rowsOf(id), true, rows),
						isOpen: !collapsedSectionIds.includes(id),
						onOpenChange: fn(),
						lift: drag.rosterLift,
						headSlotId: headSlotOf(id),
						emptySlotId: emptySlotOf(id),
						dropArea: {
							landing: id,
							slotId: id,
							isLanding: drag.landingSection === id,
							isGiving: drag.isGiving(id),
							isReceiving: drag.isReceiving(id),
							isSliding: drag.isLifting,
							shift: drag.cardShiftOf(id),
							ref: (node) => drag.keepFocus(id, node),
						},
					}))}
				/>
			</RosterLiftFrame>
		</PaperWindow>
	)
}

const CARRIED_ARGS = {
	...STATE_ARTBOARD,
	missionCount: 5,
	pinned: null,
	conversations: null,
}

const renderCarried =
	(collapsedSectionIds: string[]) => (args: ExpandedSidebarProps) => (
		<CarriedSidebar {...args} collapsedSectionIds={collapsedSectionIds} />
	)

const rowHandleNamed = (canvasElement: HTMLElement, name: string) =>
	within(sidebarIn(canvasElement))
		.getByText(name)
		.closest<HTMLElement>('[data-slot="sidebar-menu-button"]') as HTMLElement

const middleYOf = (element: Element) =>
	boxOf(element).top + boxOf(element).height / 2

const liftByPress = (handle: HTMLElement) => {
	const x = boxOf(handle).left + boxOf(handle).width / 2
	const y = middleYOf(handle)
	fireEvent.pointerDown(handle, pointerAt(x, y))
	fireEvent.pointerMove(handle, pointerAt(x, y + 8))
	return x
}

const clippingAncestorsOf = (node: Element) => {
	const clipping: Element[] = []
	for (
		let parent = node.parentElement;
		parent && parent.getAttribute("data-slot") !== "expanded-sidebar";
		parent = parent.parentElement
	)
		if (getComputedStyle(parent).overflowY !== "visible") clipping.push(parent)
	return clipping
}

const expectInsideEveryClip = async (node: Element) => {
	const box = boxOf(node)
	for (const clip of clippingAncestorsOf(node)) {
		await expect(box.top).toBeGreaterThanOrEqual(boxOf(clip).top)
		await expect(box.bottom).toBeLessThanOrEqual(boxOf(clip).bottom)
	}
}

const foldBodyOf = (header: HTMLElement) =>
	document.getElementById(header.getAttribute("aria-controls") as string)
		?.firstElementChild as HTMLElement

export const D1RowCarriedToConversationsExpanded = meta.story({
	name: "D1 Row carried to Conversations Expanded",
	args: CARRIED_ARGS,
	render: renderCarried([]),
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row carried over a named section, then over Conversations, through the real drag. Check the row keeps its lifted surface above the other sections at every step, is never cut by a fold body, and that releasing it over Conversations lands it there.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const handle = rowHandleNamed(canvasElement, LISBON_OFFSITE.name)
		const item = handle.closest("li") as HTMLElement
		const pinnedBody = foldBodyOf(headerNamed(canvasElement, "Pinned"))
		const pinnedBottom = boxOf(pinnedBody).bottom
		const overClient = middleYOf(
			rowHandleNamed(canvasElement, CLIENT_KICKOFF.name),
		)
		const overConversations = middleYOf(
			rowHandleNamed(canvasElement, ROADMAP_REVIEW.name),
		)
		const x = liftByPress(handle)

		fireEvent.pointerMove(handle, pointerAt(x, overClient))
		await waitFor(() => expect(boxOf(item).top).toBeGreaterThan(pinnedBottom))
		await expect(item).toHaveAttribute("data-lifted", "true")
		await expect(getComputedStyle(pinnedBody).overflowY).toBe("visible")
		await expectInsideEveryClip(item)

		fireEvent.pointerMove(handle, pointerAt(x, overConversations))
		await waitFor(() =>
			expect(
				slotIn(canvasElement, "roster-lift-frame").querySelector(
					`[data-roster-drop="${SORTED_ZONE}"]`,
				),
			).toHaveAttribute("data-landing", "true"),
		)
		await expect(item).toHaveAttribute("data-lifted", "true")
		await expectInsideEveryClip(item)

		fireEvent.pointerUp(handle, pointerAt(x, overConversations))
		await expect(LAND_ROW).toHaveBeenCalledOnce()
		await expect(LAND_ROW).toHaveBeenCalledWith(LISBON_OFFSITE.id, SORTED)
	},
})

export const D2ClosedSectionHiddenDuringLiftExpanded = meta.story({
	name: "D2 Closed section hidden during lift Expanded",
	args: CARRIED_ARGS,
	render: renderCarried(["press"]),
	parameters: {
		docs: {
			description: {
				story:
					"A row is lifted while Press is closed. Check Press keeps its rows out of sight during the whole lift while the open sections let the row travel over them.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const handle = rowHandleNamed(canvasElement, LISBON_OFFSITE.name)
		const x = liftByPress(handle)
		await waitFor(() =>
			expect(slotIn(canvasElement, "roster-lift-frame")).toHaveAttribute(
				"data-lifting",
				"true",
			),
		)
		const press = foldBodyOf(headerNamed(canvasElement, "Press"))
		await expect(getComputedStyle(press).overflowY).toBe("hidden")
		await expect(boxOf(press).height).toBe(0)
		await expect(within(press).getByText(PRESS_KIT.name)).not.toBeVisible()
		await expect(
			getComputedStyle(foldBodyOf(headerNamed(canvasElement, "Clients")))
				.overflowY,
		).toBe("visible")
		fireEvent.pointerUp(handle, pointerAt(x, 0))
	},
})

const LIGHT = { theme: "light", theme_layout: "single" }

const activeRowHoverStory = (globals: typeof DARK) => ({
	globals,
	parameters: {
		docs: {
			description: {
				story:
					"The pointer rests on the current destination. Check the row leaves its resting fill for `--rail-item-selected-hover`.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = within(canvasElement).getByRole("button", {
			name: "New conversation",
		})
		const resting = getComputedStyle(row).backgroundColor
		const hoverFill = tokenStyleIn(
			row,
			"bg-rail-item-selected-hover",
			"backgroundColor",
		)
		await expect(hoverFill).not.toBe(resting)
		const pointer = await realPointer()
		await pointer.hover(row)
		await waitFor(
			() => expect(getComputedStyle(row).backgroundColor).toBe(hoverFill),
			FRAME_POLL,
		)
		await pointer.unhover(row)
	},
})

export const ActiveRowHoveredExpanded = meta.story(activeRowHoverStory(DARK))

export const ActiveRowHoveredLightExpanded = meta.story(
	activeRowHoverStory(LIGHT),
)

export const NewConversationDrawsThePlusExpanded = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the New conversation row draws the same Add glyph as the New tab button of the title bar.",
			},
		},
	},
	play: async ({ canvas }) => {
		const drawingOf = (name: string) =>
			canvas.getByRole("button", { name }).querySelector("svg")?.innerHTML
		await expect(drawingOf("New conversation")).toBe(drawingOf("New tab"))
	},
})

export const FooterIsOneSettingsButtonExpanded = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the whole footer row is one button named after the person and Settings, with no button nested in it, the gear on screen and hidden from assistive technology, and that hover and keyboard focus paint the whole row.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const footer = slotIn(canvasElement, "expanded-sidebar-footer")
		const gear = footer.lastElementChild
		await expect(footer.tagName).toBe("BUTTON")
		await expect(footer.querySelectorAll("button")).toHaveLength(0)
		await expect(footer).toHaveAccessibleName("Ada Martin, Settings")
		await expect(gear).toBeVisible()
		await expect(gear).toHaveAttribute("aria-hidden", "true")

		const resting = getComputedStyle(footer).backgroundColor
		const pointer = await realPointer()
		await pointer.hover(footer)
		await waitFor(
			() => expect(getComputedStyle(footer).backgroundColor).not.toBe(resting),
			FRAME_POLL,
		)
		await pointer.unhover(footer)

		await userEvent.click(footer)
		await expect(args.onOpenSettings).toHaveBeenCalledOnce()
		await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
		await userEvent.tab()
		await expect(footer).toHaveFocus()
		await expect(getComputedStyle(footer).outlineStyle).toBe("solid")
	},
})

export const SwitcherAndFooterInsetsExpanded = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the switcher keeps one inset on the left, the top and the right of its content, the footer avatar sits as far from the left edge as from the top and the gear as far from the right edge as from the top, and that both avatars sit on the vertical line of the navigation icons, 26px from the sidebar edge.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const sidebar = boxOf(sidebarIn(canvasElement))
		const switcher = slotIn(canvasElement, "space-switcher")
		const row = slotIn(canvasElement, "expanded-sidebar-switcher-row")
		const footer = slotIn(canvasElement, "expanded-sidebar-footer")
		const switcherAvatar = boxOf(slotIn(switcher, "space-avatar"))
		const footerAvatar = boxOf(slotIn(footer, "expanded-sidebar-avatar"))
		const search = slotIn(canvasElement, "expanded-sidebar-search")
		const searchGlyph = search.querySelector("svg") as Element
		const gear = footer.lastElementChild as Element

		const rightInsetOf = (edge: Element, content: Element) =>
			boxOf(edge).right - boxOf(content).right

		await expect(switcherAvatar.left - boxOf(switcher).left).toBe(5)
		await expect(switcherAvatar.top - boxOf(switcher).top).toBe(5)
		await expect(rightInsetOf(row, searchGlyph)).toBe(5)
		await expect(footerAvatar.left - boxOf(footer).left).toBe(
			footerAvatar.top - boxOf(footer).top,
		)
		await expect(rightInsetOf(footer, gear)).toBe(
			boxOf(gear).top - boxOf(footer).top,
		)

		const centreOf = (box: DOMRect) => box.left + box.width / 2 - sidebar.left
		const navigationIcon = canvas
			.getByRole("button", { name: "Library" })
			.querySelector("svg") as Element
		await expect(centreOf(boxOf(navigationIcon))).toBe(26)
		await expect(centreOf(switcherAvatar)).toBe(26)
		await expect(centreOf(footerAvatar)).toBe(26)
	},
})

export const SearchBesideTheSwitcherExpanded = meta.story({
	play: async ({ args, canvasElement, userEvent }) => {
		const row = slotIn(canvasElement, "expanded-sidebar-switcher-row")
		const search = within(row).getByRole("button", { name: "Search" })
		await expect(boxOf(search).left).toBeGreaterThan(
			boxOf(slotIn(row, "space-switcher")).right,
		)
		await expect(
			within(slotIn(canvasElement, "sidebar-menu")).queryByRole("button", {
				name: "Search",
			}),
		).toBeNull()
		await userEvent.click(search)
		await expect(args.onOpenSearch).toHaveBeenCalledOnce()
		await userEvent.hover(search)
		await waitFor(
			() =>
				expect(document.querySelector('[role="tooltip"]')).toHaveTextContent(
					"Search",
				),
			FRAME_POLL,
		)
	},
})

export const LongSpaceNameTruncatesExpanded = meta.story({
	args: {
		spaces: [
			{
				...KIROSHI,
				name: "The long name of a Space shared across the whole organisation",
			},
		],
	},
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "expanded-sidebar-switcher-row")
		const name = slotIn(row, "space-switcher-name")
		const search = boxOf(slotIn(row, "expanded-sidebar-search"))
		const switcher = slotIn(row, "space-switcher")
		const chevron = switcher.lastElementChild as Element
		await expect(boxOf(switcher).right - boxOf(chevron).right).toBe(5)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(search.width).toBe(28)
		await expect(search.right).toBe(boxOf(row).right)
	},
})
