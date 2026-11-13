import { type ReactNode, useRef, useState } from "react"
import { expect, fireEvent, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	carrySpaceCarousel,
	expectSkeletonFilledTo,
	expectSpaceCarouselHeld,
	FRAME_POLL,
	isInBrowserRunner,
	realPointer,
	scrollSpaceCarousel,
	settled,
	slotIn,
	slotsIn,
	spaceListInView,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { pointerAt } from "@workspace/storybook/tab-drag-gesture"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	PENDING_QUESTION,
	PINNED_CONVERSATIONS,
	RECENT_CONVERSATIONS,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import type {
	AppSidebarBot,
	AppSidebarRowMission,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar-model"
import {
	conversationEntry,
	PINNED_ZONE,
	SORTED,
	SORTED_ZONE,
} from "@workspace/ui/components/app-sidebar-pins"
import {
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
import { COMPACT_LEAD_SIDE } from "@workspace/ui/components/compact-rows"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	ExpandedSidebar,
	type ExpandedSidebarDestination,
	ExpandedSidebarList,
	type ExpandedSidebarProps,
	type ExpandedSidebarSection,
} from "@workspace/ui/components/expanded-sidebar"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import type { Space } from "@workspace/ui/components/space"
import type { SpaceAvatarState } from "@workspace/ui/components/space-avatar"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import { UpdateRow } from "@workspace/ui/components/update-badge"
import { WorkspaceShellRoot } from "@workspace/ui/components/workspace-shell"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

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

const treeMission = (
	state: AppSidebarRowMission["state"],
	externalId: string,
	title: string,
): AppSidebarRowMission => ({
	id: externalId,
	state,
	isLive: state === "working",
	ticket: { platform: "linear", externalId, title },
})

const RELEASE_TRAIN: AppSidebarConversation = {
	...artboardRow("Release train"),
	color: BLOT_HUES.blue,
	icon: "Rocket",
	missions: [
		treeMission("failed", "OPE-412", "Fix the flaky upload test"),
		treeMission("waiting", "OPE-418", "Review the migration plan"),
	],
}

const ONBOARDING_FLOW: AppSidebarConversation = {
	...artboardRow("Onboarding flow"),
	color: BLOT_HUES.green,
	missions: [
		treeMission("working", "OPE-421", "Rewrite the welcome email"),
		treeMission("ready", "OPE-425", "Ship the empty states"),
	],
}

const TREE_CONVERSATIONS = [
	RELEASE_TRAIN,
	ROADMAP_REVIEW,
	ONBOARDING_FLOW,
	LISBON_OFFSITE,
]

const LONG_TITLES: AppSidebarConversation[] = [
	{
		...RELEASE_TRAIN,
		name: "Quarterly planning review with every regional lead and the board",
		missions: [
			treeMission(
				"working",
				"OPE-431",
				"Migrate every customer workspace to the new storage layout without downtime",
			),
		],
	},
]

const treeListOf = (conversations: AppSidebarConversation[]) => (
	<SidebarMenu>
		{conversations.map((conversation) => (
			<ConversationRosterRow
				conversation={conversation}
				isPinned={false}
				isSelected={conversation.id === ROADMAP_REVIEW.id}
				key={conversation.id}
				lift={STILL_LIFT}
				sections={[SIDEBAR_SECTION]}
			/>
		))}
		<BotRosterRow
			bot={ATLAS}
			isPinned={false}
			isSelected={false}
			lift={STILL_LIFT}
			memberships={[STUDIO.id]}
			sections={[SIDEBAR_SECTION]}
			spaces={[STUDIO]}
		/>
	</SidebarMenu>
)

const TREE_ARTBOARD = {
	...STATE_ARTBOARD,
	destination: undefined,
	missionCount: 4,
	pinned: [],
	conversations: treeListOf(TREE_CONVERSATIONS),
}

const LIST_END_BAR_WIDTHS = [
	[140, 180],
	[112, 164],
]

const DOWNLOAD = fn()

const DARK = { theme: "dark", theme_layout: "single" }

const LIGHT = { theme: "light", theme_layout: "single" }

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
					"The expanded sidebar of the navigation shell, top to bottom: Space switcher, then the list, which scrolls the destinations menu with Pinned and Conversations, then the footer block holding the space dots, the update row and the person button when they apply. A two finger horizontal swipe over the list changes Space. Every agent, conversation and mission row is one 30px line, compact direction D of OPE-2209: the D stories hold one state each.",
			},
		},
	},
	args: {
		spaces: [KIROSHI],
		selectedSpaceId: KIROSHI.id,
		destination: "newConversation" as const,
		missionCount: 3,
		pinned: rowsOf(PINNED_CONVERSATIONS, true),
		conversations: rowsOf(RECENT_CONVERSATIONS, false),
		user: { name: "Ada Martin" },
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

const navigationMenuIn = (sidebar: HTMLElement) =>
	sidebar.querySelector(
		'[data-slot="sidebar-content"] > [data-slot="sidebar-menu"]',
	) as HTMLElement

const rosterRowsIn = (sidebar: HTMLElement) =>
	Array.from(
		sidebar.querySelectorAll<HTMLElement>(
			'[data-slot="fold-section"] [data-slot="sidebar-menu-button"]',
		),
	)

export const ExpandedNewConversation = meta.story({
	name: "1 Expanded New",
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1: one space, no pending update, New open. Check the blocks run switcher, list, footer with nothing between the list and the footer, the menu leading the list it scrolls with, ahead of Pinned and Conversations, that New alone wears the selected fill and reports itself as the current page, that a section header folds its rows and says so, and that the title bar and footer buttons carry a name and a focus ring, the footer being one button with no button nested in it and its gear hidden from assistive technology. Check the New row draws the same Add glyph as the New tab button, the switcher sits alone in its row reaching its right edge, and the footer avatar measures the same width and height as the Space logo and sits on its vertical line, centred 34px from the sidebar edge, 8px from its row's start edge and from its top, in a 44px row like the switcher's, while the navigation icons are centred 27px in. Check both section headers are 30px tall with their label 6px in, the first row starts 31px under the top of its header and Conversations sits 24px under the last pinned row. With a single Space, check the carousel refuses a sideways scroll and no selection is reported. Pick `ExpandedMissions` for the other destination.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectSpaceCarouselHeld(sidebarIn(canvasElement))
		await expect(args.onSelectSpace).not.toHaveBeenCalled()

		const sidebar = within(sidebarIn(canvasElement))
		const current = sidebar.getByRole("button", { name: "New" })
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
			"space-carousel",
			"expanded-sidebar-footer-block",
		])
		await expect(
			slotIn(canvasElement, "sidebar-content").firstElementChild,
		).toBe(navigationMenuIn(sidebarIn(canvasElement)))
		await expect(
			canvasElement.querySelector('[data-slot="update-row"]'),
		).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="space-dots"]'),
		).toBeNull()

		await expect(
			listRhythmOf({
				headers: slotsIn(canvasElement, "fold-section-trigger"),
				firstSectionRows: slotsIn(
					slotIn(canvasElement, "fold-section"),
					"sidebar-menu-button",
				),
			}),
		).toEqual(LIST_RHYTHM)

		const pinned = sidebar.getByRole("button", { name: "Pinned" })
		await expect(pinned).toHaveAttribute("aria-expanded", "true")
		await userEvent.click(pinned)
		await expect(pinned).toHaveAttribute("aria-expanded", "false")
		await userEvent.click(pinned)
		await expect(pinned).toHaveAttribute("aria-expanded", "true")

		const canvas = within(canvasElement)
		for (const name of ["Toggle sidebar", "Back", "Forward"])
			await expect(canvas.getByRole("button", { name })).toBeVisible()

		const drawingOf = (name: string) =>
			canvas.getByRole("button", { name }).querySelector("svg")?.innerHTML
		await expect(drawingOf("New")).toBe(drawingOf("New tab"))

		const row = slotIn(canvasElement, "expanded-sidebar-switcher-row")
		const switcher = slotIn(row, "space-switcher")
		await expect(row.children).toHaveLength(1)
		await expect(row.firstElementChild).toBe(switcher)
		await expect(
			canvasElement.querySelector('[data-slot="expanded-sidebar-search"]'),
		).toBeNull()
		await expect(canvas.queryByRole("button", { name: "Search" })).toBeNull()

		const footer = slotIn(canvasElement, "expanded-sidebar-footer")
		const gear = footer.lastElementChild as Element
		await expect(footer.tagName).toBe("BUTTON")
		await expect(footer.querySelectorAll("button")).toHaveLength(0)
		await expect(footer).toHaveAccessibleName("Ada Martin, Settings")
		await expect(gear).toBeVisible()
		await expect(gear).toHaveAttribute("aria-hidden", "true")

		const box = boxOf(sidebarIn(canvasElement))
		const switcherAvatar = boxOf(slotIn(switcher, "space-avatar"))
		const footerAvatar = boxOf(slotIn(footer, "expanded-sidebar-avatar"))
		const rightInsetOf = (edge: Element, content: Element) =>
			boxOf(edge).right - boxOf(content).right
		await expect(switcherAvatar.left - boxOf(switcher).left).toBe(8)
		await expect(switcherAvatar.top - boxOf(switcher).top).toBe(8)
		await expect(rightInsetOf(row, switcher)).toBe(0)
		await expect(footerAvatar.left - boxOf(footer).left).toBe(8)
		await expect(footerAvatar.top - boxOf(footer).top).toBe(8)
		await expect(rightInsetOf(footer, gear)).toBe(8)
		await expect(
			[switcher, footer].map((avatarRow) => boxOf(avatarRow).height),
		).toEqual([SWITCHER_HEIGHT, SWITCHER_HEIGHT])
		await expectAvatarFollowsSpaceLogo(sidebarIn(canvasElement))
		const centreOf = (inner: DOMRect) => inner.left + inner.width / 2 - box.left
		const navigationIcon = canvas
			.getByRole("button", { name: "Library" })
			.querySelector("svg") as Element
		await expect(centreOf(boxOf(navigationIcon))).toBe(ROW_X_OFFSETS.iconCentre)
		await expect(centreOf(switcherAvatar)).toBe(SWITCHER_ICON_CENTRE)
		await expect(centreOf(footerAvatar)).toBe(SWITCHER_ICON_CENTRE)

		if (isInBrowserRunner()) {
			const resting = getComputedStyle(footer).backgroundColor
			const pointer = await realPointer()
			await pointer.hover(footer)
			await waitFor(
				() =>
					expect(getComputedStyle(footer).backgroundColor).not.toBe(resting),
				FRAME_POLL,
			)
			await pointer.unhover(footer)
		}

		await userEvent.click(footer)
		await expect(args.onOpenSettings).toHaveBeenCalledOnce()
		await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
		await userEvent.tab()
		await expect(footer).toHaveFocus()
		await expect(getComputedStyle(footer).outlineStyle).toBe("solid")
	},
})

export const ExpandedMissions = meta.story({
	name: "2 Expanded Missions",
	args: { destination: "missions" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 2, sidebar side: the Missions page is open. Check that Missions wears the selected fill with its count still muted on the right, and that New went back to rest.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = within(sidebarIn(canvasElement))
		await expect(
			sidebar.getByRole("button", { name: /^Missions/ }),
		).toHaveAttribute("aria-current", "page")
		await expect(
			sidebar.getByRole("button", { name: "New" }),
		).not.toHaveAttribute("aria-current")
	},
})

const ROW_PADDING = Array(4).fill("6px")

const SWITCHER_PADDING = Array(4).fill("8px")

const SWITCHER_HEIGHT = 44

const ROW_HEIGHT = 30

const ROW_GAP = 1

const MISSION_GLYPH = 14

const MISSION_INDENT = 24

const MISSION_MARK_GAP = 8

const MISSION_PADDING = ["6px", "6px", "6px", "8px"]

const PANEL_PADDING = 12

const BLOCK_GAP = 24

const SWITCHER_ICON_CENTRE = 34

const ROW_X_OFFSETS = { iconCentre: 27, labelStart: 44 }

const LIST_RHYTHM = {
	headerHeights: [ROW_HEIGHT, ROW_HEIGHT],
	headerInsets: [6, 6],
	firstRowTop: ROW_HEIGHT + ROW_GAP,
	sectionGap: BLOCK_GAP,
}

const SKELETON_RHYTHM = {
	headerHeights: [32, 32],
	headerInsets: [8, 8],
	firstRowTop: 34,
	sectionGap: 12,
}

type ListRhythmParts = {
	headers: Element[]
	firstSectionRows: Element[]
}

const listRhythmOf = ({ headers, firstSectionRows }: ListRhythmParts) => ({
	headerHeights: headers.map((header) => boxOf(header).height),
	headerInsets: headers.map(
		(header) =>
			boxOf(header.firstElementChild as Element).left - boxOf(header).left,
	),
	firstRowTop: boxOf(firstSectionRows[0]).top - boxOf(headers[0]).top,
	sectionGap:
		boxOf(headers[1]).top - boxOf(firstSectionRows.at(-1) as Element).bottom,
})

const paddingOf = (element: Element) => {
	const style = getComputedStyle(element)
	return [
		style.paddingTop,
		style.paddingRight,
		style.paddingBottom,
		style.paddingLeft,
	]
}

const colourTransitionsOf = (element: Element) => {
	const style = getComputedStyle(element)
	const durations = style.transitionDuration.split(", ")
	return style.transitionProperty
		.split(", ")
		.filter(
			(property, rank) =>
				/color|^all$/.test(property) &&
				Number.parseFloat(durations[rank % durations.length]) > 0,
		)
}

const conversationButtonOf = (tree: Element) =>
	slotIn(tree.parentElement as HTMLElement, "sidebar-menu-button")

const centreOfBox = (element: Element) => {
	const box = boxOf(element)
	return [box.left + box.width / 2, box.top + box.height / 2] as const
}

const expectAvatarFollowsSpaceLogo = async (sidebar: HTMLElement) => {
	const logo = boxOf(slotIn(slotIn(sidebar, "space-switcher"), "space-avatar"))
	const avatar = boxOf(slotIn(sidebar, "expanded-sidebar-avatar"))
	await expect([avatar.width, avatar.height]).toEqual([logo.width, logo.height])
}

const expectTreeArtboard = async ({ canvasElement }: StoryCanvas) => {
	const sidebar = sidebarIn(canvasElement)
	const controls = within(sidebar).getAllByRole("button")
	for (const control of controls)
		await expect(colourTransitionsOf(control)).toEqual([])

	await expect(paddingOf(slotIn(sidebar, "space-switcher"))).toEqual(
		SWITCHER_PADDING,
	)
	const rows = [
		...slotsIn(sidebar, "sidebar-menu-button"),
		...slotsIn(sidebar, "fold-section-trigger"),
	]
	for (const row of rows) {
		await expect(paddingOf(row)).toEqual(ROW_PADDING)
		await expect(boxOf(row).height).toBe(ROW_HEIGHT)
	}
	const footer = slotIn(sidebar, "expanded-sidebar-footer")
	await expect(paddingOf(footer)).toEqual(SWITCHER_PADDING)
	await expect(boxOf(footer).height).toBe(SWITCHER_HEIGHT)
	await expectAvatarFollowsSpaceLogo(sidebar)

	for (const name of ["New", /^Missions/, "Library"]) {
		const item = within(sidebar).getByRole("button", { name })
		const slot = item.querySelector("span[aria-hidden]") as HTMLElement
		await expect(boxOf(slot).width).toBe(COMPACT_LEAD_SIDE)
		await expect(getComputedStyle(slot).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(boxOf(slot.querySelector("svg") as SVGElement).width).toBe(
			COMPACT_LEAD_SIDE,
		)
	}

	const leads = rosterRowsIn(sidebar).map((row) =>
		row.querySelector(":scope > span:first-child > *"),
	)
	await expect(
		leads.map((lead) => [
			lead?.getAttribute("data-slot"),
			boxOf(lead as Element).width,
		]),
	).toEqual(
		leads.map((lead) => [lead?.getAttribute("data-slot"), COMPACT_LEAD_SIDE]),
	)

	for (const tree of slotsIn(sidebar, "mission-capsule-list")) {
		const head = conversationButtonOf(tree)
		const trunk = getComputedStyle(tree, "::before")
		await expect(boxOf(tree).top).toBe(boxOf(head).bottom + ROW_GAP)
		await expect([
			trunk.insetInlineStart,
			trunk.width,
			trunk.top,
			trunk.bottom,
		]).toEqual(["14px", "1.5px", "0px", "0px"])
		await expect(trunk.pointerEvents).toBe("none")
		const title = slotIn(head, "roster-row-name")
		for (const row of slotsIn(tree, "mission-capsule")) {
			const glyph = slotIn(row, "mission-capsule-glyph")
			await expect(boxOf(row).height).toBe(ROW_HEIGHT)
			await expect(paddingOf(row)).toEqual(MISSION_PADDING)
			await expect(
				row.querySelector('[data-slot="mission-capsule-lane"]'),
			).toBeNull()
			await expect(boxOf(row).left - boxOf(tree).left).toBe(MISSION_INDENT)
			await expect(boxOf(glyph).width).toBe(MISSION_GLYPH)
			await expect(boxOf(glyph).left).toBe(boxOf(title).left)
			await expect(row.tagName).toBe("BUTTON")
			await expect(row).not.toHaveAttribute("aria-current")
			await expect(row.querySelector(".sr-only")).not.toBeEmptyDOMElement()
			await expect(
				row.contains(document.elementFromPoint(...centreOfBox(row))),
			).toBe(true)
		}
	}
}

const TREE_DESCRIPTION =
	"Compact direction D: four conversations, two of them carrying missions under their row, and one agent row. Check every row is one 30px line padded 6 on all four sides, each mission is a button of its own under the pointer that starts 24px in, past the trunk under its conversation icon, pads 8 at its start and sits its 14px state mark on the title column, and the destinations show their glyph alone. The Space switcher keeps the 8px inset it has on main, and the person footer takes the same 44px row, 8px inset and avatar size."

export const Missions1TreeExpanded = meta.story({
	name: "Missions 1 Tree",
	args: TREE_ARTBOARD,
	parameters: { docs: { description: { story: TREE_DESCRIPTION } } },
	play: async ({ canvasElement }) => {
		await expectTreeArtboard({ canvasElement })
		await expect(
			slotsIn(canvasElement, "mission-capsule").map((row) => row.dataset.state),
		).toEqual(["failed", "waiting", "working", "ready"])
	},
})

export const Missions1TreeLightExpanded = meta.story({
	name: "Missions 1 Tree Light",
	globals: LIGHT,
	args: TREE_ARTBOARD,
	parameters: { docs: { description: { story: TREE_DESCRIPTION } } },
	play: expectTreeArtboard,
})

export const Missions1TreeLongTitlesExpanded = meta.story({
	name: "Missions 1 Tree Long titles",
	args: { ...TREE_ARTBOARD, conversations: treeListOf(LONG_TITLES) },
	parameters: {
		docs: {
			description: {
				story:
					"A conversation title and a mission title longer than the column. Check both stay on one 18px line and end in an ellipsis, the row height untouched.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectTreeArtboard({ canvasElement })
		const name = slotIn(canvasElement, "roster-row-name")
		const title = slotIn(canvasElement, "mission-capsule-title")
		for (const line of [name, title]) {
			await expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
			await expect(getComputedStyle(line).textOverflow).toBe("ellipsis")
		}
		await expect(boxOf(name).height).toBe(18)
		await expect(boxOf(title).height).toBe(18)
		await expect(boxOf(slotIn(canvasElement, "mission-capsule")).height).toBe(
			ROW_HEIGHT,
		)
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
				story: `The switcher of a ${state} Space. Check the row stays 40px tall with a 10px gap, and draws the generated 28px avatar in the Space colour with the ${state} host state, then the name and the chevron, with no attention ring even though the Space waits on the person.`,
			},
		},
	},
	play: async ({ canvasElement }: StoryCanvas) => {
		const switcher = slotIn(canvasElement, "space-switcher")
		const avatar = slotIn(switcher, "space-avatar")
		await expect(switcher.getBoundingClientRect().height).toBe(SWITCHER_HEIGHT)
		await expect(getComputedStyle(switcher).columnGap).toBe("10px")
		await expect(avatar.dataset.state).toBe(state)
		await expect(avatar.dataset.size).toBe("28")
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
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES },
	render: (args) => <SpaceFollowingWindow {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The list sits in the native scroll snap carousel of the pre-shell sidebar: a two finger swipe over it scrolls the panels under the fingers, and a panel covering more than half of the carousel selects its Space. Check a scroll of one panel width forward selects the next Space, shows it in the switcher and draws the list in its panel, and one back selects the first again. Swipe with a trackpad over the list to feel it. Pick `SwipeWithSwitchingNotAllowedDoesNothingExpanded` for the held carousel.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const sidebar = sidebarIn(canvasElement)

		await scrollSpaceCarousel(sidebar, 1)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(1)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("perso")
		await waitFor(() =>
			expect(
				within(sidebar).getByRole("button", {
					name: "Change space, Perso open",
				}),
			).toBeVisible(),
		)
		await expect(
			slotIn(sidebar, "sidebar-content").closest("[data-slot=space-panel]"),
		).not.toHaveAttribute("inert")

		await scrollSpaceCarousel(sidebar, -1)
		await expect(args.onSelectSpace).toHaveBeenCalledTimes(2)
		await expect(args.onSelectSpace).toHaveBeenLastCalledWith("kiroshi")
		await expect(document.documentElement.scrollLeft).toBe(0)
	},
})

export const SwipeWithSwitchingNotAllowedDoesNothingExpanded = meta.story({
	name: "Swipe with switching not allowed does nothing Expanded",
	tags: ["test-only"],
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
		await expectSpaceCarouselHeld(sidebarIn(canvasElement))
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

const spaceListOf = (space: Space) => (
	<ExpandedSidebarList
		conversations={rowsOf([artboardRow(`${space.name} weekly sync`)], false)}
		pinned={null}
	/>
)

export const NeighbourListShowsMidSwipeExpanded = meta.story({
	name: "Neighbour list shows mid swipe Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES, renderSpaceList: spaceListOf },
	parameters: {
		docs: {
			description: {
				story:
					"A swipe carried four tenths of a panel towards the next Space, short of the crossing, with the list of every Space handed in. Check the next Space's list is drawn in the incoming panel and already under the fingers, and that no Space is selected yet. Check the incoming panel leads with a copy of the destinations menu at the height of the real one, inert and hidden from assistive technology, so one Library button is exposed and the list does not shift when the swipe lands.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const view = sidebarIn(canvasElement)
		const carousel = slotIn(view, "space-carousel")
		const neighbour = within(carousel).getByText("Perso weekly sync")
		const carouselRight = carousel.getBoundingClientRect().right
		await expect(neighbour.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			carouselRight,
		)

		const menu = navigationMenuIn(view)
		const menuCopy = neighbour.closest('[data-slot="sidebar-content"]')
			?.firstElementChild as HTMLElement
		await expect(
			within(view).getAllByRole("button", { name: "Library" }),
		).toHaveLength(1)
		await expect(menuCopy).toHaveAttribute("aria-hidden", "true")
		await expect(menuCopy.closest("[inert]")).not.toBeNull()
		await expect([boxOf(menuCopy).top, boxOf(menuCopy).height]).toEqual([
			boxOf(menu).top,
			boxOf(menu).height,
		])

		await carrySpaceCarousel(view, 0.4)
		await expect(neighbour.getBoundingClientRect().left).toBeLessThan(
			carouselRight,
		)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

const spaceListWithEmptySectionOf = (space: Space) => (
	<ExpandedSidebarList
		conversations={rowsOf([artboardRow(`${space.name} weekly sync`)], false)}
		pinned={null}
		sections={[sectionOf(`${space.id}-clients`, "Clients", null)]}
	/>
)

export const NeighbourEmptySectionMidSwipeExpanded = meta.story({
	name: "Neighbour empty section mid swipe Expanded",
	args: {
		spaces: SEVERAL_SPACES,
		renderSpaceList: spaceListWithEmptySectionOf,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A swipe carried four tenths of a panel towards the next Space, whose Clients section holds no row, the way the app hands a neighbour's empty section in. Check the section still draws its dashed drop zone with its empty label, start aligned, in the incoming panel, and that no Space is selected yet.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const view = sidebarIn(canvasElement)
		const carousel = slotIn(view, "space-carousel")
		const zone = slotIn(carousel, "roster-section-drop")
		await expect(zone.closest("[data-slot=space-panel]")).toHaveAttribute(
			"inert",
		)
		await expect(zone).toHaveTextContent("Drop an agent here")
		await expect(getComputedStyle(zone).borderTopStyle).toBe("dashed")
		await expect(getComputedStyle(zone).textAlign).toBe("start")

		const carouselRight = carousel.getBoundingClientRect().right
		await carrySpaceCarousel(view, 0.4)
		await expect(zone.getBoundingClientRect().left).toBeLessThan(carouselRight)
		await expect(args.onSelectSpace).not.toHaveBeenCalled()
	},
})

const LONG_LIST = rowsOf(
	Array.from({ length: 40 }, (_, rank) => artboardRow(`Thread ${rank + 1}`)),
	false,
)

export const ListScrollKeptAcrossSwipeExpanded = meta.story({
	name: "List scroll kept across a swipe Expanded",
	tags: ["test-only"],
	args: { spaces: SEVERAL_SPACES, conversations: LONG_LIST },
	render: (args) => <SpaceFollowingWindow {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A list scrolled down, then a swipe to the next Space and back. Check the next Space opens at the top of its list and the first one comes back at the offset it was left at.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const view = sidebarIn(canvasElement)
		const list = spaceListInView(view)
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
		list.scrollTop = 90
		await new Promise(requestAnimationFrame)

		await scrollSpaceCarousel(view, 1)
		await expect(spaceListInView(view).scrollTop).toBe(0)

		await scrollSpaceCarousel(view, -1)
		await waitFor(
			() => expect(spaceListInView(view).scrollTop).toBe(90),
			FRAME_POLL,
		)
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
					"The Clients section is empty. Check its header stays between Pinned and Conversations and a dashed zone sits 1px under it, its copy start aligned where the roster centres it.",
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
		await expect(boxOf(zone).top - boxOf(clients).bottom).toBe(ROW_GAP)
	},
})

export const L1LoadingExpanded = meta.story({
	name: "L1 Loading Expanded",
	args: { ...NO_ROWS_ARTBOARD, listStatus: "loading" },
	parameters: {
		docs: {
			description: {
				story:
					"The list is loading. Check the skeleton replaces every section, runs flat with its second header bar after two rows, and reaches the bottom of the list area. Check both header bars sit in a 32px header 8px in, the first row starts 34px under the top of its header bar and the second header 12px under the second row, the destinations menu staying above the skeleton. That is the rhythm of the list before OPE-2209: the compact list of `ExpandedNewConversation` holds 30px headers and rows, so the list moves when it arrives until the skeleton follows.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual([])
		await expect(
			listRhythmOf({
				headers: slotsIn(canvasElement, "sidebar-list-skeleton-header"),
				firstSectionRows: slotsIn(
					canvasElement,
					"sidebar-list-skeleton-row",
				).slice(0, 2),
			}),
		).toEqual(SKELETON_RHYTHM)
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
					"The next page is loading. Check two skeleton rows follow the last conversation row 1px under it, inside the Conversations body.",
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
		await expect(boxOf(rows[0]).top - boxOf(lastRow).bottom).toBe(ROW_GAP)
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
		await expect(paddingOf(clients)).toEqual(ROW_PADDING)
		await expect(boxOf(clients).height).toBe(ROW_HEIGHT)
		await expect(style.borderTopLeftRadius).toBe("6px")
		await expect(style.columnGap).toBe("4px")
		await expect(style.justifyContent).toBe("space-between")
		await expect(style.fontSize).toBe("13px")
		await expect(style.lineHeight).toBe("18px")
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
		await expect(paddingOf(field)).toEqual(ROW_PADDING)
		await expect(boxOf(field).height).toBe(ROW_HEIGHT)
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
		const lists = Array.from(
			content.querySelectorAll('[data-slot="fold-section"] ul'),
		)
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
			<RosterLiftFrame isLifting={drag.isLifting} ref={frameRef}>
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

const activeRowHoverStory = (globals: typeof DARK) => ({
	globals,
	parameters: {
		docs: {
			description: {
				story:
					"The pointer rests on the current destination. Check the row keeps its selected fill, `--sidebar-selected`, under the pointer.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = within(canvasElement).getByRole("button", {
			name: "New",
		})
		const selectedFill = selectedFillOf(row)
		await expect(getComputedStyle(row).backgroundColor).toBe(selectedFill)
		const pointer = await realPointer()
		try {
			await pointer.hover(row)
			await expect(row.matches(":hover")).toBe(true)
			await expect(getComputedStyle(row).backgroundColor).toBe(selectedFill)
		} finally {
			await pointer.unhover(row)
		}
	},
})

export const ActiveRowHoveredExpanded = meta.story(activeRowHoverStory(DARK))

export const ActiveRowHoveredLightExpanded = meta.story(
	activeRowHoverStory(LIGHT),
)

const xOffsetsOf = (row: Element, glyph: Element, sidebar: DOMRect) => {
	const icon = boxOf(glyph)
	return {
		iconCentre: icon.left + icon.width / 2 - sidebar.left,
		labelStart: boxOf(row.children[1] as Element).left - sidebar.left,
	}
}

const expectTopMenuAlignedOnConversations = async (
	canvasElement: HTMLElement,
) => {
	const sidebar = sidebarIn(canvasElement)
	const box = boxOf(sidebar)
	const item = within(sidebar).getByRole("button", { name: "Library" })
	const glyph = item.querySelector("svg") as SVGElement
	await expect(boxOf(item).height).toBe(ROW_HEIGHT)
	await expect(boxOf(glyph).width).toBe(COMPACT_LEAD_SIDE)
	await expect(paddingOf(item)).toEqual(ROW_PADDING)
	const conversation = rosterRowsIn(sidebar)[0]
	const avatar = conversation.querySelector(
		":scope > span:first-child > *",
	) as Element
	await expect(xOffsetsOf(item, glyph, box)).toEqual(ROW_X_OFFSETS)
	await expect(xOffsetsOf(conversation, avatar, box)).toEqual(ROW_X_OFFSETS)
	return item
}

export const TopMenuAtRestExpanded = meta.story({
	name: "Top menu at rest",
	parameters: {
		docs: {
			description: {
				story:
					"The destinations menu at rest. Check each button is 30px tall with an 18px glyph and pads 6 on all four sides, and that its icon centre and label start sit 27px and 44px from the sidebar edge, the same as a conversation row's.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const item = await expectTopMenuAlignedOnConversations(canvasElement)
		await expect(getComputedStyle(item).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
	},
})

export const TopMenuHoveredExpanded = meta.story({
	name: "Top menu hovered",
	parameters: {
		pseudo: {
			hover:
				'[data-slot="sidebar-content"] > [data-slot="sidebar-menu"] > li:last-child [data-slot="sidebar-menu-button"]',
		},
		docs: {
			description: {
				story:
					"The pointer rests on Library in the destinations menu. Check it lights `--sidebar-hover` at once, with no colour transition, without moving its glyph or its label.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const item = await expectTopMenuAlignedOnConversations(canvasElement)
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		await withMotionAllowed(async () => {
			try {
				await pointer.hover(item)
				await expect(getComputedStyle(item).backgroundColor).toBe(
					hoverFillOf(item),
				)
				await expect(colourTransitionsOf(item)).toEqual([])
				await expectTopMenuAlignedOnConversations(canvasElement)
			} finally {
				await pointer.unhover(item)
			}
		})
	},
})

const ROW_COLUMNS = { ...ROW_X_OFFSETS, trailingEnd: 18 }

const SWITCHER_COLUMNS = { iconCentre: SWITCHER_ICON_CENTRE, labelStart: 58 }

const HEADER_COLUMNS = { labelStart: 18, trailingEnd: 18 }

const FOOTER_COLUMNS = { ...SWITCHER_COLUMNS, trailingEnd: 20 }

const META_LANE_WIDTH = 64

type RowColumnParts = {
	icon?: Element
	label: Element
	trailing?: Element
}

type RowKind = {
	row: HTMLElement
	parts: RowColumnParts
	columns: Partial<typeof ROW_COLUMNS>
	height: number
	padding: string[]
}

const switcherPartsOf = (switcher: Element): RowColumnParts => ({
	icon: slotIn(switcher, "space-avatar"),
	label: slotIn(switcher, "space-switcher-name"),
})

const topMenuPartsOf = (item: Element): RowColumnParts => ({
	icon: item.firstElementChild as Element,
	label: item.children[1] as Element,
	trailing: item.lastElementChild as Element,
})

const headerPartsOf = (header: Element): RowColumnParts => ({
	label: header.firstElementChild as Element,
	trailing: header.lastElementChild as Element,
})

const listRowPartsOf = (row: Element): RowColumnParts => ({
	icon: row.querySelector(":scope > span:first-child > *") as Element,
	label: slotIn(row, "roster-row-name"),
	trailing: slotIn(row, "roster-row-meta"),
})

const footerPartsOf = (footer: Element): RowColumnParts => ({
	icon: slotIn(footer, "expanded-sidebar-avatar"),
	label: footer.children[1] as Element,
	trailing: footer.lastElementChild as Element,
})

const columnsOf = (
	{ icon, label, trailing }: RowColumnParts,
	sidebar: DOMRect,
) => ({
	...(icon
		? { iconCentre: boxOf(icon).left + boxOf(icon).width / 2 - sidebar.left }
		: {}),
	labelStart: boxOf(label).left - sidebar.left,
	...(trailing ? { trailingEnd: sidebar.right - boxOf(trailing).right } : {}),
})

const expectRowsOnSharedColumns = async ({ canvasElement }: StoryCanvas) => {
	const sidebar = sidebarIn(canvasElement)
	const switcher = slotIn(sidebar, "space-switcher")
	const menuItem = within(sidebar).getByRole("button", { name: /^Missions/ })
	const header = slotIn(sidebar, "fold-section-trigger")
	const listRows = rosterRowsIn(sidebar)
	const footer = slotIn(sidebar, "expanded-sidebar-footer")
	await expect(
		listRows.map((row) => slotIn(row, "roster-row-name").textContent),
	).toEqual([RELEASE_TRAIN.name, ROADMAP_REVIEW.name, ATLAS.name])
	await expect(slotsIn(sidebar, "mission-capsule-list")).toHaveLength(1)

	const kinds: RowKind[] = [
		{
			row: switcher,
			parts: switcherPartsOf(switcher),
			columns: SWITCHER_COLUMNS,
			height: SWITCHER_HEIGHT,
			padding: SWITCHER_PADDING,
		},
		{
			row: menuItem,
			parts: topMenuPartsOf(menuItem),
			columns: ROW_COLUMNS,
			height: ROW_HEIGHT,
			padding: ROW_PADDING,
		},
		{
			row: header,
			parts: headerPartsOf(header),
			columns: HEADER_COLUMNS,
			height: ROW_HEIGHT,
			padding: ROW_PADDING,
		},
		...listRows.map((row) => ({
			row,
			parts: listRowPartsOf(row),
			columns: ROW_COLUMNS,
			height: ROW_HEIGHT,
			padding: ROW_PADDING,
		})),
		{
			row: footer,
			parts: footerPartsOf(footer),
			columns: FOOTER_COLUMNS,
			height: SWITCHER_HEIGHT,
			padding: SWITCHER_PADDING,
		},
	]
	await expect(
		[menuItem, ...listRows].map(
			(row) => boxOf(row.lastElementChild as Element).width,
		),
	).toEqual([menuItem, ...listRows].map(() => META_LANE_WIDTH))
	const columns = () => {
		const box = boxOf(sidebar)
		return kinds.map(({ parts }) => columnsOf(parts, box))
	}
	const resting = columns()
	await expect(resting).toEqual(kinds.map((kind) => kind.columns))
	await expect(kinds.map(({ row }) => paddingOf(row))).toEqual(
		kinds.map(({ padding }) => padding),
	)
	await expect(kinds.map(({ row }) => boxOf(row).height)).toEqual(
		kinds.map(({ height }) => height),
	)

	if (!isInBrowserRunner()) return
	const pointer = await realPointer()
	for (const { row } of kinds) {
		try {
			await pointer.hover(row)
			await settled(row)
			await expect(row.matches(":hover")).toBe(true)
			await expect(getComputedStyle(row).backgroundColor).toBe(
				tokenStyleIn(
					row,
					row.hasAttribute("aria-current")
						? "bg-sidebar-selected"
						: "bg-sidebar-hover",
					"backgroundColor",
				),
			)
			await expect(colourTransitionsOf(row)).toEqual([])
			await expect(columns()).toEqual(resting)
		} finally {
			await pointer.unhover(row)
		}
	}
}

const ROW_COLUMNS_ARTBOARD = {
	...TREE_ARTBOARD,
	conversations: treeListOf([RELEASE_TRAIN, ROADMAP_REVIEW]),
}

const ROW_COLUMNS_DESCRIPTION =
	"The Space switcher and the destinations menu above a conversation carrying missions, a conversation carrying none and an agent row, then the person footer. Check the lead centre sits 27px and the title 44px from the sidebar's start edge in the Missions item and the three rows alike, that their trailing lane ends 18px from its end edge and is 64px wide, and that the section header starts its label and ends its chevron 18px from the edges. Check every one of them is 30px tall and pads 6 on all four sides, that the switcher keeps main's 44px row, 8px inset and columns, that the footer takes the switcher's row, inset and columns with its gear ending 20px from the edge, and that resting the pointer on any of them, the Space header, a destination, a section header, a row or the person button, lights `--sidebar-hover` at once, a row that is the current page keeping `--sidebar-selected`, and moves none of the columns."

export const RowColumnsExpanded = meta.story({
	name: "Row columns",
	args: ROW_COLUMNS_ARTBOARD,
	parameters: { docs: { description: { story: ROW_COLUMNS_DESCRIPTION } } },
	play: expectRowsOnSharedColumns,
})

export const RowColumnsLightExpanded = meta.story({
	name: "Row columns Light",
	globals: LIGHT,
	args: ROW_COLUMNS_ARTBOARD,
	parameters: { docs: { description: { story: ROW_COLUMNS_DESCRIPTION } } },
	play: expectRowsOnSharedColumns,
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
		const switcher = slotIn(row, "space-switcher")
		const chevron = switcher.lastElementChild as Element
		await expect(boxOf(switcher).right - boxOf(chevron).right).toBe(8)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(boxOf(switcher).right).toBe(boxOf(row).right)
	},
})

const SHARED_ROWS_DESCRIPTION =
	"The content the collapsed sidebar draws in its own Shared rows story: one Space, the three destinations, two pinned and three recent conversations, an available update and the person. Check the update row sits between the list and the footer, above the 44px person row."

export const SharedRowsExpanded = meta.story({
	name: "Shared rows Expanded",
	args: { update: <UpdateRow onDownload={DOWNLOAD} status="available" /> },
	parameters: { docs: { description: { story: SHARED_ROWS_DESCRIPTION } } },
})

export const SharedRowsLightExpanded = SharedRowsExpanded.extend({
	name: "Shared rows Light Expanded",
	globals: LIGHT,
})

const NOVA: AppSidebarBot = {
	id: "nova",
	blot: BLOT_HUES.green,
	name: "Nova",
}

const IGNORED = () => undefined

const STILL_ROWS: RosterRowsContext = {
	keepFocus: IGNORED,
	lift: STILL_LIFT,
	membershipsOf: () => [],
	onMoveKey: IGNORED,
	sections: [],
	shiftOf: IGNORED,
	spaces: [STUDIO],
}

const compactRow = (
	name: string,
	timestamp: string,
	lastActivityAt: number,
): AppSidebarConversation => ({
	id: name,
	name,
	participants: [ATLAS],
	timestamp,
	lastActivityAt,
	color: null,
})

const ATLAS_LINE: AppSidebarConversation = {
	...compactRow(ATLAS.name, "2m", 9),
	agent: ATLAS,
}

const NOVA_LINE: AppSidebarConversation = {
	...compactRow(NOVA.name, "1h", 8),
	participants: [NOVA],
	agent: NOVA,
}

const COMPACT_RELEASE_TRAIN: AppSidebarConversation = {
	...compactRow("Release train", "5m", 7),
	icon: "Rocket",
	participants: [ATLAS, NOVA],
	missions: [
		treeMission("failed", "OPE-412", "Fix the flaky upload test"),
		treeMission("waiting", "OPE-418", "Review the plan"),
	],
}

const COMPACT_ROADMAP = compactRow("Q3 roadmap review", "1h", 6)

const COMPACT_ONBOARDING: AppSidebarConversation = {
	...compactRow("Onboarding email draft", "3h", 5),
	participants: [ATLAS, NOVA],
}

const COMPACT_OFFSITE = compactRow("Lisbon offsite plan", "2d", 4)

const COMPACT_AGENTS = [ATLAS_LINE, NOVA_LINE]

const COMPACT_CONVERSATIONS = [
	COMPACT_RELEASE_TRAIN,
	COMPACT_ROADMAP,
	COMPACT_ONBOARDING,
	COMPACT_OFFSITE,
]

const OPEN_MISSION = fn()

type CompactArtboard = {
	agents?: AppSidebarConversation[]
	conversations?: AppSidebarConversation[]
	selectedConversationId?: string
	openMissionId?: string
	destination?: ExpandedSidebarDestination
}

const compactArtboardOf = ({
	agents = COMPACT_AGENTS,
	conversations = COMPACT_CONVERSATIONS,
	selectedConversationId,
	openMissionId,
	destination,
}: CompactArtboard = {}) => {
	const rows = {
		...STILL_ROWS,
		selectedConversationId,
		openMissionId,
		onOpenMission: OPEN_MISSION,
	}
	return {
		...STATE_ARTBOARD,
		destination,
		missionCount: 4,
		pinned: rosterMenuOf(
			agents.map((agent) => conversationEntry(agent)),
			true,
			rows,
		),
		conversations: recentMenuOf(conversations, [], rows),
	}
}

const WORKING_ATLAS: AppSidebarBot = { ...ATLAS, status: "working" }

const rowHolding = (canvasElement: HTMLElement, name: string) => {
	const row = slotsIn(sidebarIn(canvasElement), "sidebar-menu-button").find(
		(candidate) =>
			candidate
				.querySelector('[data-slot="roster-row-name"]')
				?.textContent?.startsWith(name),
	)
	if (!row) throw new Error(`No row is named ${name}`)
	return row
}

const namesOf = (rows: HTMLElement[]) =>
	rows.map((row) => slotIn(row, "roster-row-name").textContent)

const colourOf = (element: Element) => getComputedStyle(element).color

const fillOf = (element: Element) => getComputedStyle(element).backgroundColor

const hoverFillOf = (element: HTMLElement) =>
	tokenStyleIn(element, "bg-sidebar-hover", "backgroundColor")

const selectedFillOf = (element: HTMLElement) =>
	tokenStyleIn(element, "bg-sidebar-selected", "backgroundColor")

const subjectIconOf = (row: HTMLElement) =>
	slotIn(row, "conversation-subject-icon")

const pictogramOf = (row: Element) =>
	slotIn(row as HTMLElement, "conversation-subject-icon-pictogram")

const filledShapesOf = (glyph: Element) =>
	Array.from(glyph.querySelectorAll("*")).filter(
		(shape) => getComputedStyle(shape).fill !== "none",
	)

const isDrawnFilled = (glyph: Element) => filledShapesOf(glyph).length > 0

const currentControlsIn = (sidebar: HTMLElement) =>
	within(sidebar)
		.getAllByRole("button")
		.filter((control) => control.hasAttribute("aria-current"))

const gearOf = (person: Element) =>
	person.lastElementChild?.querySelector("svg") as Element

const expectRowLanes = async (row: HTMLElement) => {
	const title = slotIn(row, "roster-row-name")
	const meta = slotIn(row, "roster-row-meta")
	await expect(boxOf(row).height).toBe(ROW_HEIGHT)
	await expect(paddingOf(row)).toEqual(ROW_PADDING)
	await expect(getComputedStyle(row).borderTopLeftRadius).toBe("6px")
	await expect(getComputedStyle(row).columnGap).toBe("8px")
	await expect([
		getComputedStyle(title).fontSize,
		getComputedStyle(title).lineHeight,
		getComputedStyle(title).fontWeight,
	]).toEqual(["14px", "18px", "400"])
	await expect([
		getComputedStyle(meta).fontSize,
		getComputedStyle(meta).lineHeight,
		getComputedStyle(meta).fontVariantNumeric,
	]).toEqual(["11px", "16px", "tabular-nums"])
	await expect(colourOf(meta)).toBe(
		tokenStyleIn(row, "text-sidebar-muted-foreground", "color"),
	)
	await expect(boxOf(meta).width).toBe(META_LANE_WIDTH)
}

const expectRestingRow = async (row: HTMLElement) => {
	await expectRowLanes(row)
	await expect(colourOf(slotIn(row, "roster-row-name"))).toBe(
		tokenStyleIn(row, "text-muted-foreground", "color"),
	)
}

const COMPACT_DESCRIPTION =
	"Compact direction D of OPE-2209, two agents pinned above four conversations, the first carrying two missions."

const ROADMAP_ROW_SELECTOR =
	'[data-slot="space-carousel"] [data-slot="fold-section"]:last-child li:nth-child(2) [data-slot="sidebar-menu-button"]'

export const CompactRestExpanded = meta.story({
	name: "D Rest",
	args: compactArtboardOf(),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Check every agent, conversation and mission row is one 30px line padded 6 on all four sides, a mission 8 at its start, with a 6px radius and an 8px gap, rows of a group 1px apart and groups 24px apart. Check the 18px lead, the 14/18 regular title in muted foreground and the 64px meta lane in 11/16 tabular muted foreground sit in the same lanes on every row, that an agent row holds its 18px avatar, its name and its time with no pile, that a conversation with no colour strokes its subject icon 1.75 wide in muted foreground with no fill and no tile behind it, that the pile steps its 14px avatars by 9px, 6px before a time at least 22px wide, that each mission holds a 14px mark, its identifier in 13/18 medium and its title, with no lane and no meta, and that the person button rests, unmarked, with its outline gear.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const rows = rosterRowsIn(sidebarIn(canvasElement))
		await expect(namesOf(rows)).toEqual([
			ATLAS_LINE.name,
			NOVA_LINE.name,
			...COMPACT_CONVERSATIONS.map(({ name }) => name),
		])
		for (const row of rows) await expectRestingRow(row)

		const box = boxOf(sidebarIn(canvasElement))
		await expect(
			rows.map((row) => columnsOf(listRowPartsOf(row), box)),
		).toEqual(rows.map(() => ROW_COLUMNS))
		await expect(boxOf(rows[1]).top - boxOf(rows[0]).bottom).toBe(ROW_GAP)

		const [pinned, conversations] = slotsIn(canvasElement, "fold-section")
		await expect(boxOf(conversations).top - boxOf(pinned).bottom).toBe(
			BLOCK_GAP,
		)

		const releaseTrain = rowHolding(canvasElement, COMPACT_RELEASE_TRAIN.name)
		const icon = subjectIconOf(releaseTrain)
		const pictogram = slotIn(icon, "conversation-subject-icon-pictogram")
		await expect(icon.children).toHaveLength(1)
		await expect(boxOf(pictogram).width).toBe(COMPACT_LEAD_SIDE)
		await expect(getComputedStyle(pictogram).strokeWidth).toBe("1.75px")
		await expect(getComputedStyle(pictogram).fill).toBe("none")
		await expect(colourOf(icon)).toBe(
			tokenStyleIn(releaseTrain, "text-muted-foreground", "color"),
		)

		for (const agent of rows.slice(0, COMPACT_AGENTS.length))
			await expect(
				agent.querySelector('[data-slot="conversation-bot-pile"]'),
			).toBeNull()

		const pile = slotIn(releaseTrain, "conversation-bot-pile")
		const [first, second] = slotsIn(pile, "conversation-bot-pile-bot")
		const time = slotIn(releaseTrain, "roster-row-timestamp")
		await expect(boxOf(first).width).toBe(14)
		await expect(boxOf(second).left - boxOf(first).left).toBe(9)
		await expect(boxOf(time).left - boxOf(pile).right).toBe(6)
		await expect(boxOf(time).width).toBeGreaterThanOrEqual(22)

		const missions = slotsIn(canvasElement, "mission-capsule")
		await expect(missions).toHaveLength(2)
		for (const mission of missions) {
			const identifier = slotIn(mission, "mission-capsule-identifier")
			await expect(boxOf(mission).height).toBe(ROW_HEIGHT)
			await expect(paddingOf(mission)).toEqual(MISSION_PADDING)
			await expect([
				getComputedStyle(identifier).fontSize,
				getComputedStyle(identifier).lineHeight,
				getComputedStyle(identifier).fontWeight,
			]).toEqual(["13px", "18px", "500"])
			await expect(
				mission.querySelector('[data-slot="roster-row-meta"]'),
			).toBeNull()
		}
		await expect(
			getComputedStyle(
				slotIn(canvasElement, "mission-capsule-list"),
				"::before",
			).backgroundColor,
		).toBe(
			tokenStyleIn(releaseTrain, "bg-sidebar-tree-line", "backgroundColor"),
		)

		const person = slotIn(canvasElement, "expanded-sidebar-footer")
		await expect(person).not.toHaveAttribute("aria-current")
		await expect(fillOf(person)).toBe("rgba(0, 0, 0, 0)")
		await expect(isDrawnFilled(gearOf(person))).toBe(false)
	},
})

export const CompactHoverExpanded = meta.story({
	name: "D Hover",
	args: compactArtboardOf(),
	parameters: {
		pseudo: { hover: ROADMAP_ROW_SELECTOR },
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} The pointer rests on Q3 roadmap review. Check the row lights the sidebar hover fill at once, with no colour transition, its title and its icon going from muted foreground to the sidebar foreground, its meta keeping its resting colour, and every part keeping its column.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowHolding(canvasElement, COMPACT_ROADMAP.name)
		if (!isInBrowserRunner()) return
		const title = slotIn(row, "roster-row-name")
		const meta = slotIn(row, "roster-row-meta")
		const restingMeta = colourOf(meta)
		const pointer = await realPointer()
		await withMotionAllowed(async () => {
			try {
				await pointer.hover(row)
				await expect(row.matches(":hover")).toBe(true)
				await expect(fillOf(row)).toBe(hoverFillOf(row))
				await expect(colourTransitionsOf(row)).toEqual([])
				await expect([colourOf(title), colourOf(subjectIconOf(row))]).toEqual(
					Array(2).fill(tokenStyleIn(row, "text-sidebar-foreground", "color")),
				)
				await expect(colourOf(meta)).toBe(restingMeta)
				await expectRowLanes(row)
			} finally {
				await pointer.unhover(row)
			}
		})
	},
})

export const CompactSelectedExpanded = meta.story({
	name: "D Selected",
	args: compactArtboardOf({ selectedConversationId: COMPACT_ROADMAP.id }),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Q3 roadmap review is the open conversation. Check it alone reports itself as the current page, wears the sidebar selected fill and draws its title in foreground at regular weight, its meta unchanged. Check its subject icon is the filled drawing, in the sidebar foreground like its title, next to the three resting conversations that keep their outline icon.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowHolding(canvasElement, COMPACT_ROADMAP.name)
		const title = slotIn(row, "roster-row-name")
		await expect(
			rosterRowsIn(sidebarIn(canvasElement)).filter(
				(candidate) => candidate.getAttribute("aria-current") === "page",
			),
		).toEqual([row])
		await expect(fillOf(row)).toBe(selectedFillOf(row))
		await expect(colourOf(title)).toBe(
			tokenStyleIn(row, "text-foreground", "color"),
		)
		await expect(getComputedStyle(title).fontWeight).toBe("400")
		await expect(colourOf(slotIn(row, "roster-row-meta"))).toBe(
			tokenStyleIn(row, "text-sidebar-muted-foreground", "color"),
		)
		await expect(boxOf(row).height).toBe(ROW_HEIGHT)

		const conversations = COMPACT_CONVERSATIONS.map(({ name }) =>
			rowHolding(canvasElement, name),
		)
		await expect(
			conversations.map((candidate) => isDrawnFilled(pictogramOf(candidate))),
		).toEqual(conversations.map((candidate) => candidate === row))
		await expect(boxOf(pictogramOf(row)).width).toBe(COMPACT_LEAD_SIDE)
		await expect(colourOf(subjectIconOf(row))).toBe(
			tokenStyleIn(row, "text-sidebar-foreground", "color"),
		)
		await expect(colourTransitionsOf(row)).toEqual([])
	},
})

const OPEN_MISSION_ID = "OPE-418"

const RESTING_MISSION_ID = "OPE-412"

const missionRowOf = (canvasElement: HTMLElement, identifier: string) => {
	const row = slotsIn(canvasElement, "mission-capsule").find(
		(candidate) =>
			slotIn(candidate, "mission-capsule-identifier").textContent ===
			identifier,
	)
	if (!row) throw new Error(`No mission row carries ${identifier}`)
	return row
}

const expectMissionFillsSpanTheRow = async (canvasElement: HTMLElement) => {
	const short = missionRowOf(canvasElement, OPEN_MISSION_ID)
	const truncated = missionRowOf(canvasElement, RESTING_MISSION_ID)
	const tree = short.parentElement as HTMLElement
	const trunk = getComputedStyle(tree, "::before")
	const trunkEnd =
		boxOf(tree).left +
		Number.parseFloat(trunk.insetInlineStart) +
		Number.parseFloat(trunk.width)
	const conversation = conversationButtonOf(tree)
	for (const row of [short, truncated]) {
		const title = slotIn(row, "mission-capsule-title")
		const fill = boxOf(row)
		const mark = boxOf(slotIn(row, "mission-capsule-glyph"))
		await expect([
			mark.left - fill.left,
			mark.top - fill.top,
			fill.bottom - mark.bottom,
		]).toEqual(Array(3).fill(MISSION_MARK_GAP))
		await expect(boxOf(row).left - boxOf(tree).left).toBe(MISSION_INDENT)
		await expect(boxOf(row).left).toBeGreaterThan(trunkEnd)
		await expect(boxOf(row).right).toBe(boxOf(conversation).right)
		await expect(boxOf(title).height).toBe(18)
		await expect(boxOf(row).right - boxOf(title).right).toBeGreaterThanOrEqual(
			6,
		)
	}
	const shortTitle = slotIn(short, "mission-capsule-title")
	const truncatedTitle = slotIn(truncated, "mission-capsule-title")
	await expect(shortTitle.scrollWidth).toBe(shortTitle.clientWidth)
	await expect(truncatedTitle.scrollWidth).toBeGreaterThan(
		truncatedTitle.clientWidth,
	)
	await expect(getComputedStyle(truncatedTitle).textOverflow).toBe("ellipsis")
	await expect(boxOf(truncated).right - boxOf(truncatedTitle).right).toBe(6)
}

export const CompactSelectedMissionExpanded = meta.story({
	name: "D Selected mission",
	args: compactArtboardOf({
		selectedConversationId: COMPACT_RELEASE_TRAIN.id,
		openMissionId: OPEN_MISSION_ID,
	}),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Mission OPE-418 of Release train is on screen. Check its row alone reports itself as the current page among every row of the list, wears the sidebar selected fill with no colour transition and draws its title in foreground, its identifier and state mark unchanged, while Release train above it goes back to its resting look and outline icon. Its title is short and the title of OPE-412 above it is truncated. Check both fills leave 8px between their start edge and the state mark, as much as above and below it, and start to the right of the trunk and of the bare indent, and both end on the end edge of the Release train row above, the truncated title staying on one line with its ellipsis 6px inside the fill. Check the other mission takes a 2px ring inside its own box from the keyboard, and that pressing it asks for that mission.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const open = missionRowOf(canvasElement, OPEN_MISSION_ID)
		const resting = missionRowOf(canvasElement, RESTING_MISSION_ID)
		const parent = rowHolding(canvasElement, COMPACT_RELEASE_TRAIN.name)
		const accent = selectedFillOf(open)
		const muted = tokenStyleIn(open, "text-sidebar-muted-foreground", "color")
		const titleOf = (row: HTMLElement) => slotIn(row, "mission-capsule-title")

		await expect(currentControlsIn(sidebarIn(canvasElement))).toEqual([open])
		await expect(open).toHaveAttribute("aria-current", "page")
		await expect(fillOf(open)).toBe(accent)
		await expect(colourOf(titleOf(open))).toBe(
			tokenStyleIn(open, "text-foreground", "color"),
		)
		await expect(colourOf(slotIn(open, "mission-capsule-identifier"))).toBe(
			muted,
		)
		await expect(boxOf(open).height).toBe(ROW_HEIGHT)
		await expect(colourTransitionsOf(open)).toEqual([])
		await expectMissionFillsSpanTheRow(canvasElement)

		await expect(fillOf(resting)).toBe("rgba(0, 0, 0, 0)")
		await expect(colourOf(titleOf(resting))).toBe(muted)
		await expect(fillOf(parent)).not.toBe(accent)
		await expect(isDrawnFilled(pictogramOf(parent))).toBe(false)

		await userEvent.click(resting)
		await expect(OPEN_MISSION).toHaveBeenCalledOnce()
		await expect(OPEN_MISSION).toHaveBeenCalledWith(RESTING_MISSION_ID)
		await userEvent.keyboard("{Shift>}{Tab}{/Shift}{Tab}")
		await expect(resting).toHaveFocus()
		await expect(resting.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(resting).boxShadow).toContain("inset")
	},
})

export const CompactHoveredMissionExpanded = meta.story({
	name: "D Hovered mission",
	args: compactArtboardOf(),
	parameters: {
		pseudo: {
			hover: '[data-slot="mission-capsule"][data-state="waiting"]',
		},
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} The pointer rests on mission OPE-418, whose title is short, then on OPE-412, whose title is truncated. Check each row lights the sidebar hover fill at once, with no colour transition, its title, identifier and state mark keeping their resting colours. Check both fills leave 8px between their start edge and the state mark, as much as above and below it, and start to the right of the trunk and of the bare indent, and both end on the end edge of the Release train row above, the truncated title staying on one line with its ellipsis 6px inside the fill. Check the pointer lights the short mission from the far end of its fill, that the mission is what lies under that point and that pressing it asks for that mission, and that no row reports itself as the current page.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const short = missionRowOf(canvasElement, OPEN_MISSION_ID)
		const truncated = missionRowOf(canvasElement, RESTING_MISSION_ID)
		await expect(currentControlsIn(sidebarIn(canvasElement))).toEqual([])
		await expectMissionFillsSpanTheRow(canvasElement)
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		for (const row of [short, truncated]) {
			const title = slotIn(row, "mission-capsule-title")
			const identifier = slotIn(row, "mission-capsule-identifier")
			const resting = [colourOf(title), colourOf(identifier)]
			await expect(colourTransitionsOf(row)).toEqual([])
			try {
				await pointer.hover(row)
				await expect(row.matches(":hover")).toBe(true)
				await expect(fillOf(row)).toBe(hoverFillOf(row))
				await expect([colourOf(title), colourOf(identifier)]).toEqual(resting)
				await expectMissionFillsSpanTheRow(canvasElement)
			} finally {
				await pointer.unhover(row)
			}
		}

		const farEnd = {
			position: { x: boxOf(short).width - 8, y: boxOf(short).height / 2 },
		}
		try {
			await pointer.hover(short, farEnd)
			await expect(short.matches(":hover")).toBe(true)
			await expect(fillOf(short)).toBe(hoverFillOf(short))
			const farPoint = [
				boxOf(short).right - 8,
				boxOf(short).top + boxOf(short).height / 2,
			] as const
			await expect(document.elementFromPoint(...farPoint)).toBe(short)
			await userEvent.click(short)
			await expect(OPEN_MISSION).toHaveBeenCalledOnce()
			await expect(OPEN_MISSION).toHaveBeenCalledWith(OPEN_MISSION_ID)
		} finally {
			await pointer.unhover(short)
		}
	},
})

export const CompactSelectedPersonExpanded = meta.story({
	name: "D Selected person",
	args: { ...compactArtboardOf(), isSettingsShown: true },
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} The person's settings are on screen. Check the person button alone reports itself as the current page among every button of the sidebar, wears the sidebar selected fill with no colour transition, draws the name in foreground and the filled gear, and keeps the avatar at the size of the Space logo, its initials disc taking the panel surface so it still reads on the fill.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = sidebarIn(canvasElement)
		const person = slotIn(sidebar, "expanded-sidebar-footer")
		await expect(currentControlsIn(sidebar)).toEqual([person])
		await expect(person).toHaveAttribute("aria-current", "page")
		await expect(fillOf(person)).toBe(selectedFillOf(person))
		await expect(colourOf(person.children[1])).toBe(
			tokenStyleIn(person, "text-foreground", "color"),
		)
		await expect(isDrawnFilled(gearOf(person))).toBe(true)
		await expect(boxOf(gearOf(person)).width).toBe(COMPACT_LEAD_SIDE)
		await expect(
			fillOf(
				slotIn(person, "expanded-sidebar-avatar").querySelector(
					"span[aria-hidden]",
				) as Element,
			),
		).toBe(tokenStyleIn(person, "bg-background", "backgroundColor"))
		await expect(colourTransitionsOf(person)).toEqual([])
		await expectAvatarFollowsSpaceLogo(sidebar)
	},
})

export const CompactSelectedDestinationExpanded = meta.story({
	name: "D Selected destination",
	args: compactArtboardOf({ destination: "missions" }),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} The Missions page is on screen. Check Missions alone reports itself as the current page, wears the sidebar selected fill and draws the filled flag at the size and colour of the outline one, while New and Library keep their outline glyph.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = within(sidebarIn(canvasElement))
		const destinations = ["New", /^Missions/, "Library"].map((name) =>
			sidebar.getByRole("button", { name }),
		)
		const [resting, missions] = destinations
		const glyphOf = (row: HTMLElement) => row.querySelector("svg") as Element
		await expect(
			destinations.map((row) => row.getAttribute("aria-current")),
		).toEqual([null, "page", null])
		await expect(
			destinations.map((row) => isDrawnFilled(glyphOf(row))),
		).toEqual([false, true, false])
		await expect(fillOf(missions)).toBe(selectedFillOf(missions))
		await expect(boxOf(glyphOf(missions)).width).toBe(COMPACT_LEAD_SIDE)
		await expect(colourOf(glyphOf(missions))).toBe(colourOf(glyphOf(resting)))
		await expect(colourTransitionsOf(missions)).toEqual([])
	},
})

export const CompactFocusExpanded = meta.story({
	name: "D Focus",
	args: compactArtboardOf(),
	parameters: {
		pseudo: { focusVisible: ROADMAP_ROW_SELECTOR },
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} The keyboard reaches Q3 roadmap review. Check the row draws a 2px ring in the sidebar ring colour inside its own box, where no fold can clip it.`,
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const row = rowHolding(canvasElement, COMPACT_ROADMAP.name)
		const resting = getComputedStyle(
			rowHolding(canvasElement, COMPACT_OFFSITE.name),
		).boxShadow
		const stops = within(sidebarIn(canvasElement)).getAllByRole("button")
		slotIn(canvasElement, "space-switcher").focus()
		for (const _stop of stops) {
			if (document.activeElement === row) break
			await userEvent.tab()
		}
		await expect(row).toHaveFocus()
		await expect(row.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(row).boxShadow).toContain("inset")
		await expect(getComputedStyle(row).boxShadow).not.toBe(resting)
	},
})

const BLOCK_SECTIONS = [
	sectionOf(
		"clients",
		"Clients",
		rosterMenuOf([conversationEntry(COMPACT_OFFSITE)], true, STILL_ROWS),
	),
]

const edgeWidthsOf = (element: Element) => {
	const style = getComputedStyle(element)
	return [style.borderTopWidth, style.borderBottomWidth]
}

export const CompactPanelPaddingAndBlockGapExpanded = meta.story({
	name: "D Panel padding and block gap",
	args: {
		...compactArtboardOf({
			conversations: [
				COMPACT_RELEASE_TRAIN,
				COMPACT_ROADMAP,
				COMPACT_ONBOARDING,
			],
			selectedConversationId: COMPACT_ROADMAP.id,
		}),
		sections: BLOCK_SECTIONS,
		spaces: [STUDIO, ...SEVERAL_SPACES],
		update: <UpdateRow onDownload={DOWNLOAD} status="available" />,
	},
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} A named section, Clients, sits between Pinned and Conversations, Q3 roadmap review is open, the person belongs to several Spaces and an update is available. Check the panel pads 12px on all four sides, that the Space header, the menu, Pinned, Clients, Conversations and the footer are each 24px from the next with no line drawn between them, and that rows inside a block stay 1px apart. Check the space dots, the update row and the person button form the footer as one block, 1px apart like rows, and that the selected row stops 12px short of both panel edges.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = sidebarIn(canvasElement)
		const carousel = slotIn(sidebar, "space-carousel")
		const [pinned, clients, conversations] = slotsIn(sidebar, "fold-section")
		const menu = navigationMenuIn(sidebar)
		const footer = slotIn(sidebar, "expanded-sidebar-footer")
		await expect(paddingOf(sidebar)).toEqual(
			Array(4).fill(`${PANEL_PADDING}px`),
		)

		const blocks = [
			slotIn(sidebar, "expanded-sidebar-switcher-row"),
			menu,
			pinned,
			clients,
			conversations,
		]
		await expect(
			blocks
				.slice(1)
				.map((block, rank) => boxOf(block).top - boxOf(blocks[rank]).bottom),
		).toEqual(blocks.slice(1).map(() => BLOCK_GAP))
		const footerBlock = slotIn(sidebar, "expanded-sidebar-footer-block")
		const footerParts = Array.from(footerBlock.children)
		await expect(
			footerParts.map((part) => part.getAttribute("data-slot")),
		).toEqual(["space-dots", "update-row", "expanded-sidebar-footer"])
		await expect(boxOf(footerBlock).top - boxOf(carousel).bottom).toBe(
			BLOCK_GAP,
		)
		await expect(
			footerParts
				.slice(1)
				.map((part, rank) => boxOf(part).top - boxOf(footerParts[rank]).bottom),
		).toEqual([ROW_GAP, ROW_GAP])
		await expect(boxOf(sidebar).bottom - boxOf(footer).bottom).toBe(
			PANEL_PADDING,
		)

		await expect(
			sidebar.querySelector('hr, [role="separator"], [data-slot*="separator"]'),
		).toBeNull()
		await expect([...blocks, carousel, footer].map(edgeWidthsOf)).toEqual(
			[...blocks, carousel, footer].map(() => ["0px", "0px"]),
		)

		const [first, second] = slotsIn(pinned, "sidebar-menu-button")
		await expect(boxOf(second).top - boxOf(first).bottom).toBe(ROW_GAP)

		const selected = rowHolding(canvasElement, COMPACT_ROADMAP.name)
		await expect(selected).toHaveAttribute("aria-current", "page")
		await expect(fillOf(selected)).toBe(selectedFillOf(selected))
		await expect([
			boxOf(selected).left - boxOf(sidebar).left,
			boxOf(sidebar).right - boxOf(selected).right,
		]).toEqual([PANEL_PADDING, PANEL_PADDING])
	},
})

const SCROLLING_CONVERSATIONS = Array.from({ length: 40 }, (_, rank) =>
	compactRow(`Thread ${rank + 1}`, "1h", 40 - rank),
)

export const CompactScrolledExpanded = meta.story({
	name: "D Scrolled",
	args: compactArtboardOf({ conversations: SCROLLING_CONVERSATIONS }),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Forty conversations overflow the list, which is then scrolled down. Check the destinations menu leaves the view with Pinned and Conversations, 24px above Pinned as before the scroll, while the Space header and the footer block stay where they were, fully in view.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const sidebar = sidebarIn(canvasElement)
		const list = slotIn(sidebar, "sidebar-content")
		const menu = navigationMenuIn(sidebar)
		const [pinned] = slotsIn(sidebar, "fold-section")
		const fixed = [
			slotIn(sidebar, "expanded-sidebar-switcher-row"),
			slotIn(sidebar, "expanded-sidebar-footer-block"),
		]
		const topsOf = (blocks: Element[]) =>
			blocks.map((block) => boxOf(block).top)
		const resting = topsOf(fixed)
		await expect(boxOf(menu).top).toBe(boxOf(list).top)
		await expect(boxOf(pinned).top - boxOf(menu).bottom).toBe(BLOCK_GAP)
		await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)

		list.scrollTop = boxOf(pinned).bottom - boxOf(list).top
		await new Promise(requestAnimationFrame)

		await expect(list.scrollTop).toBeGreaterThan(0)
		await expect(boxOf(menu).bottom).toBeLessThan(boxOf(list).top)
		await expect(boxOf(pinned).bottom).toBeLessThanOrEqual(boxOf(list).top)
		await expect(boxOf(pinned).top - boxOf(menu).bottom).toBe(BLOCK_GAP)
		await expect(topsOf(fixed)).toEqual(resting)
		await expect(boxOf(fixed[0]).bottom).toBeLessThanOrEqual(boxOf(list).top)
		await expect(boxOf(fixed[1]).top).toBeGreaterThanOrEqual(boxOf(list).bottom)
		for (const block of fixed) await expect(block).toBeVisible()
	},
})

const WORKING_ROWS = {
	agents: [{ ...ATLAS_LINE, participants: [WORKING_ATLAS] }, NOVA_LINE],
	conversations: [
		COMPACT_RELEASE_TRAIN,
		{ ...COMPACT_ROADMAP, participants: [WORKING_ATLAS] },
		COMPACT_ONBOARDING,
		COMPACT_OFFSITE,
	],
}

export const CompactWorkingExpanded = meta.story({
	name: "D Working",
	args: compactArtboardOf(WORKING_ROWS),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Atlas and Q3 roadmap review are working. Check a highlight band crosses their title alone, plain foreground over muted foreground, as wide and as fast on the short title as on the long one, linear, without end, their icon and meta unchanged and the state also said in words to assistive technology. Under reduced motion, check the highlight stays painted, held still over the start of the title, where a title cut by its row still shows it.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const working = [ATLAS_LINE.name, COMPACT_ROADMAP.name].map((name) =>
			rowHolding(canvasElement, name),
		)
		await expect(slotsIn(canvasElement, "shimmer-text")).toHaveLength(
			working.length,
		)
		for (const row of working) {
			const title = slotIn(row, "roster-row-name")
			const shimmer = slotIn(title, "shimmer-text")
			await expect(title).toHaveTextContent(/working$/)
			await expect(colourOf(slotIn(row, "roster-row-meta"))).toBe(
				tokenStyleIn(row, "text-sidebar-muted-foreground", "color"),
			)
			await expect(boxOf(row).height).toBe(ROW_HEIGHT)

			const held = getComputedStyle(shimmer)
			await expect(held.animationName).toBe("none")
			await expect(held.backgroundImage).toContain("linear-gradient(90deg")
			await expect(Number.parseFloat(held.backgroundPositionX)).toBeCloseTo(
				-0.4 * Number.parseFloat(held.backgroundSize),
			)

			if (!isInBrowserRunner()) continue
			await withMotionAllowed(async () => {
				const moving = getComputedStyle(shimmer)
				await expect(moving.animationName).toBe("ui-shimmer-text")
				await expect(moving.animationIterationCount).toBe("infinite")
			})
		}
	},
})

const WAITING_OFFSITE: AppSidebarConversation = {
	...COMPACT_OFFSITE,
	pendingQuestion: PENDING_QUESTION,
}

const NEEDS_YOU_ROWS = {
	agents: [ATLAS_LINE, { ...NOVA_LINE, pendingQuestion: PENDING_QUESTION }],
	conversations: [
		COMPACT_RELEASE_TRAIN,
		COMPACT_ROADMAP,
		COMPACT_ONBOARDING,
		WAITING_OFFSITE,
	],
}

const ATTENTION: AppSidebarConversation["badge"] = "attention"

const NEEDS_YOU_WITHOUT_QUESTION_ROWS = {
	agents: [ATLAS_LINE, { ...NOVA_LINE, badge: ATTENTION }],
	conversations: [
		COMPACT_RELEASE_TRAIN,
		COMPACT_ROADMAP,
		COMPACT_ONBOARDING,
		{ ...COMPACT_OFFSITE, badge: ATTENTION },
	],
}

const NEEDS_YOU_NAMES = [NOVA_LINE.name, COMPACT_OFFSITE.name]

const MEASURED_NEEDS_YOU = "rgb(242, 165, 58)"

const AA_TEXT_CONTRAST = 4.5

const srgbOf = (colour: string) => {
	const context = document.createElement("canvas").getContext("2d")
	if (!context) throw new Error("No canvas to resolve a colour on")
	context.fillStyle = colour
	context.fillRect(0, 0, 1, 1)
	return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
}

const luminanceOf = (colour: string) => {
	const [red, green, blue] = srgbOf(colour).map((channel) => {
		const share = channel / 255
		return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastOf = (one: string, other: string) => {
	const [lighter, darker] = [luminanceOf(one), luminanceOf(other)].sort(
		(first, second) => second - first,
	)
	return (lighter + 0.05) / (darker + 0.05)
}

const expectNeedsYouState = async ({ canvasElement }: StoryCanvas) => {
	const conversations = slotsIn(canvasElement, "fold-section")[1]
	await expect(namesOf(slotsIn(conversations, "sidebar-menu-button"))).toEqual([
		COMPACT_OFFSITE.name,
		COMPACT_RELEASE_TRAIN.name,
		COMPACT_ROADMAP.name,
		COMPACT_ONBOARDING.name,
	])
	await expect(slotsIn(canvasElement, "needs-you-label")).toHaveLength(
		NEEDS_YOU_NAMES.length,
	)

	for (const name of NEEDS_YOU_NAMES) {
		const row = rowHolding(canvasElement, name)
		const title = slotIn(row, "roster-row-name")
		const needsYou = slotIn(row, "roster-row-needs-you")
		const glyph = slotIn(needsYou, "needs-you-glyph")
		const label = slotIn(needsYou, "needs-you-label")
		const orange = tokenStyleIn(row, "text-needs-you", "color")
		await expect(label).toHaveTextContent("Needs you")
		await expect(row).toHaveAccessibleName(`${name} Needs you`)
		await expect(boxOf(row).height).toBe(ROW_HEIGHT)
		await expect(getComputedStyle(title).fontWeight).toBe("500")
		await expect(colourOf(title)).toBe(
			tokenStyleIn(row, "text-foreground", "color"),
		)
		await expect(
			row.querySelector(
				'[data-slot="roster-row-timestamp"], [data-slot="conversation-bot-pile"]',
			),
		).toBeNull()
		await expect([boxOf(glyph).width, boxOf(glyph).height]).toEqual([12, 12])
		await expect(fillOf(glyph)).toBe(orange)
		await expect(getComputedStyle(glyph, "::before").content).toBe('"?"')
		await expect(boxOf(label).left - boxOf(glyph).right).toBe(4)
		await expect([
			colourOf(label),
			getComputedStyle(label).fontSize,
			getComputedStyle(label).lineHeight,
			getComputedStyle(label).fontWeight,
		]).toEqual([orange, "11px", "16px", "600"])
		await expect(getComputedStyle(needsYou).paddingInlineStart).toBe("4px")
	}
}

const expectMeasuredOrange = async ({ canvasElement }: StoryCanvas) => {
	for (const name of NEEDS_YOU_NAMES) {
		const row = rowHolding(canvasElement, name)
		await expect([
			colourOf(slotIn(row, "needs-you-label")),
			fillOf(slotIn(row, "needs-you-glyph")),
		]).toEqual([MEASURED_NEEDS_YOU, MEASURED_NEEDS_YOU])
	}
}

const NEEDS_YOU_CHECKS =
	"Check Lisbon offsite plan, the oldest conversation, now leads Conversations, and that both rows draw their title in medium foreground and swap pile and time for a 12px disc holding a question mark, 4px before Needs you in 11/16 semibold, the label part of the row's accessible name and the row still 30px tall."

export const CompactNeedsYouExpanded = meta.story({
	name: "D Needs you",
	args: compactArtboardOf(NEEDS_YOU_ROWS),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Nova and Lisbon offsite plan each wait on an answer. ${NEEDS_YOU_CHECKS} Check the label and the disc wear the orange measured on the artboard, #F2A53A.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectNeedsYouState({ canvasElement })
		await expectMeasuredOrange({ canvasElement })
	},
})

export const CompactNeedsYouWithoutQuestionExpanded = meta.story({
	name: "D Needs you without a question",
	args: compactArtboardOf(NEEDS_YOU_WITHOUT_QUESTION_ROWS),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Nova and Lisbon offsite plan carry the attention badge and no question text, what a host waiting on the person reports when its prompt is empty. ${NEEDS_YOU_CHECKS} Nothing tells these rows from the ones of D Needs you.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectNeedsYouState({ canvasElement })
		await expectMeasuredOrange({ canvasElement })
	},
})

export const CompactNeedsYouLightExpanded = meta.story({
	name: "D Needs you Light",
	globals: LIGHT,
	args: compactArtboardOf(NEEDS_YOU_ROWS),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Nova and Lisbon offsite plan each wait on an answer, in the light theme. ${NEEDS_YOU_CHECKS} Check the label reads at 4.5:1 or more against the sidebar surface, the hover fill and the selected fill, and the question mark as much against its disc.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectNeedsYouState({ canvasElement })
		for (const name of NEEDS_YOU_NAMES) {
			const row = rowHolding(canvasElement, name)
			const label = colourOf(slotIn(row, "needs-you-label"))
			const glyph = slotIn(row, "needs-you-glyph")
			for (const surface of [
				"bg-background",
				"bg-sidebar-hover",
				"bg-sidebar-selected",
			])
				await expect(
					contrastOf(label, tokenStyleIn(row, surface, "backgroundColor")),
				).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
			await expect(
				contrastOf(colourOf(glyph), fillOf(glyph)),
			).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST)
		}
	},
})

const COLOURED_ROWS = {
	conversations: [
		{ ...COMPACT_RELEASE_TRAIN, color: BLOT_HUES.blue },
		{ ...COMPACT_ROADMAP, color: BLOT_HUES.pink },
		{ ...COMPACT_ONBOARDING, color: BLOT_HUES.green },
		COMPACT_OFFSITE,
	],
}

export const CompactColouredIconsExpanded = meta.story({
	name: "D Coloured icons",
	args: compactArtboardOf(COLOURED_ROWS),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Three conversations carry a colour, the last one none. Check each coloured subject icon strokes its pictogram in its own hue with no tile behind it, three hues apart from one another, and that Lisbon offsite plan keeps muted foreground.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const iconOf = (name: string) =>
			subjectIconOf(rowHolding(canvasElement, name))
		const coloured = COLOURED_ROWS.conversations.slice(0, 3)
		const muted = tokenStyleIn(
			rowHolding(canvasElement, COMPACT_OFFSITE.name),
			"text-muted-foreground",
			"color",
		)
		const strokes = coloured.map(({ name }) => colourOf(iconOf(name)))
		await expect(new Set([...strokes, muted]).size).toBe(4)
		await expect(colourOf(iconOf(COMPACT_OFFSITE.name))).toBe(muted)
		for (const { name, color } of coloured) {
			const icon = iconOf(name)
			await expect(icon.dataset.hue).toBe(String(color))
			await expect(icon.children).toHaveLength(1)
			await expect(fillOf(icon)).toBe("rgba(0, 0, 0, 0)")
			await expect(boxOf(icon).width).toBe(COMPACT_LEAD_SIDE)
		}
	},
})

export const CompactSelectedColouredIconExpanded = meta.story({
	name: "D Selected coloured icon",
	args: compactArtboardOf({
		...COLOURED_ROWS,
		selectedConversationId: COMPACT_ROADMAP.id,
	}),
	parameters: {
		docs: {
			description: {
				story: `${COMPACT_DESCRIPTION} Three conversations carry a colour and Q3 roadmap review, the pink one, is open. Check its subject icon is the filled drawing painted in its own hue, with no tile behind it, while the two other coloured conversations keep their outline icon in theirs.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [blue, pink, green] = COLOURED_ROWS.conversations.map(({ name }) =>
			rowHolding(canvasElement, name),
		)
		const muted = tokenStyleIn(pink, "text-muted-foreground", "color")
		await expect(pink).toHaveAttribute("aria-current", "page")
		await expect(
			[blue, pink, green].map((row) => isDrawnFilled(pictogramOf(row))),
		).toEqual([false, true, false])
		await expect(subjectIconOf(pink).dataset.hue).toBe(String(BLOT_HUES.pink))
		await expect(
			new Set([
				...[blue, pink, green].map((row) => colourOf(subjectIconOf(row))),
				muted,
			]).size,
		).toBe(4)
		for (const shape of filledShapesOf(pictogramOf(pink)))
			await expect(getComputedStyle(shape).fill).toBe(
				colourOf(subjectIconOf(pink)),
			)
		await expect(subjectIconOf(pink).children).toHaveLength(1)
		await expect(fillOf(subjectIconOf(pink))).toBe("rgba(0, 0, 0, 0)")
	},
})
