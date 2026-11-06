import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionGlyphsIn,
	expectClickModifiers,
	holderOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import type {
	MissionCardModel,
	MissionState,
} from "@workspace/ui/components/mission"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
import {
	CLOSED_MISSION_CARD,
	MISSION_AUTHOR,
	MISSION_STATES,
	MISSION_STATES_WITHOUT_A_PILL,
	WAITING_MISSION_CARD,
	WORKING_MISSION_CARD,
} from "@workspace/ui/components/missions.fixtures"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const OPENING_ANSWER =
	"That one is wide enough to run on its own, so I opened a mission for it and I will report here when it lands."

const ACTIVITIES = [true, false]

const PILLS_THE_MATRIX_DRAWS = 10

const missionsIn = (state: MissionState): MissionCardModel[] =>
	ACTIVITIES.map((isWorking) => ({
		...WAITING_MISSION_CARD,
		id: `mission-${state}-${isWorking}`,
		state,
		isWorking,
	}))

const READY_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	id: "mission-ope-29",
	state: "ready_to_merge",
}

const FAILED_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	id: "mission-ope-17",
	state: "failed",
}

const TOOLLESS_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	id: "mission-ope-22",
	tools: [],
}

const TOOLLESS_WORKING_MISSION_CARD: MissionCardModel = {
	...WORKING_MISSION_CARD,
	id: "mission-ope-42",
	tools: [],
}

const SOLO_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	author: undefined,
}

const UNKNOWN_TOOL_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	id: "mission-ope-51",
	tools: ["Screenshot"],
}

const LONG_OBJECTIVE_MISSION_CARD: MissionCardModel = {
	...WAITING_MISSION_CARD,
	id: "mission-ope-64",
	objective:
		"Move every run history table off the shared database and into the per space store without losing a single reported run. Keep the old tables readable until the last host has migrated, then drop them in one release. Start from apps/app/src/lib/missions/mission-run-history-reconciliation-ledger.ts.",
}

const footerOf = (root: HTMLElement) => slotIn(root, "author-line")

const expectAgentFooter = async (
	root: HTMLElement,
	mission: MissionCardModel,
) => {
	const face = mission.author ?? mission.identity
	const [bubble] = slotsIn(root, "message-bubble-content")
	const footer = footerOf(root)

	await expect(slotsIn(root, "message-bubble-content")).toHaveLength(1)
	await expect(slotsIn(root, "message-author")).toHaveLength(0)
	await expect(slotsIn(root, "message-gutter")).toHaveLength(0)
	await expect(footer.parentElement).toBe(bubble)
	await expect(footer.closest('[data-slot="mission-card"]')).toBeNull()
	await expect(footer).toHaveAttribute("data-tone", "agent")
	await expect(slotIn(footer, "author-line-name")).toHaveTextContent(face.name)
	await expect(footer).not.toHaveTextContent(mission.timestamp)
	await expect(slotIn(root, "mission-timestamp")).toHaveTextContent(
		mission.timestamp,
	)
	if (face.title) {
		await expect(footer).toHaveTextContent(face.title)
	}
}

const expectEqualPadding = async (root: HTMLElement) => {
	const bubble = getComputedStyle(slotIn(root, "message-bubble-content"))

	await expect(bubble.paddingTop).toBe(bubble.paddingInlineStart)
	await expect(bubble.paddingBottom).toBe(bubble.paddingInlineEnd)
}

const PLACED_BY_THE_FEED =
	"`apps/app/src/components/thread-screen.tsx:883` places the row in the feed with the model `apps/app/src/lib/missions/missions-model.ts:204` builds from the stored mission."

const meta = preview.meta({
	title: "Conversation/Missions/MissionTurn",
	component: MissionTurn,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A mission as it lands in the transcript it was opened from: an assistant turn like any other, one soft bubble with the companion's author line in its footer. The bubble opens on which tools the mission runs with and where it stands, then carries the objective and the ticket it answers; the footer names the companion with its badge and its avatar, the time staying in the title row. Reach for it in a conversation feed; the bubble on its own is `MissionCard`.",
			},
		},
	},
	args: { mission: WAITING_MISSION_CARD, onOpen: fn() },
})

export const Working = meta.story({
	args: { mission: WORKING_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A mission its companion is working on, on tools it named itself, against a ticket from a platform the app ships no mark for. Check that the eye reads the work off the avatar turning in the footer rather than off a pill, that no pill is drawn at all, and that the title row of the bubble then holds the three tool marks alone. Pick `WaitingForTheReader` for the state that asks something of the reader. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAgentFooter(canvasElement, WORKING_MISSION_CARD)
		await expectEqualPadding(canvasElement)
		await expect(
			companionGlyphsIn(footerOf(canvasElement), "working")[0],
		).toBeVisible()
		await expect(canvas.getByRole("img", { name: "Superset" })).toBeVisible()
	},
})

export const WorkingDark = Working.extend({
	globals: { theme: "dark" },
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seven states a mission can be in, exhaustively, each one drawn twice: with a companion on it, then with nobody on it. Check that the pill speaks only for the five states it names and that `working` and `waiting_bot` open their bubble on the tool marks alone, that the footer avatar turns in the first row of each pair and rests in the second whatever the pill beside it says, and that the two signals never contradict one another. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			{MISSION_STATES.map((state) => (
				<section className="flex flex-col gap-6" data-holds={state} key={state}>
					{missionsIn(state).map((mission) => (
						<MissionTurn {...args} key={mission.id} mission={mission} />
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

export const WaitingForTheReader = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The mission stopped on a question for its reader. Check that the footer names the companion with its badge and leaves the time to the title row, that the pill opens the bubble after the tool marks and says the state in words, and that the attention badge sits on the footer avatar. Tab onto the bubble to see its focus ring. Pick `Working` for the state that carries no pill at all. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const open = canvas.getByRole("button")
		const ticket = canvas.getByRole("link")
		const footer = footerOf(canvasElement).getBoundingClientRect()
		const bubble = slotIn(
			canvasElement,
			"message-bubble-content",
		).getBoundingClientRect()
		const covered = open.getBoundingClientRect()

		await expect(covered.toJSON()).toEqual(bubble.toJSON())
		await userEvent.tab()
		await expect(open).toHaveFocus()
		await expect(getComputedStyle(open).boxShadow).not.toBe("none")
		await expect(
			document.elementFromPoint(
				footer.left + footer.width / 2,
				footer.top + footer.height / 2,
			),
		).toBe(open)

		await userEvent.click(open)
		await expect(args.onOpen).toHaveBeenCalledWith(
			WAITING_MISSION_CARD.id,
			NO_CLICK_MODIFIERS,
		)

		ticket.focus()
		await expect(ticket).toHaveFocus()
		await expect(ticket).toHaveAttribute(
			"href",
			WAITING_MISSION_CARD.ticket.url,
		)
	},
})

export const ReadyToMerge = meta.story({
	args: { mission: READY_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"The work is done and waits to be merged. Check that the pill reads as an outline rather than as a colour block, and that the footer avatar carries no badge — nothing is asked of the reader here. Pick `Done` for the mission that has already been closed. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
})

export const Failed = meta.story({
	args: { mission: FAILED_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"The run stopped on a failure and the mission is still open. Check that the pill names the failure in words, that the colour of it sits on the mark alone so the label reads like every other, and that the objective stays at full contrast because the mission is not closed. Pick `Done` for the closed form. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "mission-state-pill")).toHaveTextContent(
			"Blocked",
		)
	},
})

export const Done = meta.story({
	args: { mission: CLOSED_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A mission that ran to the end and was closed. Check that the bubble keeps its soft variant, that the objective steps back into the muted foreground while the ticket line stays reachable, and that the pill says it is done. Pick `Failed` for a mission that stopped without being closed. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "mission-card")).toHaveAttribute(
			"data-closed",
			"true",
		)
		await expectAgentFooter(canvasElement, CLOSED_MISSION_CARD)
		await expect(
			companionGlyphsIn(footerOf(canvasElement), "idle")[0],
		).toBeVisible()
	},
})

export const DoneDark = Done.extend({
	globals: { theme: "dark" },
})

export const LongObjective = meta.story({
	args: { mission: LONG_OBJECTIVE_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"An objective of several sentences ending on a path with no break opportunity. Check that it wraps inside the bubble up to the width of an assistant turn, that the padding stays equal on every side, and that the footer still closes the bubble under it. Pick `Working` for an objective of one line. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="w-[30rem] max-w-full">
			<MissionTurn {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const bubble = slotIn(canvasElement, "message-bubble-content")
		const objective = slotIn(canvasElement, "mission-objective")

		await expectAgentFooter(canvasElement, LONG_OBJECTIVE_MISSION_CARD)
		await expectEqualPadding(canvasElement)
		await expect(objective.scrollWidth).toBeLessThanOrEqual(
			objective.clientWidth,
		)
		await expect(bubble.getBoundingClientRect().right).toBeLessThanOrEqual(
			canvasElement.getBoundingClientRect().right,
		)
	},
})

export const LongObjectiveDark = LongObjective.extend({
	globals: { theme: "dark" },
})

export const WithoutTools = meta.story({
	args: { mission: TOOLLESS_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A mission that runs on no tool at all. Check that the title row of the bubble holds the state pill alone, with nothing drawn in place of the marks. Pick `WorkingWithoutTools` for the same mission while it runs, when there is no pill to hold the row up either. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-tool-mark")).toHaveLength(0)
	},
})

export const WorkingWithoutTools = meta.story({
	args: { mission: TOOLLESS_WORKING_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A mission the companion opened without naming a tool, still being worked on. Check that the title row holds the time alone, with no tool mark and no pill, and that the footer avatar and the last tool call are what say somebody is on it. Pick `WithoutTools` for the same mission once it waits on its reader. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "mission-title-row").children,
		).toHaveLength(1)
		await expect(slotsIn(canvasElement, "mission-live-activity")).toHaveLength(
			1,
		)
		await expect(companionGlyphsIn(canvasElement, "working")[0]).toBeVisible()
	},
})

export const InASoloThread = meta.story({
	args: { mission: SOLO_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A thread with a single companion names it on the head row of each of its runs, through the face the screen hands `identity`, and the mission comes with no author of its own. Check that the footer still names the companion, built from the card's identity, and that the bubble still opens on the state. Pick `UnderTheTurnThatOpenedIt` for a thread that names its speakers. `apps/app/src/components/thread-screen.tsx:885` passes no author when the thread holds a single companion, and `apps/app/src/components/thread-screen.tsx:883` places the row all the same.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<TurnGroup>
				<AssistantTurn identity={MISSION_AUTHOR}>
					{OPENING_ANSWER}
				</AssistantTurn>
			</TurnGroup>
			<MissionTurn {...args} />
		</div>
	),
	play: async ({ canvas }) => {
		const card = canvas.getByRole("article", { name: "mission opened" })

		await expectAgentFooter(card, SOLO_MISSION_CARD)
	},
})

export const InASoloThreadDark = InASoloThread.extend({
	globals: { theme: "dark" },
})

export const WithAnUnknownTool = meta.story({
	args: { mission: UNKNOWN_TOOL_MISSION_CARD },
	parameters: {
		docs: {
			description: {
				story:
					"A tool the app ships no mark for, since the companion that opens a mission names its tools itself. Check that one default mark stands in ahead of the pill, that it cannot be mistaken for the Superset, Paper or GitHub marks, and that a screen reader still reads the tool's own name. Pick `Working` for the marks the app does know. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("img", { name: "Screenshot" })).toBeVisible()
	},
})

export const UnderTheTurnThatOpenedIt = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The row as a reader meets it, right under the answer that opened the mission, spaced the way the transcript spaces its rows. Check that the mission bubble starts on the same edge and reaches the same width as the turn above, and that both footers name the companion in the very same shape. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col gap-6">
			<TurnGroup>
				<AssistantTurn author={MISSION_AUTHOR}>{OPENING_ANSWER}</AssistantTurn>
			</TurnGroup>
			<MissionTurn {...args} />
		</div>
	),
})

export const OpensWithClickModifiers = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The mission bubble of a transcript clicked every way a host can tell apart. Check that the turn hands its caller the mission with the button and the keys of that click, middle with the keys held, Cmd, Ctrl or Shift alone, none on a plain click or Enter, and nothing on a right-click.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expectClickModifiers({
			target: canvas.getByRole("button", { name: /^Open the mission/ }),
			callback: args.onOpen,
			reported: [WAITING_MISSION_CARD.id],
			userEvent,
		})
	},
})
