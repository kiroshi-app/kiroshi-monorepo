import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { SidebarFrame, slotIn } from "@workspace/storybook/story-utils"
import {
	ATLAS,
	BEACON,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"

const meta = preview.meta({
	title: "Navigation/AppSidebarBotRow",
	component: BotRosterRow,
	tags: ["test-only"],
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<SidebarFrame>
				<SidebarMenu>
					<Story />
				</SidebarMenu>
			</SidebarFrame>
		),
	],
	args: {
		bot: ATLAS,
		isSelected: true,
		isPinned: false,
		lift: STILL_LIFT,
		memberships: [SIDEBAR_SPACES[0].id],
		sections: [SIDEBAR_SECTION],
		spaces: SIDEBAR_SPACES,
		openSpaceId: SIDEBAR_SPACES[0].id,
		onSelect: fn(),
	},
})

export const SelectedBot = meta.story({
	play: async ({ args, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(row).toHaveAttribute("aria-current", "page")
		await expect(within(row).getByText(ATLAS.name)).toBeVisible()
		row.click()
		await expect(args.onSelect).toHaveBeenCalledWith(ATLAS.id)
	},
})

export const BotOwnRowKeepsItsAvatarAndNoPile = meta.story({
	args: { isSelected: false },
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		const avatar = slotIn(row, "bot-identity-avatar").getBoundingClientRect()
		await expect([avatar.width, avatar.height]).toEqual([40, 40])
		await expect(
			row.querySelector('[data-slot="conversation-subject-icon"]'),
		).toBeNull()
		await expect(
			row.querySelector('[data-slot="conversation-bot-pile"]'),
		).toBeNull()
	},
})

const liftDown = fn()

const LIFT_SPYING_ON_DOWN: Lifter = {
	...STILL_LIFT,
	handlersFor: (id) => ({
		...STILL_LIFT.handlersFor(id),
		onPointerDown: liftDown,
	}),
}

export const WorkingBotStopsWithItsId = meta.story({
	args: {
		bot: BEACON,
		isSelected: false,
		lift: LIFT_SPYING_ON_DOWN,
		onStop: fn(),
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: `Stop ${BEACON.name}` }),
		)
		await expect(args.onStop).toHaveBeenCalledOnce()
		await expect(args.onStop).toHaveBeenCalledWith(BEACON.id)
		await expect(args.onSelect).not.toHaveBeenCalled()
		await expect(liftDown).not.toHaveBeenCalled()
		await expect(within(document.body).queryByRole("menu")).toBeNull()
	},
})

export const IdleBotGivenOnStopHasNoStop = meta.story({
	args: { isSelected: false, onStop: fn() },
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button", { name: /^Stop / })).toBeNull()
	},
})
