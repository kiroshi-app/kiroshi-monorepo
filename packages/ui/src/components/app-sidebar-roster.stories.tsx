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
import { SidebarFrame, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	SIDEBAR_BOTS,
	SIDEBAR_CONVERSATIONS,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { ConversationRosterRow } from "@workspace/ui/components/app-sidebar-conversation-row"
import { BotRoster } from "@workspace/ui/components/app-sidebar-roster"

const meta = preview.meta({
	title: "Navigation/AppSidebarRoster",
	component: BotRoster,
	tags: ["test-only"],
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
	args: { listEnd: READING_MORE },
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const ReadingMoreDark = meta.story({
	args: { listEnd: READING_MORE },
	globals: { theme: "dark", theme_layout: "single" },
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const Complete = meta.story({
	args: { listEnd: COMPLETE },
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

export const CompleteDark = meta.story({
	args: { listEnd: COMPLETE },
	globals: { theme: "dark", theme_layout: "single" },
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

const PAST_SKELETON_DELAY_MS = 400

export const Idle = meta.story({
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

const STABLE_MEMBERSHIPS = [SIDEBAR_SPACES[0].id]

export const RowRendersOnlyWhenItsOwnPropsChange = meta.story({
	args: { membershipsOf: () => STABLE_MEMBERSHIPS },
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

		await expect(
			await rowsRenderedBy(canvasElement, {
				...roomRenamed,
				selectedBotId: BEACON.id,
			}),
		).toEqual([ATLAS.id, BEACON.id])
	},
})
