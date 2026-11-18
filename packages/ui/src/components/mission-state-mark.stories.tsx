import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	boxOf,
	holderOf,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { BOT_MISSION_STATES } from "@workspace/ui/components/bot-badge"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"

const SIZES = [12, 14] as const

const DISC_TOKENS = [
	["waiting", "text-mission-glyph-waiting"],
	["failed", "text-mission-glyph-failed"],
	["ready", "text-success"],
] as const

const shapeOf = (mark: Element) =>
	Array.from(mark.children)
		.map((part) =>
			["d", "r", "cy", "stroke-dasharray"]
				.map((attribute) => part.getAttribute(attribute))
				.join(" "),
		)
		.join("|")

type MarkPlayContext = {
	canvasElement: HTMLElement
}

const meta = preview.meta({
	title: "Navigation/MissionStateMark",
	component: MissionStateMark,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Where a mission stands, as one mark: a disc with a cut-out for the three states asking for a reader (waiting for you, blocked, ready to merge), a ring for the two that run on their own (working, waiting on an agent). The mark is decorative: every surface carrying it names the state in words once, so the mark never speaks.",
			},
		},
	},
})

const everyStateAtBothSizes = {
	render: () => (
		<div className="flex flex-col gap-4">
			{SIZES.map((size) => (
				<div className="flex items-center gap-3" data-holds={size} key={size}>
					{BOT_MISSION_STATES.map((state) => (
						<MissionStateMark key={state} size={size} state={state} />
					))}
				</div>
			))}
		</div>
	),
	play: async ({ canvasElement }: MarkPlayContext) => {
		for (const size of SIZES) {
			const marks = slotsIn(
				holderOf(canvasElement, String(size)),
				"mission-state-mark",
			)
			await expect(marks.map((mark) => mark.dataset.state)).toEqual([
				...BOT_MISSION_STATES,
			])
			await expect(new Set(marks.map(shapeOf)).size).toBe(
				BOT_MISSION_STATES.length,
			)
			for (const mark of marks) {
				await expect(boxOf(mark).width).toBe(size)
				await expect(mark).toHaveAttribute("aria-hidden", "true")
			}
			for (const [state, token] of DISC_TOKENS) {
				const mark = marks[BOT_MISSION_STATES.indexOf(state)]
				await expect(getComputedStyle(mark).color).toBe(
					tokenStyleIn(mark, token, "color"),
				)
			}
		}
	},
}

export const EveryStateAtBothSizes = meta.story(everyStateAtBothSizes)

export const EveryStateAtBothSizesDark = meta.story({
	...everyStateAtBothSizes,
	globals: { theme: "dark", theme_layout: "single" },
})
