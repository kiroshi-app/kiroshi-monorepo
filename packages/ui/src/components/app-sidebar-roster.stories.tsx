import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SidebarFrame, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	ATLAS,
	DESK_ROOM,
	SIDEBAR_BOTS,
	SIDEBAR_CONVERSATIONS,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
} from "@workspace/ui/components/app-sidebar.fixtures"
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
