import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	holderOf,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import {
	APP_HEADER_TITLE,
	AppHeader,
} from "@workspace/ui/components/app-header"
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
					"The seven states a mission can be in, exhaustively, each in its own holder. Check that five of them name themselves in words on the very same badge, that only the mark changes colour between them, the `waiting_human` mission state mark on `--mission-glyph-waiting` because it is the one waiting on the reader, and that `working` and `waiting_bot` leave their holder empty. Adding a state to `MissionState` without adding it here is a type error, so this list cannot drift from the contract. `packages/ui/src/components/mission-card.tsx:102` mounts one pill for the state its mission is in. Pick `InAppHeader` for the form the mission bar draws.",
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
			tokenStyleIn(canvasElement, "text-mission-glyph-waiting", "color"),
		)

		for (const state of MISSION_STATES_WITHOUT_A_PILL) {
			await expect(holderOf(canvasElement, state)).toBeEmptyDOMElement()
		}
	},
})

const PILL_STATES = MISSION_STATES.filter(
	(state) => !MISSION_STATES_WITHOUT_A_PILL.includes(state),
)

export const InAppHeader = meta.story({
	parameters: {
		layout: "padded",
		docs: {
			description: {
				story:
					"The five states the pill speaks for, each at the trailing end of an `AppHeader`, where the pill is a filled capsule rather than a badge. Check that each is 36px tall with 10px of padding on every side and a 16px radius, on the fill the bar's own capsule wears, with a 6px dot in the colour of its state 6px before a 12px medium label in the foreground, and that the bar stays 56px tall around it. Pick `States` for the badge a mission card draws. `packages/ui/src/components/mission-header.tsx:82` hands the pill to the bar.",
			},
		},
	},
	render: () => (
		<div className="flex w-[36rem] max-w-full flex-col">
			{PILL_STATES.map((state) => (
				<section data-holds={state} key={state}>
					<AppHeader
						close={<MissionStatePill state={state} />}
						leading={
							<span className={APP_HEADER_TITLE}>
								Move the sidecar build into the release workflow
							</span>
						}
					/>
				</section>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const dotOf = (pill: HTMLElement) => pill.firstElementChild as HTMLElement

		for (const pill of slotsIn(canvasElement, "mission-state-pill")) {
			const box = pill.getBoundingClientRect()
			const dot = dotOf(pill).getBoundingClientRect()
			const style = getComputedStyle(pill)

			await expect([
				box.height,
				style.borderRadius,
				dot.left - box.left,
				dot.width,
				dot.height,
				style.columnGap,
				style.padding,
				style.fontSize,
				style.lineHeight,
				style.fontWeight,
			]).toEqual([36, "16px", 10, 6, 6, "6px", "10px", "12px", "16px", "500"])
			await expect(
				slotIn(pill.closest("section") as Element, "app-header").offsetHeight,
			).toBe(56)
			await expect(style.backgroundColor).toBe(
				tokenStyleIn(pill, "bg-foreground/5", "backgroundColor"),
			)
			await expect(style.color).toBe(
				tokenStyleIn(pill, "text-foreground", "color"),
			)
		}
		await expect(slotsIn(canvasElement, "mission-state-pill")).toHaveLength(
			PILL_STATES.length,
		)
		await expect(
			getComputedStyle(
				dotOf(
					slotIn(
						holderOf(canvasElement, "ready_to_merge"),
						"mission-state-pill",
					),
				),
			).backgroundColor,
		).toBe(tokenStyleIn(canvasElement, "bg-success", "backgroundColor"))
	},
})
