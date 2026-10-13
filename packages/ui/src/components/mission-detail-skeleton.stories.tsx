import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import {
	MISSION_BOT,
	MISSION_NOW,
	MISSION_OBJECTIVE,
	MISSION_OPENED_AT,
	MISSION_TICKET,
	MISSION_TOOLS,
} from "@workspace/ui/components/missions.fixtures"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"

const meta = preview.meta({
	title: "Feedback/MissionDetailSkeleton",
	component: MissionDetailSkeleton,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The stand-in for a mission transcript while it is on its way: agent turns, a hexagon beside a name bar and a bubble, between one or two event lines, each a dot, a label bar and a time bar past the gutter. It rests on the composer and rises to the top of the transcript region, the last item cut by its edge. It takes the transcript's place through `ThreadLayout`'s `skeleton` slot, so the mission header and the composer stay the loaded components.",
			},
		},
	},
	render: () => (
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			header={
				<MissionHeader
					bot={MISSION_BOT}
					isWorking={false}
					now={MISSION_NOW}
					objective={MISSION_OBJECTIVE}
					onBack={fn()}
					openedAt={MISSION_OPENED_AT}
					state="waiting_human"
					ticket={MISSION_TICKET}
					tools={MISSION_TOOLS}
				/>
			}
			skeleton={<MissionDetailSkeleton />}
		>
			{null}
		</ThreadLayout>
	),
	play: async ({ canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "top")
		const list = slotIn(canvasElement, "list-skeleton")
		const [agent, event] = slotsIn(list, "list-skeleton-row")
		const [, name] = slotsIn(agent, "skeleton")
		const [dot, label, stamp] = slotsIn(event, "skeleton")

		await expect(list).toHaveAttribute("aria-hidden", "true")
		await expect(
			list.getBoundingClientRect().bottom -
				agent.getBoundingClientRect().bottom,
		).toBe(16)
		await expect(name.getBoundingClientRect().width).toBe(36)
		await expect(agent.getBoundingClientRect().height).toBe(20 + 4 + 80)
		await expect(event.getBoundingClientRect().height).toBe(20)
		await expect(
			dot.getBoundingClientRect().left - event.getBoundingClientRect().left,
		).toBe(48 + 4)
		await expect(dot.getBoundingClientRect().width).toBe(5)
		await expect(label.getBoundingClientRect().width).toBe(164)
		await expect(stamp.getBoundingClientRect().width).toBe(28)
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The mission transcript between the mission header and the composer, light theme. Check that the newest agent turn sits one small gap above the composer, that event lines start past the gutter with their time bar on the far edge, and that the topmost item is cut by the header's edge. Pick `Dark` for the dark theme.",
			},
		},
	},
})

export const Dark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story:
					"The same mission transcript in the dark theme. Check that the solid hexagon and name bar stay apart from the faint bubbles and event lines against the dark ground. Pick `Light` for the light theme.",
			},
		},
	},
})
