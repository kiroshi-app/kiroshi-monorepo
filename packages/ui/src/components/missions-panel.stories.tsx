import type { CSSProperties } from "react"
import { expect, fireEvent, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	A11Y_FLOATING_FOCUS_GUARDS,
	expectClickModifiers,
	expectSkeletonFilledTo,
	mergeA11y,
	shown,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { MissionCardWrap } from "@workspace/ui/components/mission-card"
import { MissionMenu } from "@workspace/ui/components/mission-menu"
import {
	LONG_TITLE_MISSION,
	NO_SPACE_MISSIONS,
	SPACE_EARLIER_TODAY_MISSIONS,
	SPACE_LONG_TITLE_MISSIONS,
	SPACE_OPEN_MISSIONS,
	SPACE_WAITING_MISSIONS,
} from "@workspace/ui/components/missions.fixtures"
import { MissionsFeedSkeleton } from "@workspace/ui/components/missions-feed-skeleton"
import {
	MissionsPanel,
	type MissionsPanelProps,
} from "@workspace/ui/components/missions-panel"
import { Sidebar, SidebarProvider } from "@workspace/ui/components/ui/sidebar"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const PANEL_WIDTH = 304

const PANEL_PADDING_BLOCK_END = 12

const PANEL_STYLE = { "--sidebar-width": `${PANEL_WIDTH}px` } as CSSProperties

const renderInPanel = (args: MissionsPanelProps) => (
	<SidebarProvider style={PANEL_STYLE}>
		<Sidebar className="px-2 py-3" collapsible="none">
			<MissionsPanel {...args} />
		</Sidebar>
	</SidebarProvider>
)

const shownRows = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "mission-card-row").filter((row) =>
		row.checkVisibility(),
	)

const withMissionMenu: MissionCardWrap = (card) => (
	<MissionMenu
		hasBranch={false}
		hasPullRequest={false}
		hasWorkspacePath={false}
		onAnswer={fn()}
		onClose={fn()}
		onCopy={fn()}
		onMessageAgent={fn()}
		onOpen={fn()}
		onOpenPullRequest={fn()}
		onReopen={fn()}
		onStopAgent={fn()}
		state={card.props.state}
	>
		{card}
	</MissionMenu>
)

const firstOpenMission = () => {
	const [mission] = SPACE_OPEN_MISSIONS
	if (!mission) throw new Error("The fixture holds no mission")
	return mission
}

const WIRED_BY_THE_APP =
	"`AppSidebar` mounts the panel in its Missions tab with the space-wide missions its host hands down."

const meta = preview.meta({
	title: "Navigation/MissionsPanel",
	component: MissionsPanel,
	render: renderInPanel,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				component:
					"The body of the Missions tab: every mission of the space in the groups the Activity panel already draws, Waiting on you, In progress, then Earlier today folded. A row is `MissionCard` at row density, and activating it reports the mission and the conversation it belongs to.",
			},
		},
	},
	args: {
		open: SPACE_OPEN_MISSIONS,
		earlierToday: SPACE_EARLIER_TODAY_MISSIONS,
		onOpen: fn(),
	},
})

export const Default = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story: `The three groups as the V1f artboard draws them: two missions waiting on the reader, three in progress, four closed earlier today and folded. Check each head carries its count, that Earlier today reports itself collapsed and hides its rows. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const heads = ["Waiting on you", "In progress", "Earlier today"].map(
			(name) => canvas.getByRole("heading", { name: new RegExp(name) }),
		)
		await expect(heads[0]?.compareDocumentPosition(heads[1] as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(heads[1]?.compareDocumentPosition(heads[2] as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(
			within(slotIn(canvasElement, "missions-waiting")).getByText("2"),
		).toBeVisible()
		await expect(
			within(slotIn(canvasElement, "missions-inProgress")).getByText("3"),
		).toBeVisible()
		const fold = canvas.getByRole("button", { name: /Earlier today/ })
		await expect(fold).toHaveTextContent("4")
		await expect(fold).toHaveAttribute("aria-expanded", "false")
		await expect(shownRows(canvasElement)).toHaveLength(
			SPACE_OPEN_MISSIONS.length,
		)
	},
})

export const Empty = meta.story({
	args: { open: NO_SPACE_MISSIONS, earlierToday: NO_SPACE_MISSIONS },
	parameters: {
		docs: {
			description: {
				story: `A space where no companion has opened a mission yet. Check no group head is drawn and the empty state names what will show up here. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "No missions yet" }),
		).toBeVisible()
		await expect(
			canvas.getByText("Missions your agents open in this space show up here."),
		).toBeVisible()
		await expect(slotsIn(canvasElement, "mission-card-row")).toHaveLength(0)
	},
})

export const Loading = meta.story({
	args: {
		open: NO_SPACE_MISSIONS,
		earlierToday: NO_SPACE_MISSIONS,
		skeleton: <MissionsFeedSkeleton />,
	},
	parameters: {
		docs: {
			description: {
				story: `The first read of the space feed has not answered yet: \`skeleton\` takes the place of the groups, so the panel never claims the space holds no mission before the feed is known. Check the empty state is absent and the skeleton runs to the bottom of the panel. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "bottom")
		await expect(
			canvas.queryByRole("heading", { name: "No missions yet" }),
		).not.toBeInTheDocument()
		await expect(
			slotIn(canvasElement, "missions-panel-skeleton").getBoundingClientRect()
				.bottom,
		).toBeCloseTo(
			slotIn(canvasElement, "sidebar").getBoundingClientRect().bottom -
				PANEL_PADDING_BLOCK_END,
			0,
		)
	},
})

export const OneGroup = meta.story({
	args: { open: SPACE_WAITING_MISSIONS, earlierToday: NO_SPACE_MISSIONS },
	parameters: {
		docs: {
			description: {
				story: `Only missions waiting on the reader. Check the groups with nothing in them are left out rather than drawn empty. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Waiting on you" }),
		).toBeVisible()
		await expect(
			canvas.queryByRole("heading", { name: "In progress" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: /Earlier today/ }),
		).not.toBeInTheDocument()
	},
})

export const EarlierTodayUnfolded = meta.story({
	parameters: {
		docs: {
			description: {
				story: `Earlier today opened from its head. Check the head reports itself expanded and its four closed missions show, muted, under the open groups. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const fold = canvas.getByRole("button", { name: /Earlier today/ })
		await userEvent.click(fold)
		await expect(fold).toHaveAttribute("aria-expanded", "true")
		await expect(shownRows(canvasElement)).toHaveLength(
			SPACE_OPEN_MISSIONS.length + SPACE_EARLIER_TODAY_MISSIONS.length,
		)
	},
})

export const Toggling = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Earlier today opened then closed again. Check a second activation hides its rows.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const fold = canvas.getByRole("button", { name: /Earlier today/ })
		await userEvent.click(fold)
		await userEvent.click(fold)
		await expect(fold).toHaveAttribute("aria-expanded", "false")
		await expect(shownRows(canvasElement)).toHaveLength(
			SPACE_OPEN_MISSIONS.length,
		)
	},
})

export const OpeningAMission = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A mission picked by pointer then by keyboard. Check both report the mission and the conversation it belongs to.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const mission = firstOpenMission()
		await userEvent.click(canvas.getByText(mission.objective))
		await expect(args.onOpen).toHaveBeenCalledWith(
			mission.id,
			mission.conversationId,
			NO_CLICK_MODIFIERS,
		)

		await userEvent.keyboard("{Enter}")
		await expect(args.onOpen).toHaveBeenCalledTimes(2)
		await expect(args.onOpen).toHaveBeenLastCalledWith(
			mission.id,
			mission.conversationId,
			NO_CLICK_MODIFIERS,
		)
	},
})

export const OpensWithClickModifiers = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A mission row clicked every way a host can tell apart. Check that the panel hands its caller the mission and its conversation with the button and the keys of that click, middle with the keys held, Cmd, Ctrl or Shift alone, none on a plain click or Enter, and nothing on a right-click.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const mission = firstOpenMission()
		await expectClickModifiers({
			target: canvas
				.getByText(mission.objective)
				.closest("button") as HTMLElement,
			callback: args.onOpen,
			reported: [mission.id, mission.conversationId],
			userEvent,
		})
	},
})

export const LongTitle = meta.story({
	tags: ["test-only"],
	args: { open: SPACE_LONG_TITLE_MISSIONS, earlierToday: NO_SPACE_MISSIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A mission whose objective runs past the row at 304px. Check it stays on one line and ends in an ellipsis.",
			},
		},
	},
	play: async ({ canvas }) => {
		const title = canvas.getByText(LONG_TITLE_MISSION.objective)
		const style = getComputedStyle(title)
		await expect(style.textOverflow).toBe("ellipsis")
		await expect(style.whiteSpace).toBe("nowrap")
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
	},
})

export const SelectedRow = meta.story({
	args: { openMissionId: SPACE_OPEN_MISSIONS[2]?.id },
	parameters: {
		docs: {
			description: {
				story: `The mission open in the content, drawn active in its group like the open conversation row. Check only that row carries \`aria-current="page"\`. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const current = canvasElement.querySelectorAll('[aria-current="page"]')
		await expect(current).toHaveLength(1)
		await expect(current[0]).toHaveAttribute(
			"data-opens",
			SPACE_OPEN_MISSIONS[2]?.id,
		)
		await expect(current[0]).toHaveAttribute("data-active")
	},
})

export const NoSelectedRow = meta.story({
	tags: ["test-only"],
	args: { openMissionId: null },
	parameters: {
		docs: {
			description: {
				story:
					"No mission open in the content. Check no row carries `aria-current`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelectorAll("[aria-current]")).toHaveLength(
			0,
		)
	},
})

export const RowMenu = meta.story({
	args: { wrap: withMissionMenu },
	parameters: {
		a11y: mergeA11y(
			A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
			A11Y_FLOATING_FOCUS_GUARDS,
		),
		docs: {
			description: {
				story: `A right click on a row opens the mission menu for that mission state instead of the native one. Check a waiting mission lists open, copy, answer and close. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvas }) => {
		const row = canvas
			.getByText(firstOpenMission().objective)
			.closest("[data-slot='mission-card-row']")
		if (!(row instanceof HTMLElement)) throw new Error("No mission row")
		const isNativeMenuAllowed = fireEvent.contextMenu(row, {
			clientX: 40,
			clientY: 20,
		})
		await expect(isNativeMenuAllowed).toBe(false)
		const menu = await shown(
			await screen.findByRole("menu", { name: "Mission actions" }),
		)
		await expect(
			within(menu)
				.getAllByRole("menuitem")
				.map((item) => item.textContent),
		).toEqual(["Open mission", "Copy", "Answer the question", "Close"])
	},
})

const READING_MORE = { hasNextPage: true, isFetchingNextPage: true }

const COMPLETE = { hasNextPage: false, isFetchingNextPage: false }

const expectReadingMore = async (canvasElement: HTMLElement) => {
	const sentinel = slotIn(canvasElement, "list-end-sentinel")
	const lastRow = slotsIn(canvasElement, "mission-card-row").at(-1)
	await waitFor(() =>
		expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(1),
	)
	await expect(lastRow?.compareDocumentPosition(sentinel)).toBe(
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

const READING_MORE_STORY =
	"The next page of missions on its way. Check one mission row stand-in pulses under the last group, and that the sentinel the app observes sits after the last loaded row."

const COMPLETE_STORY =
	"Every mission of the space loaded. Check nothing is drawn under the last group: no stand-in row, no sentinel."

export const ReadingMore = meta.story({
	args: { earlierToday: NO_SPACE_MISSIONS, listEnd: READING_MORE },
	parameters: {
		docs: {
			description: {
				story: `${READING_MORE_STORY} Pick \`ReadingMoreDark\` for the dark theme. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const ReadingMoreDark = meta.story({
	args: { earlierToday: NO_SPACE_MISSIONS, listEnd: READING_MORE },
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story: `${READING_MORE_STORY} Pick \`ReadingMore\` for the light theme. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: ({ canvasElement }) => expectReadingMore(canvasElement),
})

export const Complete = meta.story({
	args: { earlierToday: NO_SPACE_MISSIONS, listEnd: COMPLETE },
	parameters: {
		docs: {
			description: {
				story: `${COMPLETE_STORY} Pick \`CompleteDark\` for the dark theme. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

export const CompleteDark = meta.story({
	args: { earlierToday: NO_SPACE_MISSIONS, listEnd: COMPLETE },
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story: `${COMPLETE_STORY} Pick \`Complete\` for the light theme. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: ({ canvasElement }) => expectComplete(canvasElement),
})

export const ReadingMoreUnderAFold = meta.story({
	tags: ["test-only"],
	args: { listEnd: READING_MORE },
	parameters: {
		docs: {
			description: {
				story:
					"A next page exists while Earlier today is folded. Check no sentinel is drawn until the fold opens, since the rows it would load are hidden.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(0)
		await userEvent.click(canvas.getByRole("button", { name: /Earlier today/ }))
		await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(1)
	},
})

const PAST_SKELETON_DELAY_MS = 400

export const Idle = meta.story({
	args: {
		earlierToday: NO_SPACE_MISSIONS,
		listEnd: { hasNextPage: true, isFetchingNextPage: false },
	},
	parameters: {
		docs: {
			description: {
				story: `A next page exists but is not being read yet. Check the sentinel the app observes sits after the last loaded row and no stand-in row is drawn. ${WIRED_BY_THE_APP}`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await new Promise((resolve) => setTimeout(resolve, PAST_SKELETON_DELAY_MS))
		const [sentinel] = slotsIn(canvasElement, "list-end-sentinel")
		const lastRow = slotsIn(canvasElement, "mission-card-row").at(-1)
		await expect(slotsIn(canvasElement, "list-end-sentinel")).toHaveLength(1)
		await expect(lastRow?.compareDocumentPosition(sentinel as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		await expect(slotsIn(canvasElement, "list-end-skeleton")).toHaveLength(0)
	},
})
