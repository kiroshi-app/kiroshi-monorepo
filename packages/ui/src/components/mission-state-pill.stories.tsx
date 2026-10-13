import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	holderOf,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { MissionStatePill } from "@workspace/ui/components/mission-state-pill"
import {
	MISSION_STATES,
	MISSION_STATES_WITHOUT_A_PILL,
} from "@workspace/ui/components/missions.fixtures"

const PILLS_THE_STATES_DRAW = 5

const meta = preview.meta({
	title: "Conversation/Missions/MissionStatePill",
	component: MissionStatePill,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Where a mission stands, said in words rather than in colour. It speaks for the four states a reader can act on and for a mission the person closed, in the muted foreground since a close is no outcome; a mission being worked on or waiting for its companion is not a place it stands, so the pill draws nothing and the animated avatar carries that signal alone. Every label reads on the same badge, the colour sitting on the mark, so no state shouts louder than another. Reach for it inside `MissionHeader` and `MissionCard`.",
			},
		},
	},
	args: { state: "waiting_human" },
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The seven states a mission can be in, exhaustively, each in its own holder. Check that five of them name themselves in words on the very same badge, that only the mark changes colour between them, the `waiting_human` bell on `--warning` because it is the one waiting on the reader, and that `working` and `waiting_bot` leave their holder empty. Adding a state to `MissionState` without adding it here is a type error, so this list cannot drift from the contract. `packages/ui/src/components/mission-card.tsx:43` and `packages/ui/src/components/mission-header.tsx:84` each mount one pill for the state their mission is in.",
			},
		},
	},
	render: () => (
		<div className="flex flex-wrap items-center gap-2">
			{MISSION_STATES.map((state) => (
				<span data-holds={state} key={state}>
					<MissionStatePill state={state} />
				</span>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-state-pill")).toHaveLength(
			PILLS_THE_STATES_DRAW,
		)

		const waitingMark = holderOf(canvasElement, "waiting_human").querySelector(
			"svg",
		)
		if (!waitingMark) throw new Error("No mark on the waiting_human pill")
		await expect(getComputedStyle(waitingMark).color).toBe(
			tokenStyleIn(canvasElement, "text-warning", "color"),
		)

		for (const state of MISSION_STATES_WITHOUT_A_PILL) {
			await expect(holderOf(canvasElement, state)).toBeEmptyDOMElement()
		}
	},
})
