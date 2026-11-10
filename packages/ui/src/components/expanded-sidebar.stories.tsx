import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	ExpandedSidebar,
	type ExpandedSidebarProps,
} from "@workspace/ui/components/expanded-sidebar"
import type { Space } from "@workspace/ui/components/space"
import { UpdateRow } from "@workspace/ui/components/update-badge"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"

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

const rowsOf = (conversations: AppSidebarConversation[], isPinned: boolean) =>
	conversations.map((conversation) => (
		<ConversationRosterRow
			conversation={conversation}
			isPinned={isPinned}
			isSelected={false}
			key={conversation.id}
			lift={STILL_LIFT}
			sections={[SIDEBAR_SECTION]}
		/>
	))

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

const PAPER_WINDOW = (args: ExpandedSidebarProps) => (
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
		<ExpandedSidebar {...args} />
		<ContentCard />
	</WorkspaceShellRoot>
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
					"The expanded sidebar of the navigation shell, top to bottom: Space switcher, the destinations menu, Pinned and Conversations, then the space dots, the update row and the person footer when they apply. One story per Paper page A artboard; the row list is the current conversation rows, restyled in OPE-2148.",
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
			"space-switcher",
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
		for (const name of ["Toggle sidebar", "Back", "Forward", "Settings"])
			await expect(canvas.getByRole("button", { name })).toBeVisible()

		const settings = canvas.getByRole("button", { name: "Settings" })
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
					"The current space is shared and its host is not connected. Check the switcher square dims with a grey dot at its corner and Not connected follows the name before the chevron.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const switcher = slotIn(canvasElement, "space-switcher")
		await expect(within(switcher).getByText("Not connected")).toBeVisible()
		await expect(
			slotIn(switcher, "space-switcher-offline-dot"),
		).toBeInTheDocument()
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
		sections: [{ id: "clients", name: "Clients", rows: [] }],
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
