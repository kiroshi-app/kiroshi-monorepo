import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import { BOT_MISSION_STATES } from "@workspace/ui/components/bot-badge"
import { MissionCapsuleList } from "@workspace/ui/components/mission-capsule"
import { WORKING_SHIMMER_DURATION } from "@workspace/ui/components/motion/text-shimmer"

const MISSIONS: AppSidebarRowMission[] = BOT_MISSION_STATES.map(
	(state, index) => ({
		id: `mission-${state}`,
		state,
		ticket: {
			platform: "linear",
			externalId: `OPE-${510 + index}`,
			title:
				index === 0
					? "Ship the release notes with every migration step spelled out for the reader"
					: "Rebuild the bundle",
		},
	}),
)

const meta = preview.meta({
	title: "Navigation/MissionCapsule",
	component: MissionCapsuleList,
	decorators: [
		(Story) => (
			<div className="w-72 bg-sidebar">
				<Story />
			</div>
		),
	],
	args: { missions: MISSIONS },
	play: async ({ canvasElement }) => {
		const capsules = slotsIn(canvasElement, "mission-capsule")
		await expect(capsules.map((capsule) => capsule.dataset.state)).toEqual([
			...BOT_MISSION_STATES,
		])
		const [title] = slotsIn(canvasElement, "mission-capsule-title")
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(within(canvasElement).queryAllByRole("button")).toEqual([])
		await expect(capsules[0]).toHaveTextContent("waiting for you")
		const marks = slotsIn(canvasElement, "mission-capsule-glyph")
		await expect(marks.map((mark) => mark.dataset.state)).toEqual([
			...BOT_MISSION_STATES,
		])
		for (const mark of marks) {
			await expect(mark.getBoundingClientRect().width).toBe(14)
		}
		for (const capsule of capsules) {
			await expect(capsule.tabIndex).toBe(-1)
			await expect(getComputedStyle(capsule).pointerEvents).toBe("none")
		}
	},
})

export const EveryState = meta.story({})

export const EveryStateDark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
})

const WORKING_MISSION: AppSidebarRowMission = {
	id: "mission-working",
	state: "working",
	ticket: {
		platform: "linear",
		externalId: "OPE-513",
		title: "Rebuild the bundle",
	},
}

export const LiveMission = meta.story({
	args: { missions: [{ ...WORKING_MISSION, isLive: true }] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the mission's agent is speaking in its thread or its coding session was active moments ago. Check that the title plays the working shimmer of a conversation row, that the mark, the identifier and the spacing match `SilentMission`, and that a screen reader hears the mission is working. Pick `SilentMission` for a mission in the same state that has gone quiet.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const title = slotIn(canvasElement, "mission-capsule-title")
		const shimmer = slotIn(title, "text-shimmer")
		await expect(shimmer).toHaveTextContent(WORKING_MISSION.ticket.title)
		await expect(
			shimmer.style.getPropertyValue("--text-shimmer-duration"),
		).toBe(`${WORKING_SHIMMER_DURATION}s`)
		await expect(shimmer.dataset.held).toBe("true")
		await expect(title.textContent).toBe(
			`${WORKING_MISSION.ticket.title} working`,
		)
	},
})

export const SilentMission = meta.story({
	args: { missions: [WORKING_MISSION] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a mission is still in the working state but its agent has gone quiet, or is waiting for an answer. Check that the title stays static, with no shimmer and no working announcement after it. Pick `LiveMission` for the same row while its agent is active.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const title = slotIn(canvasElement, "mission-capsule-title")
		await expect(slotsIn(canvasElement, "text-shimmer")).toEqual([])
		await expect(title.textContent).toBe(WORKING_MISSION.ticket.title)
	},
})
