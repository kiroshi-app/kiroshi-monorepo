import {
	type ComponentProps,
	createRef,
	Profiler,
	type Ref,
	useImperativeHandle,
	useState,
} from "react"
import { expect, fn, waitFor, within } from "storybook/test"

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
import { BotRoster } from "@workspace/ui/components/app-sidebar-roster"
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
