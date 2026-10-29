import { useRef } from "react"
import { expect, mocked, spyOn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SidebarFrame, slotIn } from "@workspace/storybook/story-utils"
import type {
	AppSidebarBot,
	AppSidebarConversation,
	AppSidebarSection,
} from "@workspace/ui/components/app-sidebar"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
	SIDEBAR_BOTS,
	SIDEBAR_CONVERSATIONS,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { useRosterDrag } from "@workspace/ui/components/app-sidebar-roster-drag"
import { rosterEntriesOf } from "@workspace/ui/components/app-sidebar-roster-layout"
import { PinnedZone } from "@workspace/ui/components/app-sidebar-roster-menu"

const SECTIONS = [SIDEBAR_SECTION]

const SANDWICHED_SECTIONS = [{ ...SIDEBAR_SECTION, position: 1 }]

const UNIQUE_KEY_WARNING = 'unique "key" prop'

type LivePinnedZoneProps = {
	bots?: AppSidebarBot[]
	conversations?: AppSidebarConversation[]
	sections?: AppSidebarSection[]
}

const LivePinnedZone = ({
	bots = SIDEBAR_BOTS,
	conversations = SIDEBAR_CONVERSATIONS,
	sections = SECTIONS,
}: LivePinnedZoneProps) => {
	const entries = rosterEntriesOf({
		bots,
		conversations,
		naming: null,
		sections,
	})
	const frameRef = useRef<HTMLDivElement>(null)
	const drag = useRosterDrag({
		collapsedSectionIds: [],
		containerRef: frameRef,
		entries,
		onLand: () => undefined,
		onMoveSection: () => undefined,
	})

	return (
		<PinnedZone
			collapsedSectionIds={[]}
			drag={drag}
			entries={entries}
			onMoveSection={() => undefined}
			rows={{
				lift: drag.rosterLift,
				liftedId: drag.liftedId,
				membershipsOf: () => [],
				onMoveKey: undefined,
				sections,
				shiftOf: drag.rowShiftOf,
				keepFocus: drag.keepFocus,
				spaces: SIDEBAR_SPACES,
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Navigation/AppSidebarRosterMenu",
	component: PinnedZone,
	tags: ["test-only"],
	parameters: { layout: "fullscreen" },
})

export const LooseRunSectionThenLooseRun = meta.story({
	beforeEach: () => {
		const consoleError = spyOn(console, "error")
		return () => consoleError.mockRestore()
	},
	render: () => (
		<SidebarFrame>
			<LivePinnedZone
				bots={[{ ...ATLAS, pinPosition: 0 }, BEACON]}
				conversations={[{ ...DESK_ROOM, pinPosition: 2 }]}
				sections={SANDWICHED_SECTIONS}
			/>
		</SidebarFrame>
	),
	play: async ({ canvasElement }) => {
		const zone = within(canvasElement)
		const [atlas, beacon, deskRoom] = [ATLAS, BEACON, DESK_ROOM].map((row) =>
			zone.getByText(row.name),
		)
		await expect(atlas.compareDocumentPosition(beacon)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(beacon.compareDocumentPosition(deskRoom)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		const keyWarnings = mocked(console.error).mock.calls.filter((call) =>
			call.some((part) => String(part).includes(UNIQUE_KEY_WARNING)),
		)
		await expect(keyWarnings).toEqual([])
	},
})

export const PinnedSectionThenPinnedConversation = meta.story({
	render: () => (
		<SidebarFrame>
			<LivePinnedZone />
		</SidebarFrame>
	),
	play: async ({ canvasElement }) => {
		const zone = within(canvasElement)
		await expect(
			slotIn(canvasElement, "roster-section-name"),
		).toHaveTextContent(SIDEBAR_SECTION.name)
		await expect(zone.getByText(BEACON.name)).toBeInTheDocument()
		await expect(zone.getByText(DESK_ROOM.name)).toBeVisible()
	},
})
