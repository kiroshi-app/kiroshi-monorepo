import { type ReactNode, useState } from "react"
import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionGlyphsIn,
	expectHeaderTitleStep,
	expectHeaderTopLineStep,
	expectStaticHeaderBar,
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
	MissionProperties,
	type MissionPropertiesProps,
} from "@workspace/ui/components/mission-properties"
import {
	LONG_MISSION_TICKET_TITLE,
	MISSION_BOT,
	MISSION_NOW,
	MISSION_OBJECTIVE,
	MISSION_PULL_REQUEST,
	MISSION_STATES,
	MISSION_STATES_WITHOUT_A_PILL,
	MISSION_TICKET,
} from "@workspace/ui/components/missions.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { UserTurn } from "@workspace/ui/components/turn"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const ORIGIN_CONVERSATION = "Sidecar release"

const WORKING_HEADER: Omit<MissionHeaderProps, "onBack"> = {
	bot: MISSION_BOT,
	objective: MISSION_OBJECTIVE,
	pathLabel: ORIGIN_CONVERSATION,
	state: "working",
	isWorking: true,
}

const ACTIVITIES = [true, false]

const PILLS_THE_MATRIX_DRAWS = 10

const LONG_OBJECTIVE =
	"Rework the mission thread so a reader can follow a run that spans several days without ever losing the ticket it answers"

const LONG_ORIGIN_CONVERSATION =
	"Sidecar release, packaging and signing on every desktop target this quarter"

const FILLED_BY_THE_THREAD =
	"`apps/app/src/components/thread-screen.tsx:451` is the header of every mission thread, filled from the stored mission."

const AVATAR_SIZE = 32

const LEADING_GAP = 10

const PATH_LINE_TOP = 11

const TITLE_LINE_TOP = 27

const STATE_PILL = { height: 36, top: 10, padding: "10px", radius: "16px" }

const boxOf = (element: Element) => element.getBoundingClientRect()

const pathLinkIn = (root: Element) => slotIn(root, "app-header-path-link")

const expectLeadingCluster = async (bar: HTMLElement) => {
	const [avatar, text] = Array.from(slotIn(bar, "app-header-leading").children)

	await expect([boxOf(avatar).width, boxOf(avatar).height]).toEqual([
		AVATAR_SIZE,
		AVATAR_SIZE,
	])
	await expect(boxOf(text).left - boxOf(avatar).right).toBe(LEADING_GAP)
	await expectHeaderTopLineStep(slotIn(bar, "app-header-top-line"))
	await expectHeaderTitleStep(slotIn(bar, "mission-objective"))
}

const meta = preview.meta({
	title: "Conversation/Missions/MissionHeader",
	component: MissionHeader,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The top of a mission thread, as the one static bar every screen wears: the avatar of the agent running it, a path link over the objective, and the state at the trailing end. The path link is the way out of the mission: `pathLabel` names the conversation it goes back to, and `onBack` goes there. The ticket, the status and the pull request are not here: `MissionProperties` lists them at the top of the thread, where they scroll away. Reach for it as the header of a mission thread; on its own it is useful to check that a long path and a long objective truncate before the state loses room.",
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
					"A mission an agent is working on right now, opened from the `Sidecar release` conversation. Check that the header is one bar with no island and no second row, that the 32px avatar sits 10px before the text, that the path link reads the name of that conversation over the objective and is the first thing the keyboard reaches, and that activating it leaves the mission. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const header = slotIn(canvasElement, "mission-header")
		const bar = slotIn(header, "app-header")
		const path = canvas.getByRole("button", { name: ORIGIN_CONVERSATION })

		await expect(header.children).toHaveLength(1)
		await expect(slotsIn(header, "header-island")).toHaveLength(0)
		await expect(boxOf(bar).height).toBe(56)
		await expectLeadingCluster(bar)
		await expect(path).toBe(pathLinkIn(bar))
		await expect(slotsIn(bar, "app-header-path-separator")).toHaveLength(1)
		await expect(slotIn(bar, "mission-objective")).toHaveTextContent(
			MISSION_OBJECTIVE,
		)

		await userEvent.tab()
		await expect(path).toHaveFocus()
		await userEvent.keyboard("{Enter}")

		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seven states a mission can be in, exhaustively, each one drawn twice: with an agent at work on it, then with nobody on it. Check that the state names the five states it speaks for at the trailing end of the bar and is not drawn at all for `working` and `waiting_bot`, that the avatar holds the working pose in the first column and rests in the second whatever the state beside it says, that only `waiting_human` adds the attention dot, and that the bar keeps its height throughout. " +
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
		for (const bar of slotsIn(canvasElement, "app-header")) {
			await expect(boxOf(bar).height).toBe(56)
		}
	},
})

export const WithoutAPill = meta.story({
	args: { state: "waiting_human", isWorking: false },
	parameters: {
		docs: {
			description: {
				story:
					"The bar of a mission nobody can act on yet, above the bar of one waiting on its reader. Check that the `working` bar draws nothing after its leading cluster, no empty pill and no gap held open for one, while the bar under it ends on its state. " +
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

export const LongContent = meta.story({
	args: {
		bot: { ...MISSION_BOT, name: "Anastasia Konstantinopoulou-Whitfield" },
		objective: LONG_OBJECTIVE,
		pathLabel: LONG_ORIGIN_CONVERSATION,
		state: "waiting_human",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A path label and an objective written as sentences, in a container squeezed to 320 pixels. Check that each truncates on its own line, that the avatar and the state keep their room, and that the bar never scrolls sideways. Read it at 200 percent zoom too. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<div className="w-80">
			<MissionHeader {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const bar = slotIn(canvasElement, "app-header")
		const path = pathLinkIn(bar)
		const objective = slotIn(bar, "mission-objective")
		const state = slotIn(bar, "mission-state-pill")
		const avatar = slotIn(bar, "app-header-leading").firstElementChild

		await expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth)
		await expect(path).toHaveTextContent(LONG_ORIGIN_CONVERSATION)
		await expect(path.scrollWidth).toBeGreaterThan(path.clientWidth)
		await expect(objective.scrollWidth).toBeGreaterThan(objective.clientWidth)
		await expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth)
		await expect(boxOf(avatar as Element).width).toBe(AVATAR_SIZE)
	},
})

const ARTBOARD_HEADER = {
	objective: "Move the sidecar build into the release workflow",
	state: "ready_to_merge",
	isWorking: false,
} satisfies Partial<MissionHeaderProps>

const ARTBOARD_PROPERTIES: MissionPropertiesProps = {
	ticket: {
		...MISSION_TICKET,
		externalId: "OPE-2140",
		title: "Release builds ship without the sidecar binary",
	},
	status: {
		text: "Checks green, waiting for the queue",
		writtenAt: MISSION_NOW - 240_000,
	},
	commitsAhead: 2,
	pullRequest: { ...MISSION_PULL_REQUEST, number: 2291 },
	openedAt: MISSION_NOW - 7_200_000,
	now: MISSION_NOW,
	onOpenCodingSession: fn(),
	onEdit: fn(),
}

const TWO_MESSAGES = ["Where does the mission stand?", "Is the queue moving?"]

const SCROLLING_MESSAGES = Array.from(
	{ length: 24 },
	(_, turn) => `Checkpoint ${turn + 1}: where does the mission stand?`,
)

const COLUMN_WIDTH = 640

const NARROW_FRAME_WIDTH = 480

const NARROW_COLUMN_WIDTH = 448

const BLOCK_TO_FIRST_MESSAGE = 16

type MissionFrameProps = {
	header: ReactNode
	properties?: Partial<MissionPropertiesProps>
	messages?: string[]
	isNarrow?: boolean
}

const MissionFrame = ({
	header,
	properties,
	messages = TWO_MESSAGES,
	isNarrow = false,
}: MissionFrameProps) => (
	<div
		className={cn("flex h-svh flex-col bg-card", isNarrow && "w-120")}
		data-content-card=""
		data-holds="frame"
	>
		{header}
		<div
			className={cn(
				"min-h-0 flex-1 overflow-y-auto py-6",
				isNarrow ? "px-4" : "px-6",
			)}
			data-holds="thread"
		>
			<div
				className="mx-auto flex max-w-160 flex-col gap-4"
				data-holds="column"
			>
				<MissionProperties {...ARTBOARD_PROPERTIES} {...properties} />
				<div className="flex flex-col gap-4" data-holds="messages">
					{messages.map((message) => (
						<UserTurn key={message}>{message}</UserTurn>
					))}
				</div>
			</div>
		</div>
	</div>
)

const inMissionFrame = (args: MissionHeaderProps) => (
	<MissionFrame header={<MissionHeader {...args} />} />
)

const expectStatePill = async (bar: HTMLElement) => {
	const pill = slotIn(bar, "mission-state-pill")

	await expect(pill).toHaveTextContent("Ready to merge")
	await expect(slotsIn(bar, "app-header-capsule")).toHaveLength(0)
	await expect([
		boxOf(slotIn(bar, "app-header-top-line")).top - boxOf(bar).top,
		boxOf(slotIn(bar, "mission-objective")).top - boxOf(bar).top,
	]).toEqual([PATH_LINE_TOP, TITLE_LINE_TOP])
	await expect([
		boxOf(pill).height,
		boxOf(pill).top - boxOf(bar).top,
		boxOf(bar).right - boxOf(pill).right,
		getComputedStyle(pill).padding,
		getComputedStyle(pill).borderRadius,
	]).toEqual([
		STATE_PILL.height,
		STATE_PILL.top,
		12,
		STATE_PILL.padding,
		STATE_PILL.radius,
	])
	await expect(getComputedStyle(pill).backgroundColor).toBe(
		tokenStyleIn(
			pill,
			pill.closest(".dark") ? "bg-white/6" : "bg-foreground/5",
			"backgroundColor",
		),
	)
}

const expectOpenMission = async (canvasElement: HTMLElement) => {
	const frame = holderOf(canvasElement, "frame")
	const bar = await expectStaticHeaderBar(frame)
	const column = holderOf(frame, "column")
	const block = slotIn(column, "mission-properties")
	const messages = holderOf(column, "messages")

	await expect(slotsIn(frame, "header-island")).toHaveLength(0)
	await expect(slotIn(frame, "mission-header").children).toHaveLength(1)
	await expectLeadingCluster(bar)
	await expectStatePill(bar)
	await expect(boxOf(block).width).toBe(boxOf(column).width)
	await expect(boxOf(messages).top - boxOf(block).bottom).toBe(
		BLOCK_TO_FIRST_MESSAGE,
	)
	await expect(getComputedStyle(block).borderBottomColor).toBe(
		tokenStyleIn(
			block,
			block.closest(".dark")
				? "border border-white/8"
				: "border border-foreground/8",
			"borderTopColor",
		),
	)

	return { frame, bar, column, block, messages }
}

const propertiesIn = (block: Element) =>
	Array.from(
		block.querySelectorAll<HTMLElement>("[data-property]"),
		(row) => row.dataset.property,
	)

export const Mission3a = meta.story({
	args: ARTBOARD_HEADER,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3a, the open mission. Check the static bar over the thread, the avatar then the path link over the objective and the state as a dot and its label in a 36px pill at the trailing end, the bar still 56px tall, then, at the top of the 640px thread column, the properties block reading the ticket with its Open the coding session and Edit icon buttons, the last status and the pull request, a rule under it and the first of two messages 16px below. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: inMissionFrame,
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { column, block, messages } = await expectOpenMission(canvasElement)

		await expect(boxOf(column).width).toBe(COLUMN_WIDTH)
		await expect(propertiesIn(block)).toEqual([
			"ticket",
			"activity",
			"pull-request",
		])
		await expect(messages.children).toHaveLength(2)

		await userEvent.click(
			canvas.getByRole("button", { name: ORIGIN_CONVERSATION }),
		)
		await expect(args.onBack).toHaveBeenCalledOnce()
	},
})

export const MissionWithoutActivity3b = meta.story({
	args: ARTBOARD_HEADER,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3b, a mission whose agent wrote no status. Check that the properties block leaves the Activity row out and keeps the Ticket and Pull request rows 4px apart, with the bar unchanged. Pick `Mission3a` for the three rows. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<MissionFrame
			header={<MissionHeader {...args} />}
			properties={{ status: undefined }}
		/>
	),
	play: async ({ canvasElement }) => {
		const { block } = await expectOpenMission(canvasElement)
		const [ticket, pullRequest] = Array.from(block.children)

		await expect(propertiesIn(block)).toEqual(["ticket", "pull-request"])
		await expect(boxOf(pullRequest).top - boxOf(ticket).bottom).toBe(4)
	},
})

export const MissionDark3c = meta.story({
	args: ARTBOARD_HEADER,
	globals: { ...LAPTOP_WINDOW, theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3c, the open mission in the dark theme. Check that the bar, the state and the properties block keep the geometry of `Mission3a` and take every colour from the dark tokens: the labels in the muted foreground, the values in the soft foreground, both rules at white 8 percent and the state on white 6 percent. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: inMissionFrame,
	play: async ({ canvasElement }) => {
		const { frame, block } = await expectOpenMission(canvasElement)
		const label = block.querySelector("dt") as HTMLElement
		const value = block.querySelector("dd") as HTMLElement

		await expect(frame.closest(".dark")).not.toBeNull()
		await expect(getComputedStyle(label).color).toBe(
			tokenStyleIn(label, "text-muted-foreground", "color"),
		)
		await expect(getComputedStyle(value).color).toBe(
			tokenStyleIn(value, "text-soft-foreground", "color"),
		)
	},
})

export const MissionScrolled3d = meta.story({
	args: ARTBOARD_HEADER,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3d, a mission thread long enough to scroll, scrolled to its end. Check that the bar stays where it was while the properties block leaves under it with the messages, so only the path, the objective and the state stay in sight. Pick `Mission3a` for a thread short enough to rest whole. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<MissionFrame
			header={<MissionHeader {...args} />}
			messages={SCROLLING_MESSAGES}
		/>
	),
	play: async ({ canvasElement }) => {
		const { frame, bar, block } = await expectOpenMission(canvasElement)
		const thread = holderOf(frame, "thread")
		const restingBar = boxOf(bar)

		await expect(boxOf(block).top).toBeGreaterThan(restingBar.bottom)

		thread.scrollTop = thread.scrollHeight
		await waitFor(() => expect(thread.scrollTop).toBeGreaterThan(0))

		await expect([boxOf(bar).top, boxOf(bar).height]).toEqual([
			restingBar.top,
			restingBar.height,
		])
		await expect(boxOf(block).bottom).toBeLessThan(restingBar.bottom)
	},
})

export const MissionNarrow3e = meta.story({
	args: {
		...ARTBOARD_HEADER,
		objective: LONG_OBJECTIVE,
		pathLabel: LONG_ORIGIN_CONVERSATION,
	},
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Artboard 3e, the open mission in a thread 480px wide, with a long path, a long objective and a long ticket title. Check that the path and the objective each truncate on one line while the avatar and the state stay whole, and that the Ticket row wraps its title onto further lines, aligned to the top, with its buttons pinned to the end of the row. " +
					FILLED_BY_THE_THREAD,
			},
		},
	},
	render: (args) => (
		<MissionFrame
			header={<MissionHeader {...args} />}
			isNarrow
			properties={{
				ticket: {
					...ARTBOARD_PROPERTIES.ticket,
					title: LONG_MISSION_TICKET_TITLE,
				},
			}}
		/>
	),
	play: async ({ canvasElement }) => {
		const { frame, bar, column, block } = await expectOpenMission(canvasElement)
		const path = pathLinkIn(bar)
		const objective = slotIn(bar, "mission-objective")
		const row = block.querySelector('[data-property="ticket"]') as HTMLElement
		const line = slotIn(row, "mission-ticket-line")
		const actions = slotIn(row, "mission-ticket-actions")

		await expect([boxOf(frame).width, boxOf(column).width]).toEqual([
			NARROW_FRAME_WIDTH,
			NARROW_COLUMN_WIDTH,
		])
		await expect(path.scrollWidth).toBeGreaterThan(path.clientWidth)
		await expect(objective.scrollWidth).toBeGreaterThan(objective.clientWidth)
		await expect(
			boxOf(slotIn(bar, "mission-state-pill")).right,
		).toBeLessThanOrEqual(boxOf(frame).right - 12)
		await expect(
			boxOf(line.lastElementChild as Element).height,
		).toBeGreaterThan(20)
		await expect(getComputedStyle(row).alignItems).toBe("flex-start")
		await expect([boxOf(line).top, boxOf(actions).top]).toEqual([
			boxOf(row).top,
			boxOf(row).top,
		])
		await expect(boxOf(actions).right).toBe(boxOf(block).right)
		await expect(block.scrollWidth).toBeLessThanOrEqual(block.clientWidth)
	},
})

const SHORT_THREAD: TranscriptItem[] = TWO_MESSAGES.map((message) => ({
	key: message,
	render: () => <UserTurn>{message}</UserTurn>,
}))

type MissionThreadProps = {
	header: ReactNode
	notice?: ReactNode
	skeleton?: ReactNode
}

const MissionThread = ({ header, notice, skeleton }: MissionThreadProps) => (
	<div className="h-svh bg-card" data-content-card="">
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			header={header}
			isHeaderFloating
			notice={notice}
			rows={SHORT_THREAD}
			skeleton={skeleton}
		>
			{null}
		</ThreadLayout>
	</div>
)

const MissionOnItsWay = (args: MissionHeaderProps) => {
	const [isLoaded, setIsLoaded] = useState(false)

	return (
		<MissionThread
			header={
				isLoaded ? (
					<MissionHeader {...args} />
				) : (
					<MissionHeaderSkeleton
						onBack={args.onBack}
						pathLabel={args.pathLabel}
					/>
				)
			}
			notice={
				isLoaded ? null : (
					<Button onClick={() => setIsLoaded(true)}>Load the mission</Button>
				)
			}
			skeleton={isLoaded ? undefined : <MissionDetailSkeleton />}
		/>
	)
}

const leadingGeometryOf = (bar: HTMLElement) => {
	const [avatar, text] = Array.from(slotIn(bar, "app-header-leading").children)
	const path = boxOf(pathLinkIn(bar))
	const title = boxOf(text.lastElementChild as Element)

	return {
		bar: boxOf(bar).height,
		avatar: [
			boxOf(avatar).left,
			boxOf(avatar).top,
			boxOf(avatar).width,
			boxOf(avatar).height,
		],
		text: [boxOf(text).left, boxOf(text).top, boxOf(text).height],
		path: [path.left, path.top, path.width, path.height],
		title: [title.left, title.top, title.height],
	}
}

export const MissionSkeleton = meta.story({
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The mission thread while the mission is still on its way. Check that the skeleton header is the same static 56px bar as `Mission3a`, with the path link already live so the reader can leave, a 32px hexagon and a bar where the avatar and the objective land, and no state. `apps/app/src/components/mission-thread-screen.tsx:156` renders the mission-loading branch of a thread.",
			},
		},
	},
	render: (args) => (
		<MissionThread
			header={
				<MissionHeaderSkeleton
					onBack={args.onBack}
					pathLabel={args.pathLabel}
				/>
			}
			skeleton={<MissionDetailSkeleton />}
		/>
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		const bar = await expectStaticHeaderBar(layout)
		const skeleton = slotIn(layout, "mission-header-skeleton")
		const [hexagon] = slotsIn(bar, "skeleton")

		await expect(skeleton).toHaveAttribute("aria-busy", "true")
		await expect(slotsIn(bar, "skeleton")).toHaveLength(2)
		await expect([boxOf(hexagon).width, boxOf(hexagon).height]).toEqual([
			AVATAR_SIZE,
			AVATAR_SIZE,
		])
		await expect(slotsIn(bar, "mission-state-pill")).toHaveLength(0)
		await expect(slotsIn(bar, "mission-objective")).toHaveLength(0)

		const path = canvas.getByRole("button", { name: ORIGIN_CONVERSATION })
		await userEvent.click(path)
		await expect(args.onBack).toHaveBeenCalledOnce()
		path.blur()
	},
})

export const MissionSkeletonThenLoaded = meta.story({
	tags: ["test-only"],
	args: ARTBOARD_HEADER,
	globals: LAPTOP_WINDOW,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"The mission thread first on its skeleton, then loaded once *Load the mission* is pressed. Check that the bar keeps its 56px, and that the avatar, the path link and the objective land exactly where the hexagon, the path link and the bar stood, so nothing moves when the mission arrives.",
			},
		},
	},
	render: (args) => <MissionOnItsWay {...args} />,
	play: async ({ canvasElement, userEvent }) => {
		const layout = slotIn(canvasElement, "chat-layout")
		const loading = leadingGeometryOf(
			slotIn(slotIn(layout, "mission-header-skeleton"), "app-header"),
		)

		await expect(loading.bar).toBe(56)

		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Load the mission" }),
		)
		const header = await waitFor(() => slotIn(layout, "mission-header"))

		await expect(leadingGeometryOf(slotIn(header, "app-header"))).toEqual(
			loading,
		)
		await expectStaticHeaderBar(layout)
	},
})
