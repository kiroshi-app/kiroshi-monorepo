import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionGlyphsIn,
	holderOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type { MissionState } from "@workspace/ui/components/mission"
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
					"The top of a mission thread, in two bands: the way out of it, who runs it, what it was asked to do and where it stands, then the ticket it answers, what it is allowed to reach for and how long it has been open. Reach for it as the header of a mission thread; on its own it is useful to check that a long objective and a long ticket title truncate before the state pill, the tool marks or the opening time lose room.",
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

export const Loading = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The header of a mission thread while the mission is still on its way, drawn above the loaded header it stands in for, in the same width. Check that the two bands keep the height and the edges of the loaded ones so nothing jumps when the mission lands, that the back control is already live, and that the avatar, the objective, the ticket line and the opening time are shapes with no text, no pill, no tool mark and no activity line. `apps/app/src/components/mission-thread-screen.tsx:146` renders the mission-loading branch of a thread.",
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
		const skeletonTicketBand = slotIn(loading, "mission-ticket-band-skeleton")
		const ticketBand = slotIn(loaded, "mission-ticket-band")

		await expect(heightOf(skeleton)).toBe(heightOf(header))
		await expect(heightOf(slotIn(loading, "app-header"))).toBe(
			heightOf(slotIn(loaded, "app-header")),
		)
		await expect(heightOf(skeletonTicketBand)).toBe(heightOf(ticketBand))
		await expect(skeletonTicketBand.className).toBe(ticketBand.className)
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
					"The seven states a mission can be in, exhaustively, each one drawn twice: with a companion at work on it, then with nobody on it. Check that the pill names the five states it speaks for at the trailing edge of the first band and leaves that edge empty for `working` and `waiting_bot`, that the avatar holds the working pose in the first column and rests in the second whatever the state beside it says, that only `waiting_human` adds the attention dot, and that the two bands keep their height throughout. " +
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
					"The first band of a mission nobody can act on yet, beside the band of one waiting on its reader. Check that the trailing edge of the `working` header holds nothing at all: `packages/ui/src/components/app-header.tsx:33` mounts its trailing container on the truthiness of the node it is handed, so a pill left to render nothing would still reserve width beside the objective. " +
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
					"The ticket band on a mission whose ticket carries a url. Check that the link opens in a new tab, that it names the platform, the identifier and the title, and that tabbing to it draws a visible ring. Pick `Empty` for a mission whose ticket names nothing. " +
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
					"A mission carrying a ticket and no tool. Check that the rule that separates the ticket from the tool marks is left out rather than drawn against nothing, and that the opening time keeps the trailing edge. Pick `Default` for the band that draws both. " +
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
					"An objective and a ticket title written as sentences, in a container squeezed to 480 pixels. Check that both truncate on one line, that the state pill, every tool mark and the opening time keep their room, and that neither band scrolls sideways. Read it at 200 percent zoom too. " +
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
					"A mission whose companion wrote a last status. Check that it reads in the ticket band after the tool marks and before the opening time, behind the same rule the band draws between the ticket and the tools, in the muted foreground with its relative time in tabular figures, and that its tooltip hands the text over. Pick `Default` for the band with no status. Nothing on main feeds this prop yet.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const band = slotIn(canvasElement, "mission-ticket-band")
		const status = slotIn(band, "mission-status")
		const time = slotIn(status, "mission-status-time")

		await expect(status.previousElementSibling).toHaveAttribute(
			"data-slot",
			"mission-ticket-rule",
		)
		await expect(status.nextElementSibling?.tagName).toBe("TIME")
		await expect(time).toHaveAttribute(
			"datetime",
			new Date(MISSION_STATUS.writtenAt).toISOString(),
		)
		await expect(time).toHaveTextContent("4 minutes ago")
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
					"A status written as several sentences, in a container squeezed to 480 pixels. Check that the band stays one line high, that the status text alone truncates while its time and the opening time stay whole, and that the tooltip raised from the status hands the whole text over. Pick `WithStatus` for a status that fits.",
			},
		},
	},
	render: (args) => (
		<div className="w-[30rem] max-w-full">
			<MissionHeader {...args} />
		</div>
	),
	play: async ({ canvasElement, userEvent }) => {
		const band = slotIn(canvasElement, "mission-ticket-band")
		const status = slotIn(band, "mission-status")
		const text = status.firstElementChild as HTMLElement
		const opened = band.lastElementChild as HTMLElement

		await expect(band.scrollWidth).toBeLessThanOrEqual(band.clientWidth + 1)
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
					"A mission on a branch with an open pull request, in a container squeezed to 320 pixels. Check that a line under the ticket band reads the commits ahead in tabular figures, a dot, then the pull request number as a link opening in a new tab, with no tool, target or age; that the line stays one row high with every part whole; and that the link shows a ring on keyboard focus and names the pull request it opens. Pick `Default` for a mission with neither, which draws no line. " +
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
			getComputedStyle(link.parentElement as HTMLElement, "::before").content,
		).toBe('"·"')
		await expect(link).toHaveAttribute("href", MISSION_PULL_REQUEST.url)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(line.getBoundingClientRect().height).toBe(28)
		await expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth + 1)
		for (const whole of [commits, link]) {
			await expect(whole.scrollWidth).toBeLessThanOrEqual(whole.clientWidth)
		}

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
					"A mission with an open pull request and no commit ahead. Check that the line reads the pull request link alone, with no leading dot and no tool, target or age. Pick `WithPullRequest` for a branch with commits ahead. " +
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
		await expect(
			getComputedStyle(link.parentElement as HTMLElement, "::before").content,
		).toBe("none")
	},
})
