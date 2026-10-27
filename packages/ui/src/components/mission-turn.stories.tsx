import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	companionGlyphsIn,
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
					"A mission as it lands in the transcript it was opened from: an assistant turn like any other, with the companion's own author line above a soft bubble and the companion's avatar in the gutter. The author line names the companion and nothing more; the bubble opens on which tools the mission runs with and where it stands, then carries the objective and the ticket it answers. Reach for it in a conversation feed; the bubble on its own is `MissionCard`.",
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
					"A mission its companion is working on, on tools it named itself, against a ticket from a platform the app ships no mark for. Check that the eye reads the work off the avatar turning in the gutter rather than off a pill, that no pill is drawn at all, and that the title row of the bubble then holds the three tool marks alone. Pick `WaitingForTheReader` for the state that asks something of the reader. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(companionGlyphsIn(canvasElement, "working")[0]).toBeVisible()
		await expect(canvas.getByRole("img", { name: "Superset" })).toBeVisible()
	},
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seven states a mission can be in, exhaustively, each one drawn twice: with a companion on it, then with nobody on it. Check that the pill speaks only for the five states it names and that `working` and `waiting_bot` open their bubble on the tool marks alone, that the gutter avatar turns in the first row of each pair and rests in the second whatever the pill beside it says, and that the two signals never contradict one another. " +
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
					"The mission stopped on a question for its reader. Check that the author line names the companion and nothing else, that the pill opens the bubble after the tool marks and says the state in words, and that the attention badge sits on the gutter avatar. Pick `Working` for the state that carries no pill at all. " +
					PLACED_BY_THE_FEED,
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const open = canvas.getByRole("button")
		const ticket = canvas.getByRole("link")

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
					"The work is done and waits to be merged. Check that the pill reads as an outline rather than as a colour block, and that the gutter avatar carries no badge — nothing is asked of the reader here. Pick `Done` for the mission that has already been closed. " +
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
	},
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
					"A mission the companion opened without naming a tool, still being worked on. Check that the title row holds the time alone, with no tool mark and no pill, and that the gutter avatar and the last tool call are what say somebody is on it. Pick `WithoutTools` for the same mission once it waits on its reader. " +
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
					"A thread with a single companion names it on the head row of each of its runs, through the face the screen hands `identity`, and the mission card under it carries no author line of its own. Check that the mission turn drops its line, that its avatar stays in the gutter, and that the bubble still opens on the state. Pick `UnderTheTurnThatOpenedIt` for a thread that names its speakers. `apps/app/src/components/thread-screen.tsx:885` passes no author when the thread holds a single companion, and `apps/app/src/components/thread-screen.tsx:883` places the row all the same.",
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

		await expect(slotsIn(card, "message-author")).toHaveLength(0)
	},
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
					"The row as a reader meets it, right under the answer that opened the mission, spaced the way the transcript spaces its rows. Check that the avatar, the author line and the bubble sit on the very same gutter grid as the turn above, and that the companion is named the same way twice rather than in two different shapes. " +
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
