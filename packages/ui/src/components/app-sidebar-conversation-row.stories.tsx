import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	glyphIn,
	SidebarFrame,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	SIDEBAR_SECTION,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { ConversationIcons } from "@workspace/ui/components/icons"
import { SIDEBAR_MIN_WIDTH } from "@workspace/ui/components/sidebar-resize"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

const meta = preview.meta({
	title: "Navigation/AppSidebarConversationRow",
	component: ConversationRosterRow,
	tags: ["test-only"],
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
	play: async ({ args, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(within(row).getByText(DESK_ROOM.name)).toBeVisible()
		await expect(slotIn(canvasElement, "sidebar-menu-item")).toHaveAttribute(
			"data-roster-drop",
		)
		row.click()
		await expect(args.onSelect).toHaveBeenCalledWith(DESK_ROOM.id)
	},
})

const CINDER: AppSidebarBot = { id: "cinder", name: "Cinder", blot: "red" }
const DUNE: AppSidebarBot = { id: "dune", name: "Dune", blot: "green" }
const EMBER: AppSidebarBot = { id: "ember", name: "Ember", blot: "pink" }

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

const expectCellWears = async (row: HTMLElement, token: string) => {
	const cell = slotIn(row, "outlined-hexagon-face")
	await expect(cell.style.fill).toBe(`var(${token})`)
	await expect(slotIn(row, "conversation-subject-icon").style.color).toBe(
		`var(${token}-foreground)`,
	)
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
	parameters: { sidebarWidth: SIDEBAR_MIN_WIDTH },
	args: { conversation: roomOf(FIVE_BOTS) },
	play: ({ canvasElement }) =>
		expectPileWholeAtTheSidebarWidth(canvasElement, SIDEBAR_MIN_WIDTH),
})

export const PileWholeAtTheDefaultSidebar = meta.story({
	parameters: { sidebarWidth: DEFAULT_SIDEBAR_WIDTH },
	args: { conversation: roomOf(FIVE_BOTS) },
	play: ({ canvasElement }) =>
		expectPileWholeAtTheSidebarWidth(canvasElement, DEFAULT_SIDEBAR_WIDTH),
})

export const RowWithoutIconOrColour = meta.story({
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expectCellWears(row, "--conversation-icon")
		await expect(glyphIn(row, ConversationIcons.MessageSquare)).not.toBeNull()
		await expect(row).toHaveAccessibleName(
			expect.stringMatching(new RegExp(`^${DESK_ROOM.name}`)),
		)
	},
})

export const RedShieldKeyRow = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "red", icon: "ShieldKey" } },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expectCellWears(row, "--conversation-icon-red")
		await expect(glyphIn(row, ConversationIcons.ShieldKey)).not.toBeNull()
	},
})

export const RowInRed = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "red" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-red"),
})

export const RowInYellow = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "yellow" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-yellow"),
})

export const RowInGreen = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "green" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-green"),
})

export const RowInCyan = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "cyan" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-cyan"),
})

export const RowInBlue = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "blue" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-blue"),
})

export const RowInPurple = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "purple" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-purple"),
})

export const RowInPink = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "pink" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-pink"),
})

export const RowInOrange = meta.story({
	args: { conversation: { ...DESK_ROOM, color: "orange" } },
	play: async ({ canvasElement }) =>
		expectCellWears(rowIn(canvasElement), "--conversation-icon-orange"),
})

export const RowWithOneBot = meta.story({
	args: { conversation: roomOf([ATLAS]) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(1)
	},
})

export const RowWithTwoBots = meta.story({
	args: { conversation: roomOf([ATLAS, BEACON]) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(2)
		await expectKnockoutCutToTheRow(row)
	},
})

export const RowWithThreeBots = meta.story({
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
	args: { conversation: roomOf(FIVE_BOTS) },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectRowAnatomy(row)
		await expect(slotsIn(row, "conversation-bot-pile-bot")).toHaveLength(2)
		await expect(
			slotIn(row, "conversation-bot-pile-overflow"),
		).toHaveTextContent("+3")
		await expect(within(row).getByRole("img", { name: "+3" })).toBe(
			slotIn(row, "conversation-bot-pile"),
		)
	},
})

export const RowWithABadgeAndAPile = meta.story({
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
	args: { conversation: roomOf(FIVE_BOTS), isSelected: false },
	play: async ({ canvasElement }) => {
		const row = rowIn(canvasElement)
		await expectKnockoutCutToTheRow(row)
		await userEvent.hover(row)
		await expectKnockoutCutToTheRow(row)
	},
})

export const OpenRowWithMissionStrips = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: {
		isSelected: true,
		conversation: {
			...roomOf([ATLAS, BEACON, CINDER]),
			color: "blue",
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

const liftDown = fn()

const LIFT_SPYING_ON_DOWN: Lifter = {
	...STILL_LIFT,
	handlersFor: (id) => ({
		...STILL_LIFT.handlersFor(id),
		onPointerDown: liftDown,
	}),
}

const STOP_DESK_ROOM = `Stop ${DESK_ROOM.name}`

export const WorkingConversationStopsWithItsId = meta.story({
	args: { lift: LIFT_SPYING_ON_DOWN, onStop: fn() },
	play: async ({ args, canvas, canvasElement }) => {
		const row = rowIn(canvasElement)
		const stopButton = canvas.getByRole("button", { name: STOP_DESK_ROOM })
		const stop = stopButton.getBoundingClientRect()
		const pile = boxOf(row, "conversation-bot-pile")
		await expectPileWhole(row, canvasElement)
		await expect(
			pile.right <= stop.left ||
				stop.right <= pile.left ||
				pile.bottom <= stop.top ||
				stop.bottom <= pile.top,
		).toBe(true)
		await userEvent.click(stopButton)
		await expect(args.onStop).toHaveBeenCalledOnce()
		await expect(args.onStop).toHaveBeenCalledWith(DESK_ROOM.id)
		await expect(args.onSelect).not.toHaveBeenCalled()
		await expect(liftDown).not.toHaveBeenCalled()
		await expect(within(document.body).queryByRole("menu")).toBeNull()
	},
})

export const IdleConversationGivenOnStopHasNoStop = meta.story({
	args: { conversation: roomOf([ATLAS]), onStop: fn() },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: /^Stop / })).toBeNull()
	},
})
