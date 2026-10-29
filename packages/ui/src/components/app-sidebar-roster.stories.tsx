import {
	type ComponentProps,
	createRef,
	Profiler,
	type Ref,
	useImperativeHandle,
	useState,
} from "react"
import { expect, fireEvent, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectAnswered,
	expectGlazeBorders,
	expectNeedingYou,
	SidebarFrame,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { boxOf, pointerAt } from "@workspace/storybook/tab-drag-gesture"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	PENDING_QUESTION,
	SIDEBAR_BOTS,
	SIDEBAR_CONVERSATIONS,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import type {
	AppSidebarBot,
	AppSidebarSection,
	RosterPin,
} from "@workspace/ui/components/app-sidebar-model"
import { BotRoster } from "@workspace/ui/components/app-sidebar-roster"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { GlazeTheme } from "@workspace/ui/components/glaze-border"

const meta = preview.meta({
	title: "Navigation/AppSidebarRoster",
	component: BotRoster,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<SidebarFrame>
				<Story />
			</SidebarFrame>
		),
	],
	args: {
		bots: SIDEBAR_BOTS,
		conversations: SIDEBAR_CONVERSATIONS,
		sections: [SIDEBAR_SECTION],
		spaces: SIDEBAR_SPACES,
		spaceId: SIDEBAR_SPACES[0].id,
		selectedBotId: ATLAS.id,
		membershipsOf: () => [SIDEBAR_SPACES[0].id],
		onSelectBot: fn(),
		onPinRoster: fn(),
	},
})

export const PinnedZoneThenSortedZone = meta.story({
	tags: ["test-only"],
	play: async ({ canvasElement }) => {
		const [pinned, sorted] = slotsIn(canvasElement, "roster-drop-area").filter(
			(area) =>
				area.parentElement?.closest('[data-slot="roster-drop-area"]') === null,
		)
		await expect(within(pinned).getByText(DESK_ROOM.name)).toBeVisible()
		await expect(within(sorted).getByText(ATLAS.name)).toBeVisible()
		await expect(
			slotIn(canvasElement, "roster-zone-separator"),
		).toBeInTheDocument()
	},
})

const READING_MORE = { hasNextPage: true, isFetchingNextPage: true }

const COMPLETE = { hasNextPage: false, isFetchingNextPage: false }

const expectReadingMore = async (canvasElement: HTMLElement) => {
	const sentinel = slotIn(canvasElement, "list-end-sentinel")
	const sortedArea = slotsIn(canvasElement, "roster-drop-area").at(-1)
	await waitFor(() =>
		expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(1),
	)
	await expect(sortedArea?.compareDocumentPosition(sentinel)).toBe(
		Node.DOCUMENT_POSITION_FOLLOWING,
	)
	await expect(sentinel.closest('[aria-hidden="true"]')).not.toBeNull()
	await expect(
		slotIn(canvasElement, "list-end-skeleton").closest('[aria-hidden="true"]'),
	).not.toBeNull()
}

const expectComplete = async (canvasElement: HTMLElement) => {
	await expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(0)
	await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(0)
}

export const ReadingMore = meta.story({
	tags: ["test-only"],
	args: { listEnd: READING_MORE },
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const ReadingMoreDark = meta.story({
	tags: ["test-only"],
	args: { listEnd: READING_MORE },
	globals: { theme: "dark", theme_layout: "single" },
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const Complete = meta.story({
	tags: ["test-only"],
	args: { listEnd: COMPLETE },
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

export const CompleteDark = meta.story({
	tags: ["test-only"],
	args: { listEnd: COMPLETE },
	globals: { theme: "dark", theme_layout: "single" },
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

const ROOM_QUESTION = "Which of the two layouts goes to review?"

const NEEDING_YOU_ROSTER = {
	bots: [{ ...ATLAS, pendingQuestion: PENDING_QUESTION }, BEACON],
	conversations: [
		DESK_ROOM,
		{
			id: "review-room",
			name: "Review room",
			participants: [ATLAS, BEACON],
			lastMessage: "Both layouts are up.",
			lastSpeaker: BEACON.name,
			timestamp: "09:31",
			pendingQuestion: ROOM_QUESTION,
		},
	],
}

const rosterRowOf = (canvasElement: HTMLElement, name: string) =>
	within(canvasElement)
		.getByText(name)
		.closest<HTMLElement>('[data-slot="sidebar-menu-button"]') as HTMLElement

const expectRosterNeedingYou = async (canvasElement: HTMLElement) => {
	await expect(slotsIn(canvasElement, "roster-row-needs-you")).toHaveLength(2)
	await expectNeedingYou(
		rosterRowOf(canvasElement, ATLAS.name),
		PENDING_QUESTION,
	)
	await expectNeedingYou(
		rosterRowOf(canvasElement, "Review room"),
		ROOM_QUESTION,
	)
	await expectAnswered(rosterRowOf(canvasElement, DESK_ROOM.name))
	await expectAnswered(rosterRowOf(canvasElement, BEACON.name))
}

export const RosterNeedingYou = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: NEEDING_YOU_ROSTER,
	play: ({ canvasElement }) => expectRosterNeedingYou(canvasElement),
})

export const RosterNeedingYouDark = meta.story({
	args: NEEDING_YOU_ROSTER,
	globals: { theme: "dark", theme_layout: "single" },
	play: ({ canvasElement }) => expectRosterNeedingYou(canvasElement),
})

const HOVERED_ROWS = '[data-slot="sidebar-menu-button"]'

const expectBorderOnHoveredAndSelectedRows = async (
	canvasElement: HTMLElement,
	theme: GlazeTheme,
) => {
	await expect(rosterRowOf(canvasElement, ATLAS.name)).toHaveAttribute(
		"data-active",
	)
	await expectGlazeBorders(canvasElement, theme)
}

export const BorderOnHoveredAndSelectedRows = meta.story({
	parameters: {
		pseudo: { hover: HOVERED_ROWS },
		docs: {
			description: {
				story:
					"Every row under the pointer, the selected companion among them: the 40px avatars and subject icons keep the C edge and lip, the 14px pile members their compact edge, with no colour change and no transition. Pick `BorderOnHoveredAndSelectedRowsDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) =>
		expectBorderOnHoveredAndSelectedRows(canvasElement, "light"),
})

export const BorderOnHoveredAndSelectedRowsDark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	parameters: { pseudo: { hover: HOVERED_ROWS } },
	play: ({ canvasElement }) =>
		expectBorderOnHoveredAndSelectedRows(canvasElement, "dark"),
})

const PAST_SKELETON_DELAY_MS = 400

export const Idle = meta.story({
	tags: ["test-only"],
	args: { listEnd: { hasNextPage: true, isFetchingNextPage: false } },
	play: async ({ canvasElement }) => {
		await new Promise((resolve) => setTimeout(resolve, PAST_SKELETON_DELAY_MS))
		const [sentinel] = slotsIn(canvasElement, "list-end-sentinel")
		const sortedArea = slotsIn(canvasElement, "roster-drop-area").at(-1)
		await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(1)
		await expect(sortedArea?.compareDocumentPosition(sentinel as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(0)
	},
})

type BotRosterProps = ComponentProps<typeof BotRoster>

interface RosterHandle {
	show: (props: BotRosterProps) => void
}

interface ReshownRosterProps extends BotRosterProps {
	handle: Ref<RosterHandle>
}

let rosterCommits = 0

const rosterHandle = createRef<RosterHandle>()

const ReshownRoster = ({ handle, ...initial }: ReshownRosterProps) => {
	const [shown, setShown] = useState(initial)
	useImperativeHandle(handle, () => ({ show: setShown }), [])
	return (
		<Profiler
			id="bot-roster"
			onRender={() => {
				rosterCommits += 1
			}}
		>
			<BotRoster {...shown} />
		</Profiler>
	)
}

interface CommittedFiber {
	type: unknown
	key: string | null
	memoizedState: unknown
	child: CommittedFiber | null
	sibling: CommittedFiber | null
}

type KeyedFiber = [CommittedFiber, string | null]

interface HostRootFiber {
	stateNode: { current: CommittedFiber }
}

const ROW_COMPONENTS: unknown[] = [BotRosterRow, ConversationRosterRow]

const isRootKey = (key: string) => key.startsWith("__reactContainer$")

const reactRootOf = (element: HTMLElement): HTMLElement =>
	Object.keys(element).some(isRootKey) || !element.parentElement
		? element
		: reactRootOf(element.parentElement)

const committedRowHooksIn = (canvasElement: HTMLElement) => {
	const root = reactRootOf(canvasElement)
	const rootKey = Object.keys(root).find(isRootKey) ?? ""
	const hostRoot = Reflect.get(root, rootKey) as HostRootFiber
	const hooksByRow = new Map<string | null, unknown>()
	const pending: KeyedFiber[] = [[hostRoot.stateNode.current, null]]
	for (let next = pending.pop(); next; next = pending.pop()) {
		const [fiber, parentKey] = next
		const key = fiber.key ?? parentKey
		if (ROW_COMPONENTS.includes(fiber.type))
			hooksByRow.set(key, fiber.memoizedState)
		if (fiber.sibling) pending.push([fiber.sibling, parentKey])
		if (fiber.child) pending.push([fiber.child, key])
	}
	return hooksByRow
}

const rowsRenderedBy = async (
	canvasElement: HTMLElement,
	props: BotRosterProps,
) => {
	const before = committedRowHooksIn(canvasElement)
	const commitsBefore = rosterCommits
	rosterHandle.current?.show(props)
	await waitFor(() => expect(rosterCommits).toBeGreaterThan(commitsBefore))
	const after = committedRowHooksIn(canvasElement)
	return [...after]
		.filter(([row, hooks]) => before.get(row) !== hooks)
		.map(([row]) => row)
		.toSorted()
}

export const RowRendersOnlyWhenItsOwnPropsChange = meta.story({
	tags: ["test-only"],
	render: (args) => <ReshownRoster {...args} handle={rosterHandle} />,
	play: async ({ args, canvasElement }) => {
		await expect(committedRowHooksIn(canvasElement).size).toBe(3)

		await expect(await rowsRenderedBy(canvasElement, { ...args })).toEqual([])

		const beaconRenamed = {
			...args,
			bots: [ATLAS, { ...BEACON, name: `${BEACON.name} renamed` }],
		}
		await expect(await rowsRenderedBy(canvasElement, beaconRenamed)).toEqual([
			BEACON.id,
		])

		const roomRenamed = {
			...beaconRenamed,
			conversations: [{ ...DESK_ROOM, name: `${DESK_ROOM.name} renamed` }],
		}
		await expect(await rowsRenderedBy(canvasElement, roomRenamed)).toEqual([
			DESK_ROOM.id,
		])

		const selectionMoved = { ...roomRenamed, selectedBotId: BEACON.id }
		await expect(await rowsRenderedBy(canvasElement, selectionMoved)).toEqual([
			ATLAS.id,
			BEACON.id,
		])

		const sameSpaceIdsAnew = {
			...selectionMoved,
			membershipsOf: () => [SIDEBAR_SPACES[0].id],
		}
		await expect(await rowsRenderedBy(canvasElement, sameSpaceIdsAnew)).toEqual(
			[],
		)

		const beaconJoinsEverySpace = {
			...sameSpaceIdsAnew,
			membershipsOf: (botId: string) =>
				botId === BEACON.id
					? SIDEBAR_SPACES.map((space) => space.id)
					: [SIDEBAR_SPACES[0].id],
		}
		await expect(
			await rowsRenderedBy(canvasElement, beaconJoinsEverySpace),
		).toEqual([BEACON.id])
	},
})

const EMBER: AppSidebarBot = {
	...ATLAS,
	id: "ember",
	blot: BLOT_HUES.green,
	name: "Ember",
	title: "Design",
	lastMessage: "The two layouts are side by side in the board.",
	sectionId: SIDEBAR_SECTION.id,
	pinPosition: 3,
}

const DUNE: AppSidebarBot = {
	...ATLAS,
	id: "dune",
	blot: BLOT_HUES.red,
	name: "Dune",
	title: "Review",
	lastMessage: "Two comments left on the migration.",
	sectionId: "review",
	pinPosition: 5,
}

const REVIEW: AppSidebarSection = { id: "review", name: "Review", position: 4 }

const LIFT_ROSTER = {
	bots: [ATLAS, { ...BEACON, pinPosition: 2 }, EMBER, DUNE],
	conversations: [{ ...DESK_ROOM, pinPosition: 0 }],
	sections: [{ ...SIDEBAR_SECTION, position: 1 }, REVIEW],
}

const DARK = { theme: "dark", theme_layout: "single" } as const

const itemOf = (canvasElement: HTMLElement, name: string) =>
	rosterRowOf(canvasElement, name).closest("li") as HTMLElement

const cardOf = (canvasElement: HTMLElement, id: string) => {
	const card = canvasElement.querySelector<HTMLElement>(
		`[data-roster-drop="${id}"]`,
	)
	if (!card) throw new Error(`No drop area for ${id}`)
	return card
}

const headerOf = (canvasElement: HTMLElement, id: string) =>
	slotIn(cardOf(canvasElement, id), "roster-section-trigger")

const middleOf = (box: DOMRect) => ({
	x: box.left + box.width / 2,
	y: box.top + box.height / 2,
})

const carry = (handle: HTMLElement, toY: number) => {
	const from = middleOf(boxOf(handle))
	fireEvent.pointerDown(handle, pointerAt(from.x, from.y))
	fireEvent.pointerMove(handle, pointerAt(from.x, from.y + 8))
	fireEvent.pointerMove(handle, pointerAt(from.x, toY))
	return pointerAt(from.x, toY)
}

const offsetsOf = (nodes: Element[], resting: DOMRect[]) =>
	nodes.map((node, rank) => Math.round(boxOf(node).top - resting[rank].top))

const rowGapOf = (node: Element) =>
	Number.parseFloat(getComputedStyle(node.parentElement as Element).rowGap)

const shiftedIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelectorAll("[data-shift]")

const expectSlidingNeighbour = async (node: Element) =>
	expect(getComputedStyle(node).transitionProperty).toBe(
		matchMedia("(prefers-reduced-motion: reduce)").matches
			? "none"
			: "translate",
	)

const expectLiftedSurface = async (node: Element) => {
	await expect(node).toHaveAttribute("data-lifted", "true")
	await expect(getComputedStyle(node).pointerEvents).toBe("none")
	await expect(getComputedStyle(node).boxShadow).not.toBe("none")
	await expect(getComputedStyle(node).backgroundColor).not.toBe(
		"rgba(0, 0, 0, 0)",
	)
}

const playLiftedRowWithNeighboursShifted = async ({
	args,
	canvasElement,
}: {
	args: BotRosterProps
	canvasElement: HTMLElement
}) => {
	const beacon = itemOf(canvasElement, BEACON.name)
	const ember = itemOf(canvasElement, EMBER.name)
	const still = [
		itemOf(canvasElement, DESK_ROOM.name),
		itemOf(canvasElement, DUNE.name),
		itemOf(canvasElement, ATLAS.name),
		slotIn(canvasElement, "roster-zone-separator"),
	]
	const [beaconAt, emberAt] = [beacon, ember].map(boxOf)
	const stillAt = still.map(boxOf)
	const step = Math.round(beaconAt.height + rowGapOf(beacon))

	carry(rosterRowOf(canvasElement, BEACON.name), middleOf(emberAt).y)

	await waitFor(() =>
		expect(Math.round(boxOf(ember).top - emberAt.top)).toBe(-step),
	)
	await expect(ember).toHaveAttribute("data-shift", "start")
	await expect(offsetsOf(still, stillAt)).toEqual(still.map(() => 0))
	await expect(Math.round(boxOf(beacon).top - beaconAt.top)).toBe(step)
	await expect(Math.round(boxOf(beacon).left - beaconAt.left)).toBe(0)
	await expectLiftedSurface(beacon)
	await expectSlidingNeighbour(ember)
	await expect(args.onPinRoster).not.toHaveBeenCalled()
}

export const LiftedRowWithNeighboursShifted = meta.story({
	args: LIFT_ROSTER,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row held one slot down, light. Check Beacon lifts in place on the panel fill with a shadow under it and rides the pointer only up and down, that Ember slid up by Beacon's own height plus the row gap to open the gap, and that Launch room, Dune, Atlas and the rule between the zones kept their place. Pick `LiftedRowWithNeighboursShiftedDark` for the dark theme.",
			},
		},
	},
	play: playLiftedRowWithNeighboursShifted,
})

export const LiftedRowWithNeighboursShiftedDark = meta.story({
	args: LIFT_ROSTER,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row held one slot down, dark: Beacon lifted on the dark panel fill, Ember slid up. Pick `LiftedRowWithNeighboursShifted` for the light theme.",
			},
		},
	},
	play: playLiftedRowWithNeighboursShifted,
})

const playLiftedSection = async ({
	args,
	canvasElement,
}: {
	args: BotRosterProps
	canvasElement: HTMLElement
}) => {
	const review = cardOf(canvasElement, REVIEW.id)
	const desk = cardOf(canvasElement, SIDEBAR_SECTION.id)
	const room = itemOf(canvasElement, DESK_ROOM.name)
	const [reviewAt, deskAt, roomAt] = [review, desk, room].map(boxOf)
	const step = Math.round(reviewAt.height + rowGapOf(review))

	carry(
		headerOf(canvasElement, REVIEW.id),
		middleOf(boxOf(headerOf(canvasElement, SIDEBAR_SECTION.id))).y,
	)

	await waitFor(() =>
		expect(Math.round(boxOf(desk).top - deskAt.top)).toBe(step),
	)
	await expect(desk).toHaveAttribute("data-shift", "end")
	await expect(Math.round(boxOf(review).top)).toBe(Math.round(deskAt.top))
	await expect(Math.round(boxOf(room).top - roomAt.top)).toBe(0)
	await expect(itemOf(canvasElement, DUNE.name)).not.toHaveAttribute(
		"data-shift",
	)
	await expectLiftedSurface(review)
	await expectSlidingNeighbour(desk)
	await expect(args.onPinRoster).not.toHaveBeenCalled()
}

export const LiftedSection = meta.story({
	args: LIFT_ROSTER,
	parameters: {
		docs: {
			description: {
				story:
					"A section held one slot up by its header, light. Check Review lifts whole, header and Dune together, on the panel fill with a shadow, and sits where Desk stood, that Desk slid down by Review's height plus the gap between sections, and that Launch room above them kept its place. Pick `LiftedSectionDark` for the dark theme.",
			},
		},
	},
	play: playLiftedSection,
})

export const LiftedSectionDark = meta.story({
	args: LIFT_ROSTER,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A section held one slot up, dark: Review lifted whole, Desk slid down. Pick `LiftedSection` for the light theme.",
			},
		},
	},
	play: playLiftedSection,
})

const playDragOverTheSortedZone = async ({
	args,
	canvasElement,
}: {
	args: BotRosterProps
	canvasElement: HTMLElement
}) => {
	const sorted = cardOf(canvasElement, "__sorted__")
	const pinned = cardOf(canvasElement, "__pinned__")
	const separator = slotIn(canvasElement, "roster-zone-separator")
	const beacon = itemOf(canvasElement, BEACON.name)
	const separatorAt = boxOf(separator)

	carry(
		rosterRowOf(canvasElement, BEACON.name),
		middleOf(boxOf(itemOf(canvasElement, ATLAS.name))).y,
	)

	await waitFor(() => expect(sorted).toHaveAttribute("data-landing", "true"))
	await expect(getComputedStyle(sorted).backgroundColor).not.toBe(
		"rgba(0, 0, 0, 0)",
	)
	await expect(shiftedIn(canvasElement)).toHaveLength(0)
	await expect(Math.round(boxOf(separator).top)).toBe(
		Math.round(separatorAt.top),
	)
	await expect(boxOf(beacon).bottom).toBeLessThanOrEqual(
		boxOf(pinned).bottom + 0.5,
	)
	await expectLiftedSurface(beacon)
	await expect(args.onPinRoster).not.toHaveBeenCalled()
}

export const DragOverTheSortedZone = meta.story({
	args: LIFT_ROSTER,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row held over the activity-sorted zone, light. That zone has no order to drop into, so the whole zone lightens and no gap opens anywhere: Atlas keeps its place, every pinned row is back at rest, and the rule between the zones never moves. Check Beacon stays lifted inside the pinned zone, stopped at its bottom edge however far the pointer goes. A release here unpins it. Pick `DragOverTheSortedZoneDark` for the dark theme.",
			},
		},
	},
	play: playDragOverTheSortedZone,
})

export const DragOverTheSortedZoneDark = meta.story({
	args: LIFT_ROSTER,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row held over the activity-sorted zone, dark: the zone lightened whole, no gap. Pick `DragOverTheSortedZone` for the light theme.",
			},
		},
	},
	play: playDragOverTheSortedZone,
})

const COLLAPSED_DESK = {
	...LIFT_ROSTER,
	collapsedSectionIds: [SIDEBAR_SECTION.id],
}

const playCollapsedSectionSkipped = async ({
	args,
	canvasElement,
}: {
	args: BotRosterProps
	canvasElement: HTMLElement
}) => {
	const desk = cardOf(canvasElement, SIDEBAR_SECTION.id)
	const review = cardOf(canvasElement, REVIEW.id)
	const hidden = [BEACON, EMBER].map(({ name }) => itemOf(canvasElement, name))
	const handle = rosterRowOf(canvasElement, DESK_ROOM.name)
	const gutter = (boxOf(desk).bottom + boxOf(review).top) / 2

	const released = carry(handle, gutter)
	await waitFor(() => expect(desk).toHaveAttribute("data-shift", "start"))
	for (const row of hidden) await expect(row).not.toHaveAttribute("data-shift")
	await expect(review).not.toHaveAttribute("data-shift")
	await expect(desk).not.toHaveAttribute("data-landing")
	fireEvent.pointerUp(handle, released)
	await expect(args.onPinRoster).toHaveBeenCalledWith(SIDEBAR_SPACES[0].id, [
		{ id: SIDEBAR_SECTION.id, sectionId: null },
		{ id: BEACON.id, sectionId: SIDEBAR_SECTION.id },
		{ id: EMBER.id, sectionId: SIDEBAR_SECTION.id },
		{ id: DESK_ROOM.id, sectionId: null },
		{ id: REVIEW.id, sectionId: null },
		{ id: DUNE.id, sectionId: REVIEW.id },
	])

	carry(handle, gutter)
	await waitFor(() => expect(desk).toHaveAttribute("data-shift", "start"))
}

export const CollapsedSectionSkipped = meta.story({
	args: COLLAPSED_DESK,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row carried past a collapsed section, light. The rows Desk hides are no slots: the whole Desk card slides up as one under Launch room, Beacon and Ember never move inside it, and the gap opens straight under Desk. Check the release in the gutter files Launch room after Desk and both of its hidden rows, then the row lifted again and held there. Pick `CollapsedSectionSkippedDark` for the dark theme.",
			},
		},
	},
	play: playCollapsedSectionSkipped,
})

export const CollapsedSectionSkippedDark = meta.story({
	args: COLLAPSED_DESK,
	globals: DARK,
	parameters: {
		docs: {
			description: {
				story:
					"A pinned row carried past a collapsed section, dark: Desk slides up whole, its hidden rows skipped. Pick `CollapsedSectionSkipped` for the light theme.",
			},
		},
	},
	play: playCollapsedSectionSkipped,
})

const pinnedIn = (props: BotRosterProps, pins: RosterPin[]) => {
	const rankOf = (id: string) => pins.findIndex((pin) => pin.id === id)
	const placed = <Row extends { id: string }>(row: Row) => {
		const rank = rankOf(row.id)
		return {
			...row,
			pinPosition: rank < 0 ? null : rank,
			sectionId: rank < 0 ? null : pins[rank].sectionId,
		}
	}
	return {
		...props,
		bots: props.bots.map(placed),
		conversations: props.conversations.map(placed),
		sections: props.sections.map((section) => ({
			...section,
			position: rankOf(section.id),
		})),
	}
}

const LiveRoster = (args: BotRosterProps) => {
	const [shown, setShown] = useState(args)
	return (
		<BotRoster
			{...shown}
			onPinRoster={(spaceId, pins) => {
				args.onPinRoster?.(spaceId, pins)
				setShown((held) => pinnedIn(held, pins))
			}}
		/>
	)
}

const moveAnnouncement = () =>
	document.querySelector('[data-slot="roster-move-announcement"]')

export const KeyboardMovesAPinnedRowOrSection = meta.story({
	tags: ["test-only"],
	args: LIFT_ROSTER,
	render: (args) => <LiveRoster {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Moving a pinned row or a section from the keyboard, the pattern of the title bar tabs. Check Option+Down on the focused Launch room files it first in Desk, keeps the focus on it and announces its new place politely, that Option+Up takes it back out, that plain arrows move nothing, and that Option+Up on the Review header moves the whole section above Desk with the focus kept on its header.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const room = () => rosterRowOf(canvasElement, DESK_ROOM.name)

		room().focus()
		await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}")
		await expect(args.onPinRoster).toHaveBeenCalledTimes(1)
		await waitFor(() =>
			expect(room().closest('[data-roster-drop="desk"]')).not.toBeNull(),
		)
		await expect(room()).toHaveFocus()
		await expect(moveAnnouncement()).toHaveAttribute("aria-live", "polite")
		await expect(moveAnnouncement()).toHaveTextContent(
			`${DESK_ROOM.name} moved to position 1 of 3 in ${SIDEBAR_SECTION.name}`,
		)

		await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}")
		await expect(args.onPinRoster).toHaveBeenCalledTimes(2)
		await waitFor(() =>
			expect(room().closest('[data-roster-drop="desk"]')).toBeNull(),
		)
		await expect(room()).toHaveFocus()
		await expect(moveAnnouncement()).toHaveTextContent(
			`${DESK_ROOM.name} moved to position 1 of 3`,
		)

		await userEvent.keyboard("{ArrowDown}")
		await expect(args.onPinRoster).toHaveBeenCalledTimes(2)

		const review = headerOf(canvasElement, REVIEW.id)
		review.focus()
		await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}")
		await expect(args.onPinRoster).toHaveBeenCalledTimes(3)
		await waitFor(() =>
			expect(
				cardOf(canvasElement, REVIEW.id).compareDocumentPosition(
					cardOf(canvasElement, SIDEBAR_SECTION.id),
				),
			).toBe(Node.DOCUMENT_POSITION_FOLLOWING),
		)
		await expect(headerOf(canvasElement, REVIEW.id)).toHaveFocus()
		await expect(moveAnnouncement()).toHaveTextContent(
			`${REVIEW.name} moved to position 2 of 3`,
		)
	},
})
