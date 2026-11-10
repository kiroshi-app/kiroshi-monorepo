import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotsIn,
} from "@workspace/storybook/story-utils"
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
	args: { missions: MISSIONS, onOpen: fn() },
	play: async ({ args, canvasElement }) => {
		const capsules = slotsIn(canvasElement, "mission-capsule")
		await expect(capsules.map((capsule) => capsule.dataset.state)).toEqual([
			...BOT_MISSION_STATES,
		])
		const [title] = slotsIn(canvasElement, "mission-capsule-title")
		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		capsules[0].focus()
		await expect(capsules[0]).toHaveFocus()
		capsules[0].click()
		await expect(args.onOpen).toHaveBeenCalledWith("mission-waiting")
	},
})

export const EveryState = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
})

export const EveryStateDark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
})
