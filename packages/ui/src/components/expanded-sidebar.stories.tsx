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
	PINNED_CONVERSATIONS,
	RECENT_CONVERSATIONS,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import {
	ConversationRosterRow,
	ROW_ICON_SIDE,
} from "@workspace/ui/components/app-sidebar-conversation-row"
import type {
	AppSidebarRowMission,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar-model"
import {
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
import {
	CollapsedSidebar,
	type CollapsedSidebarZone,
} from "@workspace/ui/components/collapsed-sidebar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	ExpandedSidebar,
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
					"The expanded sidebar of the navigation shell, top to bottom: Space switcher, the destinations menu, Pinned and Conversations, then the space dots, the update row and the person footer when they apply. A two finger horizontal swipe over the list changes Space. One story per Paper page A artboard; the row list is the current conversation rows, restyled in OPE-2148.",
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

export const ExpandedNewConversation = meta.story({
	name: "1 Expanded New conversation",
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1: one space, no pending update, New conversation open. Check the blocks run switcher, menu, Pinned, Conversations, footer with nothing between the list and the footer, that New conversation alone wears the selected fill and reports itself as the current page, that a section header folds its rows and says so, and that the title bar and footer buttons carry a name and a focus ring, the footer being one button with no button nested in it and its gear hidden from assistive technology. Check the New conversation row draws the same Add glyph as the New tab button, the switcher sits alone in its row reaching its right edge, and both avatars and the navigation icons share one vertical line 30px from the sidebar edge, each avatar 8px from its row's start edge and from its top. Check both section headers are 32px tall with their label 8px in, the first row starts 34px under the top of the list and Conversations sits 12px under the last pinned row, the numbers the loading skeleton holds in `L1LoadingExpanded`. With a single Space, check the carousel refuses a sideways scroll and no selection is reported. Pick `ExpandedMissions` for the other destination.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await expectSpaceCarouselHeld(sidebarIn(canvasElement))
		await expect(args.onSelectSpace).not.toHaveBeenCalled()

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
			"space-carousel",
			"expanded-sidebar-footer",
		])
		await expect(
			canvasElement.querySelector('[data-slot="update-row"]'),
		).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="space-dots"]'),
		).toBeNull()

		await expect(
			listRhythmOf({
				content: slotIn(canvasElement, "sidebar-content"),
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
		await expect(drawingOf("New conversation")).toBe(drawingOf("New tab"))

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
		await expect(boxOf(gear).top - boxOf(footer).top).toBe(8)
		await expect(
			[switcher, footer].map((avatarRow) => boxOf(avatarRow).height),
		).toEqual([AVATAR_ROW_HEIGHT, AVATAR_ROW_HEIGHT])
		const centreOf = (inner: DOMRect) => inner.left + inner.width / 2 - box.left
		const navigationIcon = canvas
			.getByRole("button", { name: "Library" })
			.querySelector("svg") as Element
		await expect(centreOf(boxOf(navigationIcon))).toBe(ROW_X_OFFSETS.iconCentre)
		await expect(centreOf(switcherAvatar)).toBe(ROW_X_OFFSETS.iconCentre)
		await expect(centreOf(footerAvatar)).toBe(ROW_X_OFFSETS.iconCentre)

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

const ROW_PADDING = Array(4).fill("8px")

const AVATAR_ROW_HEIGHT = 44

const TOP_MENU_HEIGHT = 36

const SECTION_HEADER_HEIGHT = 32

const LIST_ROW_HEIGHT = 52

const TOP_MENU_GLYPH = 14

const ROW_X_OFFSETS = { iconCentre: 30, labelStart: 54 }

const LIST_RHYTHM = {
	headerHeights: [SECTION_HEADER_HEIGHT, SECTION_HEADER_HEIGHT],
	headerInsets: [8, 8],
	firstRowTop: 34,
	sectionGap: 12,
}

type ListRhythmParts = {
	content: Element
	headers: Element[]
	firstSectionRows: Element[]
}

const listRhythmOf = ({
	content,
	headers,
	firstSectionRows,
}: ListRhythmParts) => ({
	headerHeights: headers.map((header) => boxOf(header).height),
	headerInsets: headers.map(
		(header) =>
			boxOf(header.firstElementChild as Element).left - boxOf(header).left,
	),
	firstRowTop: boxOf(firstSectionRows[0]).top - boxOf(content).top,
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

const expectTreeArtboard = async ({ canvasElement }: StoryCanvas) => {
	const sidebar = sidebarIn(canvasElement)
	const controls = within(sidebar).getAllByRole("button")
	for (const control of controls)
		await expect(colourTransitionsOf(control)).toEqual([])

	const rows = [
		slotIn(sidebar, "space-switcher"),
		...slotsIn(sidebar, "sidebar-menu-button"),
		...slotsIn(sidebar, "fold-section-trigger"),
		slotIn(sidebar, "expanded-sidebar-footer"),
	]
	for (const row of rows) await expect(paddingOf(row)).toEqual(ROW_PADDING)

	for (const name of ["New conversation", /^Missions/, "Library"]) {
		const item = within(sidebar).getByRole("button", { name })
		const slot = item.querySelector("span[aria-hidden]") as HTMLElement
		await expect(boxOf(item).height).toBe(TOP_MENU_HEIGHT)
		await expect(boxOf(slot).width).toBe(ROW_ICON_SIDE)
		await expect(getComputedStyle(slot).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(boxOf(slot.querySelector("svg") as SVGElement).width).toBe(
			TOP_MENU_GLYPH,
		)
	}

	const avatars = [
		sidebar.querySelector('[data-slot="space-switcher"] [data-slot]'),
		...slotsIn(slotIn(sidebar, "space-carousel"), "sidebar-menu-button").map(
			(row) => row.querySelector(":scope > span:first-child > *"),
		),
		slotIn(sidebar, "expanded-sidebar-avatar"),
	]
	await expect(
		avatars.map((avatar) => [
			avatar?.getAttribute("data-slot"),
			boxOf(avatar as Element).width,
		]),
	).toEqual(
		avatars.map((avatar) => [avatar?.getAttribute("data-slot"), ROW_ICON_SIDE]),
	)

	for (const tree of slotsIn(sidebar, "mission-capsule-list")) {
		const head = conversationButtonOf(tree)
		const trunk = getComputedStyle(tree, "::before")
		await expect(boxOf(tree).top).toBe(boxOf(head).bottom)
		await expect([trunk.insetInlineStart, trunk.width, trunk.bottom]).toEqual([
			"21px",
			"1.5px",
			"16px",
		])
		await expect(getComputedStyle(tree).pointerEvents).toBe("none")
		const title = slotIn(head, "roster-row-name")
		for (const row of slotsIn(tree, "mission-capsule")) {
			const branch = row.firstElementChild as HTMLElement
			const glyph = slotIn(row, "mission-capsule-glyph")
			await expect(boxOf(row).height).toBe(32)
			await expect(boxOf(branch).left - boxOf(tree).left).toBe(22)
			await expect(boxOf(branch).width).toBe(16)
			await expect(centreOfBox(branch)[1]).toBe(centreOfBox(row)[1])
			await expect(boxOf(glyph).width).toBe(14)
			await expect(boxOf(glyph).left).toBe(boxOf(title).left)
			await expect(row.tabIndex).toBe(-1)
			await expect(row.querySelector(".sr-only")).not.toBeEmptyDOMElement()
			await expect(document.elementFromPoint(...centreOfBox(row))).toBe(head)
		}
	}
}

const TREE_DESCRIPTION =
	"Paper artboard Missions 1 Tree Corrected: four conversations, two of them carrying missions drawn as a tree under their row, and one agent row. Check each mission hangs off a trunk from the avatar centre with a branch to its state mark, that the mark sits on the title column, that the destinations show their glyph alone, and that every row pads 8 on all four sides."

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
					"A conversation title and a mission title longer than the column. Check both stay on one line and end in an ellipsis, the timestamp and the row height untouched.",
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
		await expect(boxOf(name).height).toBe(20)
		await expect(boxOf(title).height).toBe(16)
		await expect(boxOf(slotIn(canvasElement, "mission-capsule")).height).toBe(
			32,
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
		await expect(switcher.getBoundingClientRect().height).toBe(
			AVATAR_ROW_HEIGHT,
		)
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
					"A swipe carried four tenths of a panel towards the next Space, short of the crossing, with the list of every Space handed in. Check the next Space's list is drawn in the incoming panel and already under the fingers, and that no Space is selected yet.",
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
					"The list is loading. Check the skeleton replaces every section, runs flat with its second header bar after two rows, and reaches the bottom of the list area. Check both header bars sit in a 32px header 8px in, the first row starts 34px under the top of the list and the second header 12px under the second row, where the loaded list of `ExpandedNewConversation` puts them, so nothing moves when the list arrives.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(sectionHeadersIn(canvasElement)).toEqual([])
		await expect(
			listRhythmOf({
				content: slotIn(canvasElement, "sidebar-content"),
				headers: slotsIn(canvasElement, "sidebar-list-skeleton-header"),
				firstSectionRows: slotsIn(
					canvasElement,
					"sidebar-list-skeleton-row",
				).slice(0, 2),
			}),
		).toEqual(LIST_RHYTHM)
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
		await expect(paddingOf(clients)).toEqual(ROW_PADDING)
		await expect(boxOf(clients).height).toBe(SECTION_HEADER_HEIGHT)
		await expect(style.borderTopLeftRadius).toBe("10px")
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
		await expect(paddingOf(field)).toEqual(ROW_PADDING)
		await expect(boxOf(field).height).toBe(SECTION_HEADER_HEIGHT)
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
	await expect(boxOf(item).height).toBe(TOP_MENU_HEIGHT)
	await expect(boxOf(glyph).width).toBe(TOP_MENU_GLYPH)
	await expect(paddingOf(item)).toEqual(ROW_PADDING)
	const conversation = slotsIn(
		slotIn(sidebar, "space-carousel"),
		"sidebar-menu-button",
	)[0] as HTMLElement
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
					"The destinations menu at rest. Check each button is 36px tall with a 14px glyph and pads 8 on all four sides, and that its icon centre and label start sit 30px and 54px from the sidebar edge, the same as a conversation row's.",
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
				'[data-slot="expanded-sidebar"] > [data-slot="sidebar-menu"] > li:last-child [data-slot="sidebar-menu-button"]',
		},
		docs: {
			description: {
				story:
					"The pointer rests on Library in the destinations menu. Check it lights `--rail-item-selected` at half strength without moving its glyph or its label.",
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
					tokenStyleIn(item, "bg-rail-item-selected/50", "backgroundColor"),
				)
				await expect(colourTransitionsOf(item)).toEqual([])
				await expectTopMenuAlignedOnConversations(canvasElement)
			} finally {
				await pointer.unhover(item)
			}
		})
	},
})

const ROW_COLUMNS = { ...ROW_X_OFFSETS, trailingEnd: 16 }

const HEADER_COLUMNS = { labelStart: 16, trailingEnd: 16 }

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
	trailing: slotIn(row, "roster-row-timestamp"),
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
	const listRows = slotsIn(
		slotIn(sidebar, "space-carousel"),
		"sidebar-menu-button",
	)
	const footer = slotIn(sidebar, "expanded-sidebar-footer")
	await expect(
		listRows.map((row) => slotIn(row, "roster-row-name").textContent),
	).toEqual([RELEASE_TRAIN.name, ROADMAP_REVIEW.name, ATLAS.name])
	await expect(slotsIn(sidebar, "mission-capsule-list")).toHaveLength(1)

	const kinds: RowKind[] = [
		{
			row: switcher,
			parts: switcherPartsOf(switcher),
			columns: ROW_X_OFFSETS,
			height: AVATAR_ROW_HEIGHT,
		},
		{
			row: menuItem,
			parts: topMenuPartsOf(menuItem),
			columns: ROW_COLUMNS,
			height: TOP_MENU_HEIGHT,
		},
		{
			row: header,
			parts: headerPartsOf(header),
			columns: HEADER_COLUMNS,
			height: SECTION_HEADER_HEIGHT,
		},
		...listRows.map((row) => ({
			row,
			parts: listRowPartsOf(row),
			columns: ROW_COLUMNS,
			height: LIST_ROW_HEIGHT,
		})),
		{
			row: footer,
			parts: footerPartsOf(footer),
			columns: ROW_COLUMNS,
			height: AVATAR_ROW_HEIGHT,
		},
	]
	const columns = () => {
		const box = boxOf(sidebar)
		return kinds.map(({ parts }) => columnsOf(parts, box))
	}
	const resting = columns()
	await expect(resting).toEqual(kinds.map((kind) => kind.columns))
	await expect(kinds.map(({ row }) => paddingOf(row))).toEqual(
		kinds.map(() => ROW_PADDING),
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
	"The Space switcher and the destinations menu above a conversation carrying missions, a conversation carrying none and an agent row, then the person footer. Check the icon centre sits 30px and the label 54px from the sidebar's start edge in the switcher, the Missions item, the three rows and the footer alike, that the trailing column ends 16px from its end edge in all of them but the switcher, whose chevron follows its name, and that the section header starts its label and ends its chevron 16px from the edges. Check every one of them pads 8 on all four sides, the switcher and the footer 44px tall, the Missions item 36px, the section header 32px and the three rows 52px, and that resting the pointer on any of them moves none of the columns."

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
	"The content the collapsed sidebar draws in its own Shared rows story: one Space, the three destinations, two pinned and three recent conversations, an available update and the person. Check the Space switcher, each destination, the list, the update row and the footer start at the same distance from the top edge and stand as tall as their collapsed slots."

export const SharedRowsExpanded = meta.story({
	name: "Shared rows Expanded",
	args: { update: <UpdateRow onDownload={DOWNLOAD} status="available" /> },
	parameters: { docs: { description: { story: SHARED_ROWS_DESCRIPTION } } },
})

export const SharedRowsLightExpanded = SharedRowsExpanded.extend({
	name: "Shared rows Light Expanded",
	globals: LIGHT,
})

const SHARED_ROW_ZONES: CollapsedSidebarZone[] = [
	{ id: "pinned", conversations: PINNED_CONVERSATIONS },
	{ id: "recent", conversations: RECENT_CONVERSATIONS },
]

const BOTH_VIEWS = (args: ExpandedSidebarProps) => (
	<WorkspaceShellRoot isLandmark={false}>
		<ExpandedSidebar {...args} />
		<CollapsedSidebar
			destination={args.destination}
			onSelectSpace={args.onSelectSpace}
			selectedSpaceId={args.selectedSpaceId}
			spaces={args.spaces}
			update={{ status: "available", onDownload: DOWNLOAD }}
			user={args.user}
			zones={SHARED_ROW_ZONES}
		/>
	</WorkspaceShellRoot>
)

const EXPANDED_ROW_SLOTS = {
	switcher: "space-switcher",
	update: "update-row",
	footer: "expanded-sidebar-footer",
}

const COLLAPSED_ROW_SLOTS = {
	switcher: "collapsed-sidebar-space",
	update: "collapsed-sidebar-update",
	footer: "collapsed-sidebar-person",
}

const EXPANDED_TOP_ROWS = [
	{ top: 8, height: AVATAR_ROW_HEIGHT },
	{ top: 60, height: TOP_MENU_HEIGHT },
	{ top: 98, height: TOP_MENU_HEIGHT },
	{ top: 136, height: TOP_MENU_HEIGHT },
]

const sharedRowEdgesIn = (
	sidebar: HTMLElement,
	slots: typeof EXPANDED_ROW_SLOTS,
) =>
	[
		slotIn(sidebar, slots.switcher),
		...within(slotIn(sidebar, "sidebar-menu")).getAllByRole("button"),
		slotIn(sidebar, "space-carousel"),
		slotIn(sidebar, slots.update),
		slotIn(sidebar, slots.footer),
	].map((row) => ({
		top: boxOf(row).top - boxOf(sidebar).top,
		height: boxOf(row).height,
	}))

export const SharedRowsLineUpAcrossViews = SharedRowsExpanded.extend({
	name: "Shared rows line up across views",
	tags: ["test-only"],
	render: BOTH_VIEWS,
	parameters: {
		a11y: {
			config: { rules: [{ id: "landmark-unique", reviewOnFail: true }] },
		},
		docs: {
			description: {
				story:
					"The expanded and the collapsed sidebar side by side on the same content. Check the Space switcher, each destination, the list, the update row and the footer start at the same distance from the top edge and stand as tall in both, that the expanded ones keep 8, 60, 98 and 136px for 44, 36, 36 and 36px, that the first collapsed separator starts where the first section header does, and that the collapsed update disc is as large as the expanded one with as much space above it as to its left inside its slot.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const expanded = sidebarIn(canvasElement)
		const collapsed = slotIn(canvasElement, "collapsed-sidebar")
		const expandedRows = sharedRowEdgesIn(expanded, EXPANDED_ROW_SLOTS)
		await expect(expandedRows.slice(0, EXPANDED_TOP_ROWS.length)).toEqual(
			EXPANDED_TOP_ROWS,
		)
		await expect(sharedRowEdgesIn(collapsed, COLLAPSED_ROW_SLOTS)).toEqual(
			expandedRows,
		)
		await expect(
			boxOf(slotIn(collapsed, "collapsed-sidebar-separator")).top,
		).toBe(boxOf(slotIn(expanded, "fold-section-trigger")).top)

		const updateSlot = boxOf(slotIn(collapsed, COLLAPSED_ROW_SLOTS.update))
		const collapsedDisc = boxOf(
			slotIn(collapsed, "collapsed-sidebar-update-disc"),
		)
		const expandedDisc = boxOf(
			slotIn(expanded, EXPANDED_ROW_SLOTS.update).firstElementChild as Element,
		)
		await expect([collapsedDisc.width, collapsedDisc.height]).toEqual([
			expandedDisc.width,
			expandedDisc.height,
		])
		await expect(collapsedDisc.top - updateSlot.top).toBe(
			collapsedDisc.left - updateSlot.left,
		)
	},
})
