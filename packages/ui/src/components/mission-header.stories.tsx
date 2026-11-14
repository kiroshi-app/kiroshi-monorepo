import { type ReactNode, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionGlyphsIn,
	holderOf,
	LAPTOP_WINDOW,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import type { MissionState } from "@workspace/ui/components/mission"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import {
	MissionHeader,
	type MissionHeaderProps,
} from "@workspace/ui/components/mission-header"
import { MissionHeaderSkeleton } from "@workspace/ui/components/mission-header-skeleton"
import {
	LONG_MISSION_STATUS,
	MISSION_BOT,
	MISSION_NOW,
	MISSION_OBJECTIVE,
	MISSION_OPENED_AT,
	MISSION_PULL_REQUEST,
	MISSION_STATES,
	MISSION_STATES_WITHOUT_A_PILL,
	MISSION_STATUS,
	MISSION_TICKET,
	MISSION_TOOL_CALL_SLOTS,
	MISSION_TOOLS,
} from "@workspace/ui/components/missions.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"

const WORKING_HEADER: Omit<MissionHeaderProps, "onBack"> = {
	bot: MISSION_BOT,
	objective: MISSION_OBJECTIVE,
	ticket: MISSION_TICKET,
	tools: MISSION_TOOLS,
	state: "working",
	isWorking: true,
	openedAt: MISSION_OPENED_AT,
	now: MISSION_NOW,
}

const ACTIVITIES = [true, false]

const PILLS_THE_MATRIX_DRAWS = 10

const LONG_TICKET_TITLE =
	"Release builds ship without the sidecar binary on every desktop target, so the installed app starts with no coding session until the sidecar is fetched by hand"

const LONG_OBJECTIVE =
	"Rework the mission thread so a reader can follow a run that spans several days without ever losing the ticket it answers"

const FILLED_BY_THE_THREAD =
	"`apps/app/src/components/thread-screen.tsx:308` is the header of every mission thread, filled from the stored mission."

const meta = preview.meta({
	title: "Conversation/Missions/MissionHeader",
	component: MissionHeader,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The top of a mission thread, in two rows of floating islands: the way out of it, who runs it, what it was asked to do and where it stands, then one full-width island for the ticket it answers, what it is allowed to reach for, its last status, its branch activity and how long it has been open. Reach for it as the floating header of a mission thread, in a `ThreadLayout` with `isHeaderFloating`; on its own it is useful to check that a long objective truncates before the state loses room and that the ticket island wraps instead of clipping.",
			},
		},
	},
	args: { ...WORKING_HEADER, onBack: fn() },
	render: (args) => (
		<div className="w-[36rem] max-w-full">
			<MissionHeader {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A mission a companion is working on right now. Check that the back control is the first thing the keyboard reaches, that the objective titles the thread rather than the companion name, and that the ticket, the tool marks and the opening time read as one line under the avatar. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Back to the conversation" }),
		)

		await expect(args.onBack).toHaveBeenCalled()
		await expect(slotsIn(canvasElement, "mission-status")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "mission-activity")).toHaveLength(0)
	},
})

const heightOf = (element: HTMLElement) =>
	element.getBoundingClientRect().height

const ticketIslandIn = (root: Element) => {
	const island = root.querySelector<HTMLElement>(
		'[data-island="mission-ticket"]',
	)
	if (!island) throw new Error("Nothing here draws the ticket island")
	return island
}

export const Loading = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The header of a mission thread while the mission is still on its way, drawn above the loaded header it stands in for, in the same width, narrow enough for the ticket island to stack and reserve its three lines whether or not a status fills the second one. Check that the two island rows keep the height and the edges of the loaded ones so nothing jumps when the mission lands, that the back control is already live, and that the avatar, the objective, the ticket line and the opening time are shapes with no text, no state, no tool mark and no activity. `apps/app/src/components/mission-thread-screen.tsx:146` renders the mission-loading branch of a thread.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-[36rem] max-w-full flex-col gap-4">
			<section data-holds="loading">
				<MissionHeaderSkeleton onBack={args.onBack} />
			</section>
			<section data-holds="loaded">
				<MissionHeader {...args} />
			</section>
		</div>
	),
	play: async ({ args, canvasElement, userEvent }) => {
		const loading = holderOf(canvasElement, "loading")
		const loaded = holderOf(canvasElement, "loaded")
		const skeleton = slotIn(loading, "mission-header-skeleton")
		const header = slotIn(loaded, "mission-header")

		await expect(heightOf(skeleton)).toBe(heightOf(header))
		await expect(heightOf(slotIn(loading, "app-header"))).toBe(
			heightOf(slotIn(loaded, "app-header")),
		)
		await expect(heightOf(ticketIslandIn(loading))).toBe(
			heightOf(ticketIslandIn(loaded)),
		)
		await expect(skeleton).toHaveAttribute("aria-busy", "true")
		await expect(skeleton).toHaveTextContent("")
		for (const shape of slotsIn(skeleton, "skeleton")) {
			await expect(shape.closest('[aria-hidden="true"]')).not.toBeNull()
		}

		await userEvent.click(
			within(loading).getByRole("button", { name: "Back to the conversation" }),
		)

		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seven states a mission can be in, exhaustively, each one drawn twice: with a companion at work on it, then with nobody on it. Check that the state island names the five states it speaks for at the trailing end of the first row and is not drawn at all for `working` and `waiting_bot`, that the avatar holds the working pose in the first column and rests in the second whatever the state beside it says, that only `waiting_human` adds the attention dot, and that the two island rows keep their height throughout. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<div className="flex w-[36rem] max-w-full flex-col gap-4">
			{MISSION_STATES.map((state) => (
				<section className="flex flex-col gap-2" data-holds={state} key={state}>
					{ACTIVITIES.map((isWorking) => (
						<MissionHeader
							{...args}
							isWorking={isWorking}
							key={String(isWorking)}
							state={state}
						/>
					))}
				</section>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-state-pill")).toHaveLength(
			PILLS_THE_MATRIX_DRAWS,
		)
		for (const state of MISSION_STATES_WITHOUT_A_PILL) {
			await expect(
				slotsIn(holderOf(canvasElement, state), "mission-state-pill"),
			).toHaveLength(0)
		}
		await expect(companionGlyphsIn(canvasElement, "working")).toHaveLength(
			MISSION_STATES.length,
		)
		await expect(companionGlyphsIn(canvasElement, "idle")).toHaveLength(
			MISSION_STATES.length,
		)
	},
})

export const WithoutAPill = meta.story({
	args: { state: "waiting_human", isWorking: false },
	parameters: {
		docs: {
			description: {
				story:
					"The first row of a mission nobody can act on yet, beside the first row of one waiting on its reader. Check that the `working` header draws no state island at all: `packages/ui/src/components/app-header.tsx:51` mounts its trailing island on the truthiness of the node it is handed, so a state left to render nothing would still draw an empty island beside the objective. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<div className="flex w-[36rem] max-w-full flex-col gap-4">
			<section data-holds="working">
				<MissionHeader {...args} isWorking={true} state="working" />
			</section>
			<section data-holds="waiting_human">
				<MissionHeader {...args} />
			</section>
		</div>
	),
	play: async ({ canvasElement }) => {
		const barOf = (state: MissionState) =>
			slotIn(holderOf(canvasElement, state), "app-header")

		await expect(barOf("working").children).toHaveLength(1)
		await expect(barOf("waiting_human").children).toHaveLength(2)
	},
})

export const TicketLink = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The ticket island on a mission whose ticket carries a url. Check that the link opens in a new tab, that it names the platform, the identifier and the title, and that tabbing to it draws a visible ring. Pick `Empty` for a mission whose ticket names nothing. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const link = canvas.getByRole("link", {
			name: new RegExp(MISSION_TICKET.externalId),
		})

		await expect(link).toHaveAttribute("target", "_blank")
		await expect(link).toHaveAttribute("href", MISSION_TICKET.url)

		await userEvent.tab()
		await userEvent.tab()

		await expect(link).toHaveFocus()
		await expect(link.className).toContain("focus-visible:ring-2")
	},
})

export const Empty = meta.story({
	args: {
		ticket: { externalId: "", title: "", platform: "linear", url: "" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A mission opened with no ticket behind it. Check that the ticket line and the rule that follows it are left out entirely rather than drawn empty, and that the tool marks keep their place under the avatar with the opening time still on the trailing edge. `apps/app/src/components/thread-screen.tsx:316` passes the stored ticket through, empty fields included.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-ticket-line")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "mission-ticket-rule")).toHaveLength(0)
	},
})

export const WithoutATool = meta.story({
	args: { tools: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A mission carrying a ticket and no tool. Check that the rule that separates the ticket from the tool marks is left out rather than drawn against nothing, and that the opening time keeps the trailing end of the ticket island. Pick `Default` for the ticket island that draws both. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-ticket-line")).toHaveLength(1)
		await expect(slotsIn(canvasElement, "mission-ticket-rule")).toHaveLength(0)
		await expect(slotsIn(canvasElement, "mission-tool-mark")).toHaveLength(0)
	},
})

export const LongContent = meta.story({
	args: {
		bot: { ...MISSION_BOT, name: "Anastasia Konstantinopoulou-Whitfield" },
		objective: LONG_OBJECTIVE,
		ticket: {
			...MISSION_TICKET,
			externalId: "OPE-1042",
			title:
				"Rework the mission thread so a reader can follow a run that spans several days without losing the ticket it answers",
		},
		tools: [...MISSION_TOOLS, "Repository read and write", "Screenshot"],
		state: "waiting_human",
	},
	parameters: {
		docs: {
			description: {
				story:
					"An objective and a ticket title written as sentences, in a container squeezed to 480 pixels. Check that the objective truncates on one line, that the state island, every tool mark and the opening time keep their room, and that the ticket island wraps rather than scrolling sideways. Read it at 200 percent zoom too. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<div className="w-[30rem] max-w-full">
			<MissionHeader {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const header = slotIn(canvasElement, "mission-header")
		const objective = slotIn(canvasElement, "mission-objective")

		await expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1)
		await expect(objective.scrollWidth).toBeGreaterThan(objective.clientWidth)
	},
})

export const WithStatus = meta.story({
	args: { status: MISSION_STATUS },
	parameters: {
		docs: {
			description: {
				story:
					"A mission whose companion wrote a last status. Check that it reads in the ticket island after the tool marks and before the opening time, on a line of its own at this width, in the muted foreground, followed by a middle dot and the time since it was written in tabular figures, and that its tooltip hands the text over. Pick `Default` for the island with no status. Nothing on main feeds this prop yet.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const island = ticketIslandIn(canvasElement)
		const status = slotIn(island, "mission-status")
		const time = slotIn(status, "mission-status-time")

		await expect(status.previousElementSibling).toHaveAttribute(
			"data-slot",
			"mission-ticket-rule",
		)
		await expect(
			Array.from(island.children, (cell) => cell.getAttribute("data-slot")),
		).toEqual([
			"mission-ticket-cell",
			"mission-status-cell",
			null,
			"mission-opening-cell",
		])
		await expect(time).toHaveAttribute(
			"datetime",
			new Date(MISSION_STATUS.writtenAt).toISOString(),
		)
		await expect(time).toHaveTextContent("4 min")
		await expect(getComputedStyle(time, "::before").content).toBe('"·"')
		await expect(getComputedStyle(time).fontVariantNumeric).toBe("tabular-nums")

		await userEvent.hover(status.firstElementChild as HTMLElement)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			MISSION_STATUS.text,
		)
	},
})

export const LongStatus = meta.story({
	args: { status: LONG_MISSION_STATUS },
	parameters: {
		docs: {
			description: {
				story:
					"A status written as several sentences, in a container squeezed to 480 pixels. Check that the island wraps the status onto a row of its own instead of scrolling sideways, that the status text alone truncates there while its time and the opening time stay whole, and that the tooltip raised from the status hands the whole text over. Pick `WithStatus` for a status that fits.",
			},
		},
	},
	render: (args) => (
		<div className="w-[30rem] max-w-full">
			<MissionHeader {...args} />
		</div>
	),
	play: async ({ canvasElement, userEvent }) => {
		const island = ticketIslandIn(canvasElement)
		const status = slotIn(island, "mission-status")
		const text = status.firstElementChild as HTMLElement
		const opened = slotIn(island, "mission-opening-cell")

		await expect(island.scrollWidth).toBeLessThanOrEqual(island.clientWidth + 1)
		await expect(
			slotIn(island, "mission-status-cell").getBoundingClientRect().top,
		).toBeGreaterThan(
			slotIn(island, "mission-ticket-cell").getBoundingClientRect().top,
		)
		await expect(text.scrollWidth).toBeGreaterThan(text.clientWidth)
		await expect(opened.scrollWidth).toBeLessThanOrEqual(opened.clientWidth)
		await expect(
			slotIn(status, "mission-status-time").getBoundingClientRect().height,
		).toBe(text.getBoundingClientRect().height)

		await userEvent.hover(text)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			LONG_MISSION_STATUS.text,
		)
	},
})

const PULL_REQUEST_MARK_SIZE = 14

const expectNoToolCall = async (line: HTMLElement) => {
	for (const slot of MISSION_TOOL_CALL_SLOTS) {
		await expect(slotsIn(line, slot)).toHaveLength(0)
	}
}

export const WithPullRequest = meta.story({
	args: {
		commitsAhead: 3,
		pullRequest: MISSION_PULL_REQUEST,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A mission on a branch with an open pull request, in a container squeezed to 320 pixels. Check that the trailing cell of the ticket island reads the commits ahead in tabular figures, then the pull request mark and its number as a link opening in a new tab, with no tool, target or age; that the activity stays one row high with every part whole; and that the link shows a ring on keyboard focus and names the pull request it opens. Pick `Default` for a mission with neither, which draws no activity. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<div className="w-80">
			<MissionHeader {...args} />
		</div>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		const line = slotIn(canvasElement, "mission-activity")
		const commits = slotIn(line, "mission-commits-ahead")
		const link = canvas.getByRole("link", { name: "Open pull request #482" })

		await expectNoToolCall(line)
		await expect(line).toHaveTextContent(/^3 commits ahead#482$/)
		await expect(getComputedStyle(commits).fontVariantNumeric).toBe(
			"tabular-nums",
		)
		await expect(link).toHaveTextContent("#482")
		await expect(
			link.previousElementSibling?.getBoundingClientRect().width,
		).toBe(PULL_REQUEST_MARK_SIZE)
		await expect(link).toHaveAttribute("href", MISSION_PULL_REQUEST.url)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(line.getBoundingClientRect().height).toBe(16)
		await expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(
			ticketIslandIn(canvasElement).getBoundingClientRect().right,
		)
		await expect(commits.scrollWidth).toBeLessThanOrEqual(commits.clientWidth)

		for (let step = 0; step < 10 && document.activeElement !== link; step++) {
			await userEvent.tab()
		}
		await expect(link).toHaveFocus()
		await expect(getComputedStyle(link).boxShadow).not.toBe("none")
	},
})

export const PullRequestOnly = meta.story({
	args: {
		pullRequest: MISSION_PULL_REQUEST,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A mission with an open pull request and no commit ahead. Check that the activity reads the pull request mark and link alone, with no commit count and no tool, target or age. Pick `WithPullRequest` for a branch with commits ahead. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const line = slotIn(canvasElement, "mission-activity")
		const link = canvas.getByRole("link", { name: "Open pull request #482" })

		await expectNoToolCall(line)
		await expect(slotsIn(line, "mission-commits-ahead")).toHaveLength(0)
		await expect(line).toHaveTextContent(/^#482$/)
		await expect(link).toBeVisible()
	},
})

const ISLAND_INSET = 8

const ISLAND_HEIGHT = 40

const TICKET_ISLAND_HEIGHT = 42

const WIDE_MISSION_WIDTH = 960

const ISLAND_EDGE = 5

const TICKET_ISLAND_TOP = 56

const MISSION_CONTENT_TOP = 104

const NARROW_MISSION_WIDTH = 480

const NARROW_CONTENT_TOP = 168

const TICKET_LINE_HEIGHT = 32

const ARTBOARD_MISSION = {
	objective: "Move the sidecar build into the release workflow",
	ticket: {
		...MISSION_TICKET,
		externalId: "OPE-2140",
		title: "Release builds ship without the sidecar binary",
	},
	tools: ["Superset", "Paper"],
	state: "ready_to_merge",
	isWorking: false,
	status: {
		text: "Checks green, waiting for the queue",
		writtenAt: MISSION_NOW - 240_000,
	},
	commitsAhead: 2,
	pullRequest: { ...MISSION_PULL_REQUEST, number: 2291 },
	openedAt: MISSION_NOW - 7_200_000,
} satisfies Partial<MissionHeaderProps>

const turnsOf = (count: number): TranscriptItem[] =>
	Array.from({ length: count }, (_, turn) => ({
		key: `turn-${turn}`,
		render: () => <UserTurn>Where does the mission stand?</UserTurn>,
	}))

const SHORT_THREAD = turnsOf(2)

const SCROLLING_THREAD = turnsOf(24)

type MissionThreadProps = {
	header: ReactNode
	notice?: ReactNode
	rows?: TranscriptItem[]
	skeleton?: ReactNode
	width?: number
}

const MissionThread = ({
	header,
	notice,
	rows = SHORT_THREAD,
	skeleton,
	width,
}: MissionThreadProps) => (
	<div className="h-svh bg-card" data-content-card="" style={{ width }}>
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			header={header}
			isHeaderFloating
			notice={notice}
			rows={rows}
			skeleton={skeleton}
		>
			{null}
		</ThreadLayout>
	</div>
)

type MissionOnItsWayProps = MissionHeaderProps & {
	width: number
}

const MissionOnItsWay = ({ width, ...args }: MissionOnItsWayProps) => {
	const [isLoaded, setIsLoaded] = useState(false)

	return (
		<MissionThread
			header={
				isLoaded ? (
					<MissionHeader {...args} />
				) : (
					<MissionHeaderSkeleton onBack={args.onBack} />
				)
			}
			notice={
				isLoaded ? null : (
					<Button onClick={() => setIsLoaded(true)}>Load the mission</Button>
				)
			}
			skeleton={isLoaded ? undefined : <MissionDetailSkeleton />}
			width={width}
		/>
	)
}

const contentTopOf = (layout: HTMLElement, slot: string) => {
	const column = slotIn(layout, slot)

	return (
		boxOf(column).top -
		boxOf(layout).top +
		Number.parseFloat(getComputedStyle(column).paddingTop)
	)
}

const inMissionThread = (args: MissionHeaderProps) => (
	<MissionThread header={<MissionHeader {...args} />} />
)

const boxOf = (element: Element) => element.getBoundingClientRect()

const expectTwoIslandRows = async (canvasElement: HTMLElement) => {
	const layout = slotIn(canvasElement, "chat-layout")
	const frame = boxOf(layout)
	const bar = slotIn(layout, "app-header")
	const leading = boxOf(slotsIn(bar, "header-island")[0])
	const ticket = boxOf(ticketIslandIn(layout))

	await expect(getComputedStyle(bar).borderBottomWidth).toBe("0px")
	await expect([
		leading.left - frame.left,
		leading.top - frame.top,
		leading.height,
	]).toEqual([ISLAND_INSET, ISLAND_INSET, ISLAND_HEIGHT])
	await expect([
		ticket.left - frame.left,
		frame.right - ticket.right,
		ticket.top - frame.top,
	]).toEqual([ISLAND_INSET, ISLAND_INSET, TICKET_ISLAND_TOP])

	return { layout, frame, bar, ticket }
}

const expectContentBelowTheIslands = (layout: HTMLElement, top: number) =>
	waitFor(() =>
		expect(layout.style.getPropertyValue("--screen-layout-header-height")).toBe(
			`${top}px`,
		),
	)

const expectMissionIslands = async (canvasElement: HTMLElement) => {
	const { layout, frame, bar, ticket } =
		await expectTwoIslandRows(canvasElement)
	const state = slotIn(bar, "mission-state-pill")
	const trailing = boxOf(slotsIn(bar, "header-island")[1])
	const dot = state.firstElementChild as HTMLElement

	await expect(ticket.height).toBe(TICKET_ISLAND_HEIGHT)
	await expect([
		frame.right - trailing.right,
		trailing.top - frame.top,
		trailing.height,
	]).toEqual([ISLAND_INSET, ISLAND_INSET, ISLAND_HEIGHT])
	await expect(state).toHaveTextContent("Ready to merge")
	await expect([boxOf(dot).width, boxOf(dot).height]).toEqual([6, 6])
	await expect(getComputedStyle(dot).backgroundColor).toBe(
		tokenStyleIn(dot, "bg-success", "backgroundColor"),
	)
	await expect(getComputedStyle(state).fontSize).toBe("13px")
	await expect(
		within(layout).getByRole("button", { name: "Back to the conversation" }),
	).toHaveAttribute("data-slot", "header-island-button")
	await expectContentBelowTheIslands(layout, MISSION_CONTENT_TOP)
	await expect(
		getComputedStyle(slotIn(layout, "message-scroller-content")).paddingTop,
	).toBe(`${MISSION_CONTENT_TOP}px`)

	return { layout, ticket }
}

const expectIslandSurface = async (
	canvasElement: HTMLElement,
	surface: "bg-card" | "bg-card-raised",
) => {
	for (const island of slotsIn(canvasElement, "header-island")) {
		await expect(getComputedStyle(island).backgroundColor).toBe(
			tokenStyleIn(island, surface, "backgroundColor"),
		)
	}
}

export const Mission3a = meta.story({
	args: ARTBOARD_MISSION,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3a, the open mission. Check the two island rows over the thread with no bar and no rule under them: back and the objective top left, the state as a dot and its label top right, then the ticket island across the width, 8px from each side and 56px from the top, reading the ticket, the tool marks, the last status, a gap, then the commits ahead, the pull request and the opening time. Check the transcript starts 104px from the top. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: inMissionThread,
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { ticket } = await expectMissionIslands(canvasElement)
		const island = ticketIslandIn(canvasElement)
		const opening = slotIn(island, "mission-opening-cell")

		await expectIslandSurface(canvasElement, "bg-card")
		await expect(slotIn(opening, "mission-activity")).toHaveTextContent(
			/^2 commits ahead#2291$/,
		)
		await expect(opening.lastElementChild).toHaveTextContent(/^opened /)
		await expect(ticket.right - boxOf(opening).right).toBe(ISLAND_EDGE)
		await expect(
			boxOf(slotIn(island, "mission-status-cell")).left -
				boxOf(slotIn(island, "mission-ticket-cell")).right,
		).toBe(0)
		await expect(
			slotIn(island, "mission-ticket-line").querySelector("svg"),
		).toBeNull()
		for (const cell of slotsIn(island, "header-island-cell")) {
			await expect(boxOf(cell).height).toBe(32)
		}

		const back = canvas.getByRole("button", {
			name: "Back to the conversation",
		})
		await userEvent.click(back)
		await expect(args.onBack).toHaveBeenCalledOnce()
		back.blur()
	},
})

export const MissionWithoutActivity3b = meta.story({
	args: { ...ARTBOARD_MISSION, commitsAhead: 0, pullRequest: undefined },
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3b, a mission with no commit ahead and no pull request. Check that the ticket island draws no activity, and that the opening time keeps the trailing end of the island on its own. Pick `Mission3a` for a branch with activity. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: inMissionThread,
	play: async ({ canvasElement }) => {
		const { ticket } = await expectMissionIslands(canvasElement)
		const island = ticketIslandIn(canvasElement)
		const opening = slotIn(island, "mission-opening-cell")

		await expect(slotsIn(island, "mission-activity")).toHaveLength(0)
		await expect(opening.children).toHaveLength(1)
		await expect(opening).toHaveTextContent(/^opened /)
		await expect(ticket.right - boxOf(opening).right).toBe(ISLAND_EDGE)
	},
})

export const MissionDark3c = meta.story({
	args: ARTBOARD_MISSION,
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3c, the open mission in the dark theme. Check that the three islands wear the raised card surface and keep the geometry of `Mission3a`. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: inMissionThread,
	play: async ({ canvasElement }) => {
		await expectMissionIslands(canvasElement)
		await expectIslandSurface(canvasElement, "bg-card-raised")
	},
})

export const MissionScrolled3d = meta.story({
	args: ARTBOARD_MISSION,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3d, a mission thread long enough to scroll. Check that the turns pass under the two island rows and that the top fade of the layout covers them as they leave, 112px tall so it reaches 8px under the ticket island and clears over its last 40px. Pick `Mission3a` for a thread short enough to rest whole. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<MissionThread
			header={<MissionHeader {...args} />}
			rows={SCROLLING_THREAD}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectMissionIslands(canvasElement)
		const fade = await waitFor(() =>
			slotIn(canvasElement, "screen-layout-fade"),
		)

		await expect(boxOf(fade).height).toBe(MISSION_CONTENT_TOP + ISLAND_INSET)
		await expect(getComputedStyle(fade).backgroundImage).toContain(
			"max(50%, 100% - 40px)",
		)
	},
})

export const MissionNarrow3e = meta.story({
	args: ARTBOARD_MISSION,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3e, the open mission in a thread 480px wide. Check that the objective truncates on one line while back and the state stay whole, and that the ticket island wraps to three rows, the ticket, then the status, then the activity with the opening time, each one read in full, with the transcript starting under the last row. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<MissionThread
			header={<MissionHeader {...args} />}
			width={NARROW_MISSION_WIDTH}
		/>
	),
	play: async ({ canvasElement }) => {
		const { layout, frame, bar, ticket } =
			await expectTwoIslandRows(canvasElement)
		const island = ticketIslandIn(layout)
		const objective = slotIn(bar, "mission-objective")
		const state = boxOf(slotIn(bar, "mission-state-pill"))
		const rows = [
			"mission-ticket-cell",
			"mission-status-cell",
			"mission-opening-cell",
		].map((slot) => slotIn(island, slot))

		await expect(frame.width).toBe(NARROW_MISSION_WIDTH)
		await expect(objective.scrollWidth).toBeGreaterThan(objective.clientWidth)
		await expect(state.right).toBeLessThanOrEqual(frame.right - ISLAND_INSET)
		await expect(rows.map((row) => boxOf(row).top - ticket.top)).toEqual([
			ISLAND_EDGE,
			ISLAND_EDGE + TICKET_LINE_HEIGHT,
			ISLAND_EDGE + 2 * TICKET_LINE_HEIGHT,
		])
		await expect(boxOf(rows[0]).width).toBe(ticket.width - 2 * ISLAND_EDGE)
		await expect(slotIn(island, "mission-ticket-rule")).toBeVisible()
		await expect(slotsIn(rows[1], "mission-ticket-rule")[0]).not.toBeVisible()
		for (const row of rows) {
			await expect(boxOf(row).right).toBeLessThanOrEqual(
				ticket.right - ISLAND_EDGE,
			)
			for (const text of row.querySelectorAll<HTMLElement>(".truncate")) {
				await expect(text.scrollWidth).toBeLessThanOrEqual(text.clientWidth)
			}
		}
		await expectContentBelowTheIslands(layout, NARROW_CONTENT_TOP)
	},
})

export const MissionSkeleton = meta.story({
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The mission thread while the mission is still on its way. Check that the skeleton header holds the same two island rows as `Mission3a`, at the same 8px and 56px from the top, with back already live, a hexagon and a bar where the avatar and the objective land, bars in the ticket island, no state island, and the transcript skeleton starting 104px from the top. `apps/app/src/components/mission-thread-screen.tsx:146` renders the mission-loading branch of a thread.",
			},
		},
	},
	render: (args) => (
		<MissionThread
			header={<MissionHeaderSkeleton onBack={args.onBack} />}
			skeleton={<MissionDetailSkeleton />}
		/>
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { layout, bar, ticket } = await expectTwoIslandRows(canvasElement)
		const skeleton = slotIn(layout, "mission-header-skeleton")
		const column = slotIn(layout, "thread-skeleton-column")

		await expect(ticket.height).toBe(TICKET_ISLAND_HEIGHT)
		await expect(slotsIn(bar, "header-island")).toHaveLength(1)
		await expect(skeleton).toHaveAttribute("aria-busy", "true")
		await expect(skeleton).toHaveTextContent("")
		await expect(
			slotsIn(ticketIslandIn(layout), "skeleton").length,
		).toBeGreaterThan(0)
		await expect(slotsIn(bar, "skeleton").length).toBeGreaterThan(0)
		await expectContentBelowTheIslands(layout, MISSION_CONTENT_TOP)
		await expect(getComputedStyle(column).paddingTop).toBe(
			`${MISSION_CONTENT_TOP}px`,
		)

		const back = canvas.getByRole("button", {
			name: "Back to the conversation",
		})
		await userEvent.click(back)
		await expect(args.onBack).toHaveBeenCalledOnce()
		back.blur()
	},
})

type LoadPlayContext = {
	canvasElement: HTMLElement
	userEvent: { click: (element: Element) => Promise<void> }
}

const expectContentHeldAt =
	(top: number) =>
	async ({ canvasElement, userEvent }: LoadPlayContext) => {
		const layout = slotIn(canvasElement, "chat-layout")

		await expectContentBelowTheIslands(layout, top)
		await expect(contentTopOf(layout, "thread-skeleton-column")).toBe(top)

		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Load the mission" }),
		)
		await waitFor(() => slotIn(layout, "mission-header"))

		await expectContentBelowTheIslands(layout, top)
		await expect(contentTopOf(layout, "message-scroller-content")).toBe(top)
		await expect(boxOf(ticketIslandIn(layout)).bottom - boxOf(layout).top).toBe(
			top - ISLAND_INSET + TICKET_ISLAND_HEIGHT - ISLAND_HEIGHT,
		)
	}

const LOADS_ONCE_PRESSED =
	"first on its skeleton, then loaded once *Load the mission* is pressed."

export const MissionSkeletonThenLoadedNarrow = meta.story({
	tags: ["test-only"],
	args: ARTBOARD_MISSION,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story: `The mission thread 480px wide, ${LOADS_ONCE_PRESSED} Check that the skeleton ticket island already holds the three lines the loaded island of \`MissionNarrow3e\` stacks, so the transcript starts 168px from the top before and after and nothing moves when the mission lands.`,
			},
		},
	},
	render: (args) => <MissionOnItsWay {...args} width={NARROW_MISSION_WIDTH} />,
	play: expectContentHeldAt(NARROW_CONTENT_TOP),
})

export const MissionSkeletonThenLoadedNarrowWithoutStatus = meta.story({
	tags: ["test-only"],
	args: { ...ARTBOARD_MISSION, status: undefined },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story: `A mission with no status line in a thread 480px wide, ${LOADS_ONCE_PRESSED} Check that the loaded ticket island keeps the height of three lines with its third one empty, so the transcript starts 168px from the top before and after.`,
			},
		},
	},
	render: (args) => <MissionOnItsWay {...args} width={NARROW_MISSION_WIDTH} />,
	play: expectContentHeldAt(NARROW_CONTENT_TOP),
})

export const MissionSkeletonThenLoadedWide = meta.story({
	tags: ["test-only"],
	args: ARTBOARD_MISSION,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story: `The mission of \`Mission3a\` in a thread 960px wide, ${LOADS_ONCE_PRESSED} Check that the skeleton and the loaded ticket island both hold one line, so the transcript starts 104px from the top before and after.`,
			},
		},
	},
	render: (args) => <MissionOnItsWay {...args} width={WIDE_MISSION_WIDTH} />,
	play: expectContentHeldAt(MISSION_CONTENT_TOP),
})

export const MissionSkeletonThenLoadedWideLongTicket = meta.story({
	tags: ["test-only"],
	args: {
		...ARTBOARD_MISSION,
		ticket: { ...ARTBOARD_MISSION.ticket, title: LONG_TICKET_TITLE },
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story: `A mission whose ticket title is longer than the island, in a thread 960px wide, ${LOADS_ONCE_PRESSED} Check that the loaded island keeps one line, the status giving way first and the title ending in an ellipsis, so the transcript starts 104px from the top before and after.`,
			},
		},
	},
	render: (args) => <MissionOnItsWay {...args} width={WIDE_MISSION_WIDTH} />,
	play: async (context) => {
		await expectContentHeldAt(MISSION_CONTENT_TOP)(context)
		const island = ticketIslandIn(context.canvasElement)
		const title = within(island).getByText(LONG_TICKET_TITLE)

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(
			boxOf(slotIn(island, "mission-opening-cell")).right,
		).toBeLessThanOrEqual(boxOf(island).right - ISLAND_EDGE)
	},
})
