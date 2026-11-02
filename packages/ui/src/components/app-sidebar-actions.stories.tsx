import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SidebarFrame } from "@workspace/storybook/story-utils"
import {
	AppSidebarHeader,
	RosterSurface,
} from "@workspace/ui/components/app-sidebar-actions"

const meta = preview.meta({
	title: "Navigation/AppSidebarActions",
	component: AppSidebarHeader,
	tags: ["test-only"],
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<SidebarFrame>
				<Story />
			</SidebarFrame>
		),
	],
	args: {
		panel: "conversations" as const,
		onCreateBot: fn(),
	},
})

export const ConversationsHeader = meta.story({
	play: async ({ args, canvasElement }) => {
		const header = within(canvasElement)
		await expect(header.getByRole("heading", { level: 2 })).toBeVisible()
		header.getAllByRole("button").at(-1)?.click()
		await expect(args.onCreateBot).toHaveBeenCalled()
	},
})

export const SurfaceAroundEmptyCopy = meta.story({
	render: () => (
		<RosterSurface onCreateBot={fn()}>
			<p>Atlas</p>
		</RosterSurface>
	),
	play: async ({ canvasElement }) => {
		const surface = canvasElement.querySelector('[data-slot="roster-surface"]')
		await expect(surface).not.toBeNull()
		await expect(within(canvasElement).getByText("Atlas")).toBeVisible()
	},
})
