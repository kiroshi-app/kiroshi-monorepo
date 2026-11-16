import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotsIn } from "@workspace/storybook/story-utils"
import {
	MissionTicketLine,
	MissionToolMark,
} from "@workspace/ui/components/mission-marks"
import {
	MISSION_CARD_TOOLS,
	MISSION_TICKET,
} from "@workspace/ui/components/missions.fixtures"

const meta = preview.meta({
	title: "Conversation/Missions/MissionMarks",
	component: MissionTicketLine,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The two marks every mission surface shares: the glyph that names a tool, and the line that names the ticket a mission answers. Reach for them when a mission surface has to say which ticket it is about or what it is allowed to reach for, so a card, a header and an event row all say it the same way.",
			},
		},
	},
	args: { ticket: MISSION_TICKET },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The ticket line as a card draws it, wrapping, above the tool marks of the same mission. Check that a named platform and a named tool take their own glyph, and that an unknown name falls back to the bookmark and the generic tool. Pick `AsLine` for the one-line form the mission header band uses. `packages/ui/src/components/mission-card.tsx:91` draws the wrapping ticket line and `packages/ui/src/components/mission-card.tsx:43` the tool marks beside it.",
			},
		},
	},
	render: (args) => (
		<div className="flex w-[30rem] max-w-full flex-col gap-2">
			<MissionTicketLine {...args} />
			<div className="flex items-center gap-2">
				{[...MISSION_CARD_TOOLS, "Terminal"].map((tool) => (
					<MissionToolMark key={tool} tool={tool} />
				))}
			</div>
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "mission-tool-mark")).toHaveLength(
			MISSION_CARD_TOOLS.length + 1,
		)
	},
})

export const AsLine = meta.story({
	args: { layout: "line" },
	parameters: {
		docs: {
			description: {
				story:
					"The one-line form the Ticket row of `MissionProperties` uses, outside any container, in a box squeezed to 320 pixels. Check that the identifier keeps its room and that the title truncates rather than wrapping; inside the properties block the title wraps instead once the block is narrower than 640 pixels. Pick `Default` for the wrapping form a card takes. `packages/ui/src/components/mission-properties.tsx:97` asks for this form.",
			},
		},
	},
	render: (args) => (
		<div className="w-80 max-w-full">
			<MissionTicketLine {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const [line] = slotsIn(canvasElement, "mission-ticket-line")

		await expect(line?.scrollWidth).toBeLessThanOrEqual(
			(line?.clientWidth ?? 0) + 1,
		)
	},
})
