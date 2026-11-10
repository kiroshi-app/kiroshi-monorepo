import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { BEACON } from "@workspace/ui/components/app-sidebar.fixtures"
import {
	BotRowAvatar,
	RosterDropArea,
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

export const EmptySectionDrop = meta.story({
	render: () => <SectionDropZone />,
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "roster-section-drop")).toBeVisible()
	},
})
