import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { ATLAS, BEACON } from "@workspace/ui/components/app-sidebar.fixtures"
import {
	BotRowAvatar,
	RosterDropArea,
	RosterZoneSeparator,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"

const meta = preview.meta({
	title: "Navigation/AppSidebarRosterParts",
	component: RosterDropArea,
	tags: ["test-only"],
	parameters: { layout: "centered" },
	args: { landing: "desk", isLanding: false, children: null },
})

export const WorkingBotAvatar = meta.story({
	render: () => <BotRowAvatar bot={BEACON} />,
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector("svg, img, canvas")).not.toBeNull()
	},
})

export const ZoneSeparator = meta.story({
	render: () => (
		<div className="flex w-48 flex-col">
			<RosterZoneSeparator />
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "roster-zone-separator"),
		).toHaveAttribute("aria-hidden", "true")
	},
})

export const EmptySectionDrop = meta.story({
	render: () => <SectionDropZone name={ATLAS.name} />,
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "roster-section-drop")).toBeVisible()
	},
})
