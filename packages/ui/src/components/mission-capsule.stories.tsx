import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn, slotsIn } from "@workspace/storybook/story-utils"
import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import { BOT_MISSION_STATES } from "@workspace/ui/components/bot-badge"
import { MissionCapsuleList } from "@workspace/ui/components/mission-capsule"

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

const WORKING_ANNOUNCEMENT = /working/g

export const LiveMission = meta.story({
	args: {
		missions: [
			{ ...WORKING_MISSION, isLive: true },
			{
				...WORKING_MISSION,
				id: "mission-ready",
				state: "ready",
				isLive: true,
			},
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the mission's agent is speaking in its thread or its coding session was active moments ago. Check that the title plays the working shimmer of a conversation row, that the mark, the identifier and the spacing match `SilentMission`, and that a screen reader hears working once on each row, whatever the state its mark shows. Pick `SilentMission` for a mission in the same state that has gone quiet.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const capsules = slotsIn(canvasElement, "mission-capsule")
		await expect(capsules.map((capsule) => capsule.dataset.state)).toEqual([
			"working",
			"ready",
		])
		for (const capsule of capsules) {
			const shimmer = slotIn(
				slotIn(capsule, "mission-capsule-title"),
				"shimmer-text",
			)
			await expect(shimmer.textContent).toBe(WORKING_MISSION.ticket.title)
			await expect(shimmer.dataset.held).toBe("true")
			await expect(
				capsule.textContent?.match(WORKING_ANNOUNCEMENT),
			).toHaveLength(1)
		}
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
		await expect(slotsIn(canvasElement, "shimmer-text")).toEqual([])
		await expect(
			slotIn(canvasElement, "mission-capsule-title").textContent,
		).toBe(WORKING_MISSION.ticket.title)
	},
})
