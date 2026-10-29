import {
	expect,
	fireEvent,
	fn,
	screen,
	userEvent,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectAnswered,
	expectNeedingYou,
	expectQuestionCutInsideTheRow,
	glyphIn,
	SidebarFrame,
	shown,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	LONG_PENDING_QUESTION,
	PENDING_QUESTION,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationIcons } from "@workspace/ui/components/icons"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/components/sidebar-menu-row"
import { SIDEBAR_MIN_WIDTH } from "@workspace/ui/components/sidebar-resize"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"

const meta = preview.meta({
	title: "Navigation/AppSidebarConversationRow",
	component: ConversationRosterRow,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story, { parameters }) => (
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

	await expect(icon).toHaveAttribute("aria-hidden", "true")
	await expect([cell.width, cell.height]).toEqual([40, 40])
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

const expectNeutralCell = async (row: HTMLElement) => {
	const icon = slotIn(row, "conversation-subject-icon")
	await expect(slotIn(row, "outlined-hexagon-face").style.fill).toBe(
		"var(--conversation-icon)",
	)
	await expect(icon.style.color).toBe("var(--conversation-icon-foreground)")
	await expect(icon).not.toHaveAttribute("data-hue")
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
		await expectNeutralCell(row)
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
		await expectNeutralCell(row)
		await expect(glyphIn(row, ConversationIcons.ShieldKey)).not.toBeNull()
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

export const OpenRowWithMissionStrips = meta.story({
	tags: ["test-only"],
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: {
		isSelected: true,
		conversation: {
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
		},
	},
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expect(row).toHaveAttribute("aria-current", "page")
		await expect(getComputedStyle(row).backgroundColor).not.toBe(TRANSPARENT)
		await expectRowAnatomy(row)
		await expectKnockoutCutToTheRow(row)
		const strips = slotsIn(row, "bot-mission-strip")
		await expect(strips).toHaveLength(2)
		for (const strip of strips) {
			await expect(strip.getBoundingClientRect().top).toBeGreaterThan(
				boxOf(row, "conversation-subject-icon").bottom,
			)
		}
	},
})

export const WorkingConversationKeepsItsTimestamp = meta.story({
	tags: ["test-only"],
	play: async ({ canvas, canvasElement }) => {
		const row = rowIn(canvasElement)
		await expect(
			slotIn(slotIn(row, "roster-row-preview"), "text-shimmer"),
		).toBeVisible()
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
			DESK_ROOM.timestamp ?? "",
		)
		await expect(canvas.getAllByRole("button")).toEqual([row])
		await expectPileWhole(row, canvasElement)
	},
})

const DESK_ROOM_NEEDING_YOU = {
	...DESK_ROOM,
	badge: "attention" as const,
	pendingQuestion: PENDING_QUESTION,
}

const DARK = { theme: "dark", theme_layout: "single" }

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
