import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
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
			await expect(mark.getBoundingClientRect().width).toBe(12)
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
