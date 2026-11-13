import type { ComponentProps, ReactNode } from "react"
import {
	expect,
	fireEvent,
	fn,
	screen,
	userEvent,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	colourTransitionsOf,
	expectAnswered,
	expectClampedTo,
	expectMutedUntilHoveredOrActive,
	expectNeedingYou,
	expectQuestionCutInsideTheRow,
	expectTooltipBesideTheSidebar,
	expectTooltipCard,
	expectTooltipPastTheSidebarEdge,
	glyphIn,
	isInBrowserRunner,
	openTooltipOf,
	pictureOf,
	realPointer,
	rightClick,
	SidebarFrame,
	shown,
	slotIn,
	slotsIn,
	tokenStyleIn,
	UPLOADED_AVATAR_IMAGE,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	LONG_PENDING_QUESTION,
	PENDING_QUESTION,
	SIDEBAR_SECTION,
	SPOKEN_AT,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import {
	ConversationRosterRow,
	ROW_ICON_SIDE,
} from "@workspace/ui/components/app-sidebar-conversation-row"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar-model"
import { CompactRowsContext } from "@workspace/ui/components/compact-rows"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationIcons } from "@workspace/ui/components/icons"
import { formatSentDate } from "@workspace/ui/components/message"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/components/sidebar-menu-row"
import { SIDEBAR_MIN_WIDTH } from "@workspace/ui/components/sidebar-resize"
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"

const FREE_HUE = 210

const DARK = { theme: "dark", theme_layout: "single" }

type IconRailFrameProps = {
	children: ReactNode
}

const IconRailFrame = ({ children }: IconRailFrameProps) => (
	<SidebarProvider defaultOpen={false}>
		<Sidebar aria-label="Roster" collapsible="icon" role="complementary">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>{children}</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	</SidebarProvider>
)

const meta = preview.meta({
	title: "Navigation/AppSidebarConversationRow",
	component: ConversationRosterRow,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story, { parameters }) =>
			parameters.isOnIconRail ? (
				<IconRailFrame>
					<SidebarMenu>
						<Story />
					</SidebarMenu>
				</IconRailFrame>
			) : (
				<SidebarFrame width={parameters.sidebarWidth}>
					<SidebarMenu>
						<Story />
					</SidebarMenu>
				</SidebarFrame>
			),
	],
	args: {
		conversation: DESK_ROOM,
		isSelected: false,
		isPinned: true,
		lift: STILL_LIFT,
		sections: [SIDEBAR_SECTION],
		onSelect: fn(),
	},
})

export const PinnedConversationWithAWorkingBot = meta.story({
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(within(row).getByText(DESK_ROOM.name)).toBeVisible()
		await expect(slotIn(canvasElement, "sidebar-menu-item")).toHaveAttribute(
			"data-roster-drop",
		)
		row.click()
		await expect(args.onSelect).toHaveBeenCalledWith(
			DESK_ROOM.id,
			NO_CLICK_MODIFIERS,
		)
	},
})

export const RowMenuOpensInANewTab = meta.story({
	args: {
		onOpenInNewTab: fn(),
		onUnpin: fn(),
		onOpenSettings: fn(),
		onDelete: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The menu of a pinned conversation row, opened with a right click, on a host that can open the conversation in a tab of its own. Check that Open in a new tab sits right under Unpin with no separator between them, that one separator follows it, that Open settings and Delete follow unchanged, and that choosing it reports the conversation.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		fireEvent.contextMenu(slotIn(canvasElement, "sidebar-menu-button"))
		const menu = await shown(
			await screen.findByRole("menu", {
				name: `Actions for ${DESK_ROOM.name}`,
			}),
		)
		const rows = within(menu).getAllByRole("menuitem")
		const [unpin, openInNewTab] = rows

		await expect(rows.map((row) => row.textContent)).toEqual([
			"Unpin",
			"Open in a new tab",
			"Open settings",
			"Delete",
		])
		await expect(unpin.nextElementSibling).toBe(openInNewTab)
		await expect(openInNewTab.nextElementSibling).toHaveAttribute(
			"role",
			"separator",
		)
		await userEvent.click(openInNewTab)
		await expect(args.onOpenInNewTab).toHaveBeenCalledWith(DESK_ROOM.id)
	},
})

const CINDER: AppSidebarBot = {
	id: "cinder",
	name: "Cinder",
	blot: BLOT_HUES.red,
}
const DUNE: AppSidebarBot = { id: "dune", name: "Dune", blot: BLOT_HUES.green }
const EMBER: AppSidebarBot = {
	id: "ember",
	name: "Ember",
	blot: BLOT_HUES.pink,
}

const FIVE_BOTS = [ATLAS, BEACON, CINDER, DUNE, EMBER]

const roomOf = (participants: AppSidebarBot[]) => ({
	...DESK_ROOM,
	participants,
})

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const rowIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "sidebar-menu-button")

const boxOf = (root: Element, slot: string) =>
	slotIn(root, slot).getBoundingClientRect()

const expectRowAnatomy = async (row: HTMLElement) => {
	const icon = slotIn(row, "conversation-subject-icon")
	const cell = icon.getBoundingClientRect()
	const name = boxOf(row, "roster-row-name")
	const timestamp = boxOf(row, "roster-row-timestamp")
	const pile = boxOf(row, "conversation-bot-pile")
	const previewLine = slotIn(row, "conversation-bot-pile")
		.parentElement as HTMLElement
	const nameLine = slotIn(row, "roster-row-name").parentElement as HTMLElement

	await expect(icon).toHaveAttribute("aria-hidden", "true")
	await expect([cell.width, cell.height]).toEqual([
		ROW_ICON_SIDE,
		ROW_ICON_SIDE,
	])
	await expect(cell.top + cell.height / 2).toBeCloseTo(
		(nameLine.getBoundingClientRect().top +
			previewLine.getBoundingClientRect().bottom) /
			2,
		1,
	)
	await expect(name.left - cell.right).toBe(10)
	await expect(slotsIn(row, "conversation-subject-icon")).toHaveLength(1)
	await expect(previewLine.getBoundingClientRect().height).toBe(16)
	await expect(previewLine).toContainElement(slotIn(row, "roster-row-preview"))
	await expect(pile.right).toBeCloseTo(timestamp.right, 0)
	await expect(pile.top).toBeGreaterThanOrEqual(timestamp.bottom)
	await expect(pile.height).toBe(16)
}

const expectTwoBotsAndACounter = async (row: HTMLElement) => {
	await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(2)
	await expect(slotIn(row, "conversation-bot-pile-overflow")).toHaveTextContent(
		"+3",
	)
	await expect(within(row).getByRole("img", { name: "+3" })).toBe(
		slotIn(row, "conversation-bot-pile"),
	)
}

const expectCellWears = async (row: HTMLElement, hue?: number) => {
	const icon = slotIn(row, "conversation-subject-icon")
	await expect(slotIn(row, "outlined-hexagon-face").style.fill).toBe(
		"var(--conversation-icon)",
	)
	await expect(icon.style.color).toBe("var(--conversation-icon-foreground)")
	await expect(icon).toHaveAttribute("data-hue", String(hue ?? ""))
}

const expectKnockoutCutToTheRow = async (row: HTMLElement) => {
	const slots = slotsIn(row, "conversation-bot-pile-bot")
	for (const slot of slots.slice(0, -1)) {
		await expect(getComputedStyle(slot).maskComposite).toMatch(/^exclude/)
	}
	let layer = slots[0].parentElement
	while (layer && layer !== row) {
		await expect(getComputedStyle(layer).backgroundColor).toBe(TRANSPARENT)
		layer = layer.parentElement
	}
}

const DEFAULT_SIDEBAR_WIDTH = 256

const clippingAncestorsOf = (node: Element, root: Element) => {
	const clips: Element[] = []
	for (
		let ancestor = node.parentElement;
		ancestor && ancestor !== root;
		ancestor = ancestor.parentElement
	) {
		if (getComputedStyle(ancestor).overflowX !== "visible") clips.push(ancestor)
	}
	return clips
}

const expectInside = async (inner: DOMRect, outer: DOMRect) => {
	await expect(inner.left).toBeGreaterThanOrEqual(outer.left)
	await expect(inner.top).toBeGreaterThanOrEqual(outer.top)
	await expect(inner.right).toBeLessThanOrEqual(outer.right)
	await expect(inner.bottom).toBeLessThanOrEqual(outer.bottom)
}

const expectPileWhole = async (row: HTMLElement, root: HTMLElement) => {
	const slots = [
		...slotsIn(row, "conversation-bot-pile-bot"),
		...slotsIn(row, "conversation-bot-pile-overflow"),
	]
	const clips = [row, ...clippingAncestorsOf(slots[0], root)]
	for (const slot of slots) {
		for (const drawn of [slot, ...slotsIn(slot, "outlined-hexagon")]) {
			for (const clip of clips) {
				await expectInside(
					drawn.getBoundingClientRect(),
					clip.getBoundingClientRect(),
				)
			}
		}
	}
}

const expectPileWholeAtTheSidebarWidth = async (
	canvasElement: HTMLElement,
	width: number,
) => {
	const row = rowIn(canvasElement)
	await expect(row.getBoundingClientRect().width).toBe(width)
	await expect(slotIn(row, "conversation-bot-pile-overflow")).toHaveTextContent(
		"+3",
	)
	await expectPileWhole(row, canvasElement)
}

export const PileWholeAtTheNarrowestSidebar = meta.story({
	tags: ["test-only"],
	parameters: { sidebarWidth: SIDEBAR_MIN_WIDTH },
	args: { conversation: roomOf(FIVE_BOTS) },
	play: ({ canvasElement }) =>
		expectPileWholeAtTheSidebarWidth(canvasElement, SIDEBAR_MIN_WIDTH),
})

export const PileWholeAtTheDefaultSidebar = meta.story({
	tags: ["test-only"],
	parameters: { sidebarWidth: DEFAULT_SIDEBAR_WIDTH },
	args: { conversation: roomOf(FIVE_BOTS) },
	play: ({ canvasElement }) =>
		expectPileWholeAtTheSidebarWidth(canvasElement, DEFAULT_SIDEBAR_WIDTH),
})

export const RowWithoutIconOrColour = meta.story({
	tags: ["test-only"],
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expectCellWears(row)
		await expect(glyphIn(row, ConversationIcons.MessageSquare)).not.toBeNull()
		await expect(row).toHaveAccessibleName(
			expect.stringMatching(new RegExp(`^${DESK_ROOM.name}`)),
		)
	},
})

export const RedShieldKeyRow = meta.story({
	tags: ["test-only"],
	args: {
		conversation: { ...DESK_ROOM, color: BLOT_HUES.red, icon: "ShieldKey" },
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expectCellWears(row, BLOT_HUES.red)
		await expect(glyphIn(row, ConversationIcons.ShieldKey)).not.toBeNull()
	},
})

export const RowInRed = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.red } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.red),
})

export const RowInYellow = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.yellow } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.yellow),
})

export const RowInGreen = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.green } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.green),
})

export const RowInCyan = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.cyan } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.cyan),
})

export const RowInBlue = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.blue } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.blue),
})

export const RowInPurple = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.purple } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.purple),
})

export const RowInPink = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.pink } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.pink),
})

export const RowInOrange = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...DESK_ROOM, color: BLOT_HUES.orange } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.orange),
})

export const MonochromeRow = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A room with no colour, in the light theme. Check that the 28px subject icon wears the neutral pair. Pick `MutedTintRow` for a preset hue, `MutedTintRowFreeHue` for a free hue.",
			},
		},
	},
	play: ({ canvasElement }) => expectCellWears(rowIn(canvasElement)),
})

export const MonochromeRowDark = meta.story({
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A room with no colour, in the dark theme. Check that the 28px subject icon wears the neutral pair. Pick `MutedTintRow` for a preset hue, `MutedTintRowFreeHue` for a free hue.",
			},
		},
	},
	play: ({ canvasElement }) => expectCellWears(rowIn(canvasElement)),
})

export const MutedTintRow = meta.story({
	args: {
		conversation: { ...DESK_ROOM, color: BLOT_HUES.red, icon: "ShieldKey" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A room coloured red with the shield key picked, in the light theme. Check that the 28px subject icon wears the red recipe tones. Pick `MonochromeRow` for a room with no colour.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.red),
})

export const MutedTintRowDark = meta.story({
	globals: DARK,
	args: {
		conversation: { ...DESK_ROOM, color: BLOT_HUES.red, icon: "ShieldKey" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A room coloured red with the shield key picked, in the dark theme. Check that the 28px subject icon wears the red recipe tones. Pick `MonochromeRow` for a room with no colour.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), BLOT_HUES.red),
})

export const MutedTintRowFreeHue = meta.story({
	args: { conversation: { ...DESK_ROOM, color: FREE_HUE } },
	parameters: {
		docs: {
			description: {
				story:
					"A room coloured at a hue outside the eight presets, 210, in the light theme. Check that the 28px subject icon wears the recipe tones of 210 rather than the nearest preset. Pick `MutedTintRow` for a preset hue.",
			},
		},
	},
	play: ({ canvasElement }) => expectCellWears(rowIn(canvasElement), FREE_HUE),
})

export const MutedTintRowFreeHueDark = meta.story({
	globals: DARK,
	args: { conversation: { ...DESK_ROOM, color: FREE_HUE } },
	parameters: {
		docs: {
			description: {
				story:
					"A room coloured at a hue outside the eight presets, 210, in the dark theme. Check that the 28px subject icon wears the recipe tones of 210 rather than the nearest preset. Pick `MutedTintRow` for a preset hue.",
			},
		},
	},
	play: ({ canvasElement }) => expectCellWears(rowIn(canvasElement), FREE_HUE),
})

const soloWith = (agent: AppSidebarBot): AppSidebarConversation => ({
	id: `solo-${agent.id}`,
	name: agent.name,
	participants: [agent],
	agent,
	lastMessage: agent.lastMessage,
	lastSpeaker: agent.name,
	timestamp: agent.timestamp,
})

const PICTURED_ATLAS: AppSidebarBot = { ...ATLAS, image: UPLOADED_AVATAR_IMAGE }

const MIXED_ROOMS_AND_SOLOS = [
	DESK_ROOM,
	soloWith(BEACON),
	roomOf(FIVE_BOTS),
	soloWith(PICTURED_ATLAS),
]

const mediaAvatarsIn = (row: HTMLElement) =>
	slotsIn(row, "bot-identity-avatar").filter(
		(avatar) => !avatar.closest('[data-slot="conversation-bot-pile"]'),
	)

const expectMediaGeometry = async (row: HTMLElement, media: HTMLElement) => {
	const cell = media.getBoundingClientRect()

	await expect([cell.width, cell.height]).toEqual([
		ROW_ICON_SIDE,
		ROW_ICON_SIDE,
	])
	await expect(boxOf(row, "roster-row-name").left - cell.right).toBe(10)
	await expect(boxOf(row, "conversation-bot-pile").height).toBe(16)
}

const expectAgentLeads = async (row: HTMLElement) => {
	const avatars = mediaAvatarsIn(row)

	await expect(slotsIn(row, "conversation-subject-icon")).toHaveLength(0)
	await expect(avatars).toHaveLength(1)
	await expectMediaGeometry(row, avatars[0])
	return avatars[0]
}

export const MixedRoomsAndSoloConversations = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A list mixing rooms and one-to-one conversations whose caller passes the agent. Check that each solo row leads with its agent's 28px hexagon, wearing the agent's working pose or uploaded picture, that each room leads with its subject icon, and that name, preview, pile and timestamp sit at the same place on both. Pick `SoloConversationRowDark` for the dark theme.",
			},
		},
	},
	render: (args) => (
		<>
			{MIXED_ROOMS_AND_SOLOS.map((conversation) => (
				<ConversationRosterRow
					{...args}
					conversation={conversation}
					key={conversation.id}
				/>
			))}
		</>
	),
	play: async ({ canvasElement }) => {
		const [room, workingSolo, crowdedRoom, picturedSolo] = slotsIn(
			canvasElement,
			"sidebar-menu-button",
		)

		for (const row of [room, crowdedRoom]) {
			await expect(mediaAvatarsIn(row)).toHaveLength(0)
			await expectMediaGeometry(row, slotIn(row, "conversation-subject-icon"))
		}
		await expectAgentLeads(workingSolo)
		const picturedAvatar = await expectAgentLeads(picturedSolo)
		await expect((await pictureOf(picturedAvatar)).src).toBe(
			UPLOADED_AVATAR_IMAGE,
		)
	},
})

export const SoloConversationRowDark = meta.story({
	globals: DARK,
	args: { conversation: soloWith(BEACON) },
	parameters: {
		docs: {
			description: {
				story:
					"A one-to-one conversation whose caller passes its working agent, in the dark theme. Check that the agent's 28px hexagon leads the row in its writing pose, with no subject icon. Pick `MixedRoomsAndSoloConversations` for the light theme beside rooms.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAgentLeads(rowIn(canvasElement))
	},
})

export const RowWithOneBot = meta.story({
	tags: ["test-only"],
	args: { conversation: roomOf([ATLAS]) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(1)
	},
})

export const RowWithTwoBots = meta.story({
	tags: ["test-only"],
	args: { conversation: roomOf([ATLAS, BEACON]) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(2)
		await expectKnockoutCutToTheRow(row)
	},
})

export const RowWithThreeBots = meta.story({
	tags: ["test-only"],
	args: { conversation: roomOf([ATLAS, BEACON, CINDER]) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(3)
		await expect(
			row.querySelector('[data-slot="conversation-bot-pile-overflow"]'),
		).toBeNull()
		await expect(slotIn(row, "conversation-bot-pile")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
	},
})

export const RowWithFiveBots = meta.story({
	tags: ["test-only"],
	args: { conversation: roomOf(FIVE_BOTS) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expectTwoBotsAndACounter(row)
	},
})

export const RowWithABadgeAndAPile = meta.story({
	tags: ["test-only"],
	args: { conversation: { ...roomOf(FIVE_BOTS), badge: "done" } },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const dot = boxOf(row, "bot-activity-dot")
		const pile = boxOf(row, "conversation-bot-pile")
		await expect(dot.width).toBeGreaterThan(0)
		await expect(
			pile.right <= dot.left ||
				dot.right <= pile.left ||
				pile.bottom <= dot.top ||
				dot.bottom <= pile.top,
		).toBe(true)
		await expect(slotIn(row, "conversation-bot-pile")).toHaveAccessibleName(
			"+3",
		)
		await expectPileWhole(row, canvasElement)
	},
})

export const LongTitleAndPreviewTruncate = meta.story({
	tags: ["test-only"],
	args: {
		conversation: {
			...roomOf([ATLAS, CINDER, DUNE, EMBER]),
			name: "Quarterly infrastructure migration and the release train it blocks",
			lastMessage:
				"Rebuilt the bundle twice, both green, and the staging deploy is waiting on your read of the changelog.",
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		for (const slot of ["roster-row-name", "roster-row-preview"]) {
			const text = slotIn(row, slot)
			await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
			await expect(text.getBoundingClientRect().height).toBeLessThanOrEqual(20)
		}
		const timestamp = slotIn(row, "roster-row-timestamp")
		await expect(timestamp.scrollWidth).toBeLessThanOrEqual(
			timestamp.clientWidth,
		)
		await expect(boxOf(row, "conversation-bot-pile").width).toBe(34)
	},
})

export const KnockoutWearsTheRowAtRestAndHovered = meta.story({
	tags: ["test-only"],
	args: { conversation: roomOf(FIVE_BOTS), isSelected: false },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectKnockoutCutToTheRow(row)
		await userEvent.hover(row)
		await expectKnockoutCutToTheRow(row)
	},
})

const surfaceOf = (row: HTMLElement) =>
	row.closest('[data-slot="context-menu-trigger"]') as HTMLElement

const centreOf = (element: HTMLElement) => {
	const box = element.getBoundingClientRect()
	return [box.left + box.width / 2, box.top + box.height / 2] as const
}

const MISSIONS_ROOM: AppSidebarConversation = {
	...roomOf([ATLAS, BEACON, CINDER]),
	color: BLOT_HUES.blue,
	icon: "Rocket",
	missions: [
		{
			id: "m-waiting",
			state: "waiting",
			ticket: {
				platform: "linear",
				externalId: "OPE-512",
				title: "Ship the release notes",
			},
		},
		{
			id: "m-working",
			state: "working",
			isLive: true,
			ticket: {
				platform: "linear",
				externalId: "OPE-513",
				title: "Rebuild the bundle",
			},
		},
	],
}

const missionGroupFillOf = (row: HTMLElement) =>
	tokenStyleIn(row, "bg-sidebar-accent", "backgroundColor")

const expectOneMissionSurface = async (row: HTMLElement, fill: string) => {
	await expect(getComputedStyle(surfaceOf(row)).backgroundColor).toBe(fill)
	await expect(getComputedStyle(row).backgroundColor).toBe(TRANSPARENT)
}

const MISSION_FREE_ROOM: AppSidebarConversation = {
	...MISSIONS_ROOM,
	id: "release-desk",
	name: "Release desk",
	missions: undefined,
}

const ROW_INSET = 8

const renderBesideAMissionFreeRow = (
	args: ComponentProps<typeof ConversationRosterRow>,
) => (
	<>
		<ConversationRosterRow {...args} />
		<ConversationRosterRow
			{...args}
			conversation={MISSION_FREE_ROOM}
			isSelected={false}
		/>
	</>
)

const rowsIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "sidebar-menu-button") as HTMLElement[]

const contentBoxesOf = (surface: HTMLElement) =>
	[...surface.querySelectorAll("*")]
		.filter((element) => !element.childElementCount)
		.filter((element) => !element.closest(".sr-only"))
		.map((element) => element.getBoundingClientRect())
		.filter((box) => box.width > 0 && box.height > 0)

const insetsOf = (row: HTMLElement) => {
	const surface = surfaceOf(row)
	const edge = surface.getBoundingClientRect()
	const boxes = contentBoxesOf(surface)
	const lowest = (side: "left" | "top") =>
		Math.min(...boxes.map((box) => box[side]))
	const highest = (side: "right" | "bottom") =>
		Math.max(...boxes.map((box) => box[side]))
	return {
		left: Math.round(lowest("left") - edge.left),
		right: Math.round(edge.right - highest("right")),
		top: Math.round(lowest("top") - edge.top),
		bottom: Math.round(edge.bottom - highest("bottom")),
	}
}

const xOf = (row: HTMLElement) => ({
	icon: boxOf(row, "conversation-subject-icon").left,
	title: boxOf(row, "roster-row-name").left,
	timestamp: boxOf(row, "roster-row-timestamp").left,
})

const expectEvenInsets = async (row: HTMLElement) =>
	expect(insetsOf(row)).toEqual({
		left: ROW_INSET,
		right: ROW_INSET,
		top: ROW_INSET,
		bottom: ROW_INSET,
	})

const expectOneRowGeometry = async (canvasElement: HTMLElement) => {
	const [withMissions, withoutMissions] = rowsIn(canvasElement)
	await expect(
		slotsIn(surfaceOf(withMissions), "mission-capsule"),
	).toHaveLength(2)
	await expect(
		slotsIn(surfaceOf(withoutMissions), "mission-capsule-list"),
	).toHaveLength(0)
	await expectEvenInsets(withMissions)
	await expectEvenInsets(withoutMissions)
	await expect(xOf(withMissions)).toEqual(xOf(withoutMissions))
	return xOf(withMissions)
}

export const OpenRowWithMissionCapsules = meta.story({
	tags: ["test-only"],
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: {
		isSelected: true,
		conversation: MISSIONS_ROOM,
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expect(row).toHaveAttribute("aria-current", "page")
		const surface = surfaceOf(row)
		await expectOneMissionSurface(row, missionGroupFillOf(row))
		await expectRowAnatomy(row)
		await expectKnockoutCutToTheRow(row)
		const capsules = slotsIn(canvasElement, "mission-capsule")
		await expect(capsules).toHaveLength(2)
		for (const capsule of capsules) {
			await expect(row.contains(capsule)).toBe(false)
			await expect(surface.contains(capsule)).toBe(true)
			await expect(capsule.getBoundingClientRect().top).toBeGreaterThan(
				boxOf(row, "conversation-subject-icon").bottom,
			)
		}
	},
})

export const MissionCapsulesAreInert = meta.story({
	args: { conversation: MISSIONS_ROOM, onSelect: fn() },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation with two open missions. Check each capsule is no button and no tab stop, keeps its state for a screen reader, and that a click, a Command click or a right click on it acts on the conversation row.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const row = rowIn(canvasElement)
		const surface = surfaceOf(row)
		await expect(within(surface).getAllByRole("button")).toEqual([row])
		const capsules = slotsIn(canvasElement, "mission-capsule")
		await expect(capsules).toHaveLength(2)
		await expect(capsules[0]).toHaveTextContent("waiting for you")
		for (const capsule of capsules) {
			await expect(capsule.tabIndex).toBe(-1)
			await expect(getComputedStyle(capsule).pointerEvents).toBe("none")
			await expect(document.elementFromPoint(...centreOf(capsule))).toBe(row)
		}
		fireEvent.click(row, { detail: 1 })
		await expect(args.onSelect).toHaveBeenLastCalledWith(
			MISSIONS_ROOM.id,
			NO_CLICK_MODIFIERS,
		)
		fireEvent.click(row, { detail: 1, metaKey: true })
		await expect(args.onSelect).toHaveBeenLastCalledWith(MISSIONS_ROOM.id, {
			...NO_CLICK_MODIFIERS,
			meta: true,
		})
		fireEvent.contextMenu(row)
		await shown(
			await screen.findByRole("menu", {
				name: `Actions for ${MISSIONS_ROOM.name}`,
			}),
		)
		await userEvent.keyboard("{Escape}")
	},
})

const MISSION_GROUP_HOVER = { hover: '[data-slot="context-menu-trigger"]' }

const hoverMissionGroup = async (
	row: HTMLElement,
	target = row,
	fill = missionGroupFillOf(row),
) => {
	const atRest = xOf(row)
	const pointer = await realPointer()
	try {
		await pointer.hover(target, { force: true })
		await expectOneMissionSurface(row, fill)
		await expectEvenInsets(row)
		await expect(xOf(row)).toEqual(atRest)
	} finally {
		await pointer.unhover(row)
	}
}

const missionGroupAtRestStory = (globals?: typeof DARK) => ({
	globals,
	render: renderBesideAMissionFreeRow,
	args: { conversation: MISSIONS_ROOM },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A conversation with two open missions, at rest. Check the row and its mission tree carry no fill, the tree line and branches read against the sidebar, and neither the row nor the tree runs a colour transition. Beside it, a conversation without missions drawn by the same row: check both keep an 8px inset from the surface edge to their content on all four sides, and the icon, title and timestamp at the same x, lit or at rest.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const [row, missionFreeRow] = rowsIn(canvasElement)
		await expectOneMissionSurface(row, TRANSPARENT)
		await expectOneMissionSurface(missionFreeRow, TRANSPARENT)
		await expectOneRowGeometry(canvasElement)
		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			for (const each of [row, missionFreeRow]) {
				await expect(colourTransitionsOf(surfaceOf(each))).toEqual([])
				await expect(colourTransitionsOf(each)).toEqual([])
			}
		})
	},
})

export const MissionGroupAtRest = meta.story(missionGroupAtRestStory())

export const MissionGroupAtRestDark = meta.story(missionGroupAtRestStory(DARK))

const missionGroupHoveredStory = (globals?: typeof DARK) => ({
	globals,
	render: renderBesideAMissionFreeRow,
	args: { conversation: MISSIONS_ROOM },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		pseudo: MISSION_GROUP_HOVER,
		docs: {
			description: {
				story:
					"The pointer rests on a conversation with two open missions. Check the row and its mission tree light at once as one surface in `--sidebar-accent`, with no second tile on the row, whether the pointer is on the row or on a mission line. Beside it, a conversation without missions drawn by the same row: check both keep an 8px inset from the surface edge to their content on all four sides, and the icon, title and timestamp at the same x, lit or at rest.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectOneRowGeometry(canvasElement)
		if (!isInBrowserRunner()) return
		const [row, missionFreeRow] = rowsIn(canvasElement)
		const lastMission = slotsIn(canvasElement, "mission-capsule").at(
			-1,
		) as HTMLElement
		await withMotionAllowed(async () => {
			await hoverMissionGroup(row)
			await expectOneMissionSurface(row, TRANSPARENT)
			await hoverMissionGroup(row, lastMission)
			await hoverMissionGroup(missionFreeRow)
		})
	},
})

export const MissionGroupHovered = meta.story(missionGroupHoveredStory())

export const MissionGroupHoveredDark = meta.story(
	missionGroupHoveredStory(DARK),
)

const missionGroupActiveStory = (globals?: typeof DARK) => ({
	globals,
	render: renderBesideAMissionFreeRow,
	args: { conversation: MISSIONS_ROOM, isSelected: true },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The current conversation carries two open missions. Check the row and its mission tree wear the active fill `--sidebar-accent` as one surface, the row reporting itself as the current page, and that the pointer on it keeps that one surface. Beside it, a conversation without missions drawn by the same row: check both keep an 8px inset from the surface edge to their content on all four sides, and the icon, title and timestamp at the same x, lit or at rest.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = rowIn(canvasElement)
		await expect(row).toHaveAttribute("aria-current", "page")
		await expectOneMissionSurface(row, missionGroupFillOf(row))
		await expectOneRowGeometry(canvasElement)
		if (isInBrowserRunner())
			await withMotionAllowed(() => hoverMissionGroup(row))
	},
})

export const MissionGroupActive = meta.story(missionGroupActiveStory())

export const MissionGroupActiveDark = meta.story(missionGroupActiveStory(DARK))

const AT_REST_ROOM: AppSidebarConversation = {
	...DESK_ROOM,
	id: "at-rest",
	name: "At rest",
}

const HOVERED_ROOM: AppSidebarConversation = {
	...DESK_ROOM,
	id: "hovered",
	name: "Hovered",
}

const ACTIVE_ROOM: AppSidebarConversation = {
	...DESK_ROOM,
	id: "active",
	name: "Active",
}

const renderCompactRowStates = (
	args: ComponentProps<typeof ConversationRosterRow>,
) => (
	<CompactRowsContext.Provider value>
		{[AT_REST_ROOM, HOVERED_ROOM, ACTIVE_ROOM].map((conversation) => (
			<ConversationRosterRow
				{...args}
				conversation={conversation}
				isSelected={conversation === ACTIVE_ROOM}
				key={conversation.id}
			/>
		))}
	</CompactRowsContext.Provider>
)

const compactRowStatesStory = (globals?: typeof DARK) => ({
	globals,
	render: renderCompactRowStates,
	parameters: {
		pseudo: { hover: 'li:nth-child(2) [data-slot="sidebar-menu-button"]' },
		docs: {
			description: {
				story:
					"Three conversations without a colour as the expanded sidebar lists them: one at rest, one under the pointer, one open. Check the name and the glyph sit in `--muted-foreground` at rest and in `--sidebar-foreground` under the pointer and on the open row, that the colour switches with no fade, and that the timestamp keeps `--sidebar-muted-foreground` on all three.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const [atRest, hovered, active] = rowsIn(canvasElement)
		const timestampInk = tokenStyleIn(
			atRest,
			"text-sidebar-muted-foreground",
			"color",
		)

		await expect(active).toHaveAttribute("aria-current", "page")
		await expectMutedUntilHoveredOrActive({
			states: { atRest, hovered, active },
			inkedPartsOf: (row) => [
				slotIn(row, "roster-row-name"),
				slotIn(row, "conversation-subject-icon-pictogram"),
			],
			steadyPartsOf: (row) => [slotIn(row, "roster-row-timestamp")],
			fullInk: "text-sidebar-foreground",
		})
		for (const row of [atRest, hovered, active])
			await expect(
				getComputedStyle(slotIn(row, "roster-row-timestamp")).color,
			).toBe(timestampInk)
	},
})

export const CompactRowAtRestHoveredAndActive = meta.story(
	compactRowStatesStory(),
)

export const CompactRowAtRestHoveredAndActiveDark = meta.story(
	compactRowStatesStory(DARK),
)

const missionGroupMenuOpenStory = (globals?: typeof DARK) => ({
	globals,
	render: renderBesideAMissionFreeRow,
	args: { conversation: MISSIONS_ROOM },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The context menu of a conversation with two open missions is open. Check the row and its mission tree wear the roster open menu fill `--sidebar-accent` at 70 percent as one surface, the row itself transparent, and that the pointer resting on the group still shows a single fill. Beside it, a conversation without missions drawn by the same row: check both keep an 8px inset from the surface edge to their content on all four sides, and the icon, title and timestamp at the same x, lit or at rest.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = rowIn(canvasElement)
		const openMenuFill = tokenStyleIn(
			row,
			"bg-sidebar-accent/70",
			"backgroundColor",
		)
		const atRest = await expectOneRowGeometry(canvasElement)
		fireEvent.contextMenu(row)
		await shown(
			await screen.findByRole("menu", {
				name: `Actions for ${MISSIONS_ROOM.name}`,
			}),
		)
		try {
			await expectOneMissionSurface(row, openMenuFill)
			await expectEvenInsets(row)
			await expect(xOf(row)).toEqual(atRest)
			await expect(
				getComputedStyle(slotIn(canvasElement, "mission-capsule-list"))
					.backgroundColor,
			).toBe(TRANSPARENT)
			if (isInBrowserRunner())
				await withMotionAllowed(() => hoverMissionGroup(row, row, openMenuFill))
		} finally {
			await userEvent.keyboard("{Escape}")
		}
		const missionFreeRow = rowsIn(canvasElement)[1]
		fireEvent.contextMenu(missionFreeRow)
		await shown(
			await screen.findByRole("menu", {
				name: `Actions for ${MISSION_FREE_ROOM.name}`,
			}),
		)
		try {
			await expectOneMissionSurface(missionFreeRow, openMenuFill)
			await expectEvenInsets(missionFreeRow)
			await expect(xOf(missionFreeRow)).toEqual(atRest)
		} finally {
			await userEvent.keyboard("{Escape}")
		}
	},
})

export const MissionGroupMenuOpen = meta.story(missionGroupMenuOpenStory())

export const MissionGroupMenuOpenDark = meta.story(
	missionGroupMenuOpenStory(DARK),
)

const RAIL_TILE_SIDE = 44

const conversationOnTheIconRailStory = (globals?: typeof DARK) => ({
	globals,
	tags: ["test-only"],
	args: { isSelected: true },
	parameters: {
		isOnIconRail: true,
		docs: {
			description: {
				story:
					"The current conversation, without missions, on the icon rail. Check it is drawn as the roster tile it was before conversation rows took the lit surface: a 44px square with a 10px radius wearing the active fill `--sidebar-accent`, the surface around it left transparent, and the pointer on it keeping that one tile.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = rowIn(canvasElement)
		const surface = surfaceOf(row)
		const tile = row.getBoundingClientRect()
		const activeFill = missionGroupFillOf(row)
		await expect([tile.width, tile.height]).toEqual([
			RAIL_TILE_SIDE,
			RAIL_TILE_SIDE,
		])
		await expect(getComputedStyle(row).borderTopLeftRadius).toBe("10px")
		await expect(getComputedStyle(row).backgroundColor).toBe(activeFill)
		await expect(getComputedStyle(surface).backgroundColor).toBe(TRANSPARENT)
		if (!isInBrowserRunner()) return
		const pointer = await realPointer()
		try {
			await pointer.hover(row)
			await expect(getComputedStyle(row).backgroundColor).toBe(activeFill)
			await expect(getComputedStyle(surface).backgroundColor).toBe(TRANSPARENT)
		} finally {
			await pointer.unhover(row)
		}
	},
})

export const ConversationOnTheIconRail = meta.story(
	conversationOnTheIconRailStory(),
)

export const ConversationOnTheIconRailDark = meta.story(
	conversationOnTheIconRailStory(DARK),
)

export const IconAtTheHeightOfItsTwoLines = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Check the subject icon is 28px, centred on the 20px name line plus the 16px preview line, and the row without missions is 52px, the height of a sidebar skeleton row.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(row.getBoundingClientRect().height).toBe(52)
	},
})

export const WorkingConversationKeepsItsTimestamp = meta.story({
	tags: ["test-only"],
	play: async ({ canvas, canvasElement }) => {
		const row = rowIn(canvasElement)
		await expect(
			slotIn(slotIn(row, "roster-row-preview"), "shimmer-text"),
		).toBeVisible()
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
			DESK_ROOM.timestamp ?? "",
		)
		await expect(canvas.getAllByRole("button")).toEqual([row])
		await expectPileWhole(row, canvasElement)
	},
})

const roomWithBeaconWaitingOn = (backgroundTasks: number) => ({
	...DESK_ROOM,
	participants: [ATLAS, { ...BEACON, backgroundTasks }],
})

const expectWorkingPreview = async (
	canvasElement: HTMLElement,
	text: string,
) => {
	const row = rowIn(canvasElement)
	const preview = slotIn(row, "roster-row-preview")
	await expect(slotIn(preview, "shimmer-text")).toBeVisible()
	await expect(preview.textContent).toBe(text)
	await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
		DESK_ROOM.timestamp ?? "",
	)
	await expectPileWhole(row, canvasElement)
}

export const WorkingConversationWaitingOnTwoBackgroundTasks = meta.story({
	args: { conversation: roomWithBeaconWaitingOn(2) },
	play: ({ canvasElement }) =>
		expectWorkingPreview(
			canvasElement,
			"Beacon: waiting on 2 background tasks",
		),
})

export const WorkingConversationWaitingOnOneBackgroundTask = meta.story({
	args: { conversation: roomWithBeaconWaitingOn(1) },
	play: ({ canvasElement }) =>
		expectWorkingPreview(canvasElement, "Beacon: waiting on 1 background task"),
})

export const IdleConversationIgnoresBackgroundTasks = meta.story({
	tags: ["test-only"],
	args: {
		conversation: {
			...DESK_ROOM,
			participants: [ATLAS, { ...BEACON, status: "idle", backgroundTasks: 2 }],
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(rowIn(canvasElement), "roster-row-preview").textContent,
		).toBe(`${DESK_ROOM.lastSpeaker}: ${DESK_ROOM.lastMessage}`)
	},
})

const DESK_ROOM_NEEDING_YOU = {
	...DESK_ROOM,
	badge: "attention" as const,
	pendingQuestion: PENDING_QUESTION,
}

const expectPileAfterTheQuestion = async (row: HTMLElement) => {
	const line = slotIn(row, "roster-row-needs-you")
	const question = boxOf(line, "roster-row-preview")
	const pile = boxOf(line, "conversation-bot-pile")
	await expect(pile.left - question.right).toBe(8)
	await expect([pile.top, pile.bottom]).toEqual([question.top, question.bottom])
	await expect(pile.right).toBeCloseTo(
		boxOf(row, "roster-row-timestamp").right,
		0,
	)
}

const expectBotsOverlapping = async (row: HTMLElement) => {
	const pile = slotIn(row, "conversation-bot-pile")
	const origin = pile.getBoundingClientRect().left
	const slots = [
		...slotsIn(pile, "conversation-bot-pile-bot"),
		...slotsIn(pile, "conversation-bot-pile-overflow"),
	]
	const boxes = slots.map((slot) => slot.getBoundingClientRect())
	for (const box of boxes) {
		await expect([box.width, box.height]).toEqual([14, 14])
	}
	await expect(boxes.map((box) => box.left - origin)).toEqual(
		slots.map((_, index) => index * 10),
	)
	await expectKnockoutCutToTheRow(row)
	await expect(slotsIn(pile, "outlined-hexagon")).toHaveLength(slots.length)
}

const expectLongQuestionBesideAWholePile = async (
	canvasElement: HTMLElement,
) => {
	const row = rowIn(canvasElement)
	await expectQuestionCutInsideTheRow(row)
	await expectPileAfterTheQuestion(row)
	await expectBotsOverlapping(row)
	await expectTwoBotsAndACounter(row)
	await expectPileWhole(row, canvasElement)
}

const expectConversationNeedingYou = async (canvasElement: HTMLElement) => {
	const row = rowIn(canvasElement)
	await expectNeedingYou(row, PENDING_QUESTION)
	await expectPileAfterTheQuestion(row)
	await expectBotsOverlapping(row)
	await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(2)
	await expectPileWhole(row, canvasElement)
}

const expectConversationAnswered = async (canvasElement: HTMLElement) => {
	const row = rowIn(canvasElement)
	await expectAnswered(row)
	await expectRowAnatomy(row)
}

export const ConversationNeedingYou = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: { conversation: DESK_ROOM_NEEDING_YOU },
	play: ({ canvasElement }) => expectConversationNeedingYou(canvasElement),
})

export const ConversationNeedingYouDark = meta.story({
	globals: DARK,
	args: { conversation: DESK_ROOM_NEEDING_YOU },
	play: ({ canvasElement }) => expectConversationNeedingYou(canvasElement),
})

export const ConversationAnswered = meta.story({
	tags: ["test-only"],
	play: ({ canvasElement }) => expectConversationAnswered(canvasElement),
})

export const ConversationAnsweredDark = meta.story({
	tags: ["test-only"],
	globals: DARK,
	play: ({ canvasElement }) => expectConversationAnswered(canvasElement),
})

const UNSENT_MESSAGE = "The dinner, please. Book it for 20:00."

const DESK_ROOM_NOT_SENT = {
	...DESK_ROOM,
	participants: [ATLAS, { ...BEACON, status: "idle" as const }],
	lastMessage: UNSENT_MESSAGE,
	lastSpeaker: "Mira",
	isNotSent: true,
}

const expectNotSent = async (canvasElement: HTMLElement) => {
	const row = rowIn(canvasElement)
	const label = slotIn(row, "roster-row-timestamp")
	const preview = slotIn(row, "roster-row-preview")
	await expect(row).toHaveAttribute("aria-current", "page")
	await expect(label).toHaveTextContent(/^Not sent$/)
	await expect(row).not.toHaveTextContent(DESK_ROOM.timestamp ?? "")
	await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth)
	await expect(getComputedStyle(label).color).toBe(
		tokenStyleIn(row, "text-destructive", "color"),
	)
	await expect(getComputedStyle(label).fontSize).toBe("12px")
	await expect(preview.textContent).toBe(`You: ${UNSENT_MESSAGE}`)
	await expect(getComputedStyle(preview).color).toBe(
		tokenStyleIn(row, "text-muted-foreground", "color"),
	)
	await expect(getComputedStyle(preview).whiteSpace).toBe("nowrap")
}

const NOT_SENT_DESCRIPTION =
	"A room whose last message did not send, selected as artboard 7 draws it. Check that `Not sent` takes the timestamp slot in the destructive red, whole, and that the preview names you as its speaker in the muted preview colour, on one line."

export const NotSentSelected = meta.story({
	args: { conversation: DESK_ROOM_NOT_SENT, isSelected: true },
	parameters: {
		docs: {
			description: {
				story: `${NOT_SENT_DESCRIPTION} Light theme. Pick \`NotSentSelectedDark\` for the dark theme.`,
			},
		},
	},
	play: ({ canvasElement }) => expectNotSent(canvasElement),
})

export const NotSentSelectedDark = meta.story({
	globals: DARK,
	args: { conversation: DESK_ROOM_NOT_SENT, isSelected: true },
	parameters: {
		docs: {
			description: {
				story: `${NOT_SENT_DESCRIPTION} Dark theme. Pick \`NotSentSelected\` for the light theme.`,
			},
		},
	},
	play: ({ canvasElement }) => expectNotSent(canvasElement),
})

export const ConversationLongQuestionAtTheNarrowestSidebar = meta.story({
	tags: ["test-only"],
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		sidebarWidth: SIDEBAR_MIN_WIDTH,
	},
	args: {
		conversation: {
			...roomOf(FIVE_BOTS),
			pendingQuestion: LONG_PENDING_QUESTION,
		},
	},
	play: ({ canvasElement }) =>
		expectLongQuestionBesideAWholePile(canvasElement),
})

const LONG_TITLE =
	"Launch readiness review with the platform, design and support teams before the autumn release"

const LONG_MESSAGE =
	"The changelog is ready for a read. I grouped the fixes by surface, moved the two breaking changes to the top and linked every entry to its pull request. The migration note still needs a second pair of eyes before it ships, and the screenshots for the settings page are a release behind. Tell me which of the three open questions you want answered first and I will draft the rest around it."

const FIVE_AGENTS_SEATED = "Agents: Atlas, Beacon, Cinder, Dune, Ember"

const LONG_TITLED_ROOM: AppSidebarConversation = {
	...roomOf(FIVE_BOTS),
	name: LONG_TITLE,
	lastMessage: LONG_MESSAGE,
	lastActivityAt: SPOKEN_AT,
}

const ROOM_WITHOUT_A_MESSAGE: AppSidebarConversation = {
	id: "fresh-room",
	name: "Fresh room",
	participants: [ATLAS, BEACON],
	lastActivityAt: SPOKEN_AT,
}

const SPOKEN_ROOM: AppSidebarConversation = {
	...DESK_ROOM,
	lastActivityAt: SPOKEN_AT,
}

const withRoomAboveTheRow = (Story: () => ReactNode) => (
	<>
		<li aria-hidden="true" className="h-40" />
		<Story />
	</>
)

const tooltipOfALongTitledRoomStory = (globals?: typeof DARK) => ({
	globals,
	args: { conversation: LONG_TITLED_ROOM },
	decorators: [withRoomAboveTheRow],
	parameters: {
		docs: {
			description: {
				story:
					"The pointer resting on a conversation whose title the row cuts, with five agents seated and a message of several sentences. Check the tooltip carries the whole title, every agent, the message stopped at four lines and the full date of that message, that it sits just past the sidebar edge and centred on the row, and that the row keeps its name and gains the tooltip as its description. Pick `TooltipWithoutAMessageYet` for a conversation nobody wrote in.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const row = rowIn(canvasElement)
		const tooltip = await openTooltipOf(row)
		const message = slotIn(tooltip, "sidebar-row-tooltip-message")
		const sentDate = formatSentDate(SPOKEN_AT)

		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-heading"),
		).toHaveTextContent(LONG_TITLE)
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-agents"),
		).toHaveTextContent(FIVE_AGENTS_SEATED)
		await expect(message).toHaveTextContent(LONG_MESSAGE)
		await expectClampedTo(message, 4)
		await expect(slotIn(tooltip, "sidebar-row-tooltip-time")).toHaveTextContent(
			sentDate,
		)
		await expectTooltipCard(tooltip)
		await expectTooltipPastTheSidebarEdge(row, tooltip)
		await expect(row).not.toHaveAttribute("aria-label")
		await expect(row).toHaveAccessibleDescription(
			[LONG_TITLE, FIVE_AGENTS_SEATED, LONG_MESSAGE, sentDate].join("\n"),
		)
	},
})

export const TooltipCarriesALongTitleAndSeveralAgents = meta.story(
	tooltipOfALongTitledRoomStory(),
)

export const TooltipCarriesALongTitleAndSeveralAgentsDark = meta.story(
	tooltipOfALongTitledRoomStory(DARK),
)

export const TooltipOnTheFirstRowStaysBesideTheSidebar = meta.story({
	tags: ["test-only"],
	args: { conversation: LONG_TITLED_ROOM },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const tooltip = await openTooltipOf(row)
		const bubble = tooltip.getBoundingClientRect()
		const held = row.getBoundingClientRect()

		await expect(bubble.height / 2).toBeGreaterThan(held.top + held.height / 2)
		await expect(bubble.top).toBeGreaterThanOrEqual(0)
		await expectTooltipBesideTheSidebar(row, tooltip)
	},
})

export const TooltipWithoutAMessageYet = meta.story({
	args: { conversation: ROOM_WITHOUT_A_MESSAGE },
	decorators: [withRoomAboveTheRow],
	parameters: {
		docs: {
			description: {
				story:
					"The pointer resting on a conversation nobody wrote in yet. Check the tooltip stops at the title and the agents seated: no message, no date, no empty line and no placeholder. Pick `TooltipCarriesALongTitleAndSeveralAgents` for a conversation with a message.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const tooltip = await openTooltipOf(row)
		const card = slotIn(tooltip, "sidebar-row-tooltip")

		await expect(card).toHaveTextContent(/^Fresh roomAgents: Atlas, Beacon$/)
		await expect(card.children).toHaveLength(1)
		await expect(card.querySelector(":empty")).toBeNull()
		await expectTooltipPastTheSidebarEdge(row, tooltip)
		await expect(row).toHaveAccessibleDescription(
			"Fresh room\nAgents: Atlas, Beacon",
		)
	},
})

export const TooltipOnTheIconRail = meta.story({
	args: { conversation: SPOKEN_ROOM },
	decorators: [withRoomAboveTheRow],
	parameters: {
		isOnIconRail: true,
		docs: {
			description: {
				story:
					"The pointer resting on a conversation of the collapsed sidebar. Check the tooltip is the same one the expanded sidebar shows, title, agents, message and date, in place of the name alone, that it sits just past the rail edge and centred on the tile, and that the tile keeps the conversation name as its accessible name.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		const tooltip = await openTooltipOf(row)

		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-heading"),
		).toHaveTextContent(DESK_ROOM.name)
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-agents"),
		).toHaveTextContent("Agents: Atlas, Beacon")
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-message"),
		).toHaveTextContent(DESK_ROOM.lastMessage ?? "")
		await expect(slotIn(tooltip, "sidebar-row-tooltip-time")).toHaveTextContent(
			formatSentDate(SPOKEN_AT),
		)
		await expectTooltipCard(tooltip)
		await expectTooltipPastTheSidebarEdge(row, tooltip)
		await expect(row).toHaveAccessibleName(DESK_ROOM.name)
	},
})

export const TooltipClosesWhileTheRowMenuIsOpen = meta.story({
	tags: ["test-only"],
	args: { conversation: SPOKEN_ROOM },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await openTooltipOf(row)

		rightClick(row)
		await screen.findByRole("menu", {
			name: `Actions for ${DESK_ROOM.name}`,
		})

		await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
		await expect(row).toHaveAttribute("data-trigger-disabled")
	},
})

export const NoTooltipWhileTheRowIsLifted = meta.story({
	tags: ["test-only"],
	args: { conversation: SPOKEN_ROOM, isLifted: true },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)

		await expect(row).toHaveAttribute("data-trigger-disabled")
		await userEvent.tab()
		await expect(row).toHaveFocus()
		await expect(screen.queryByRole("tooltip")).toBeNull()
	},
})
