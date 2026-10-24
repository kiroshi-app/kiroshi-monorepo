import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectAnswered,
	expectNeedingYou,
	expectQuestionCutInsideTheRow,
	SidebarFrame,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	ATLAS,
	BEACON,
	LONG_PENDING_QUESTION,
	PENDING_QUESTION,
	SIDEBAR_SECTION,
	SIDEBAR_SPACES,
	STILL_LIFT,
} from "@workspace/ui/components/app-sidebar.fixtures"
import { BotRosterRow } from "@workspace/ui/components/app-sidebar-bot-row"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"

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

export const WorkingBotKeepsItsTimestamp = meta.story({
	args: { bot: BEACON, isSelected: false },
	play: async ({ canvas, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(
			slotIn(slotIn(row, "roster-row-preview"), "text-shimmer"),
		).toBeVisible()
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
			BEACON.timestamp ?? "",
		)
		await expect(canvas.getAllByRole("button")).toEqual([row])
	},
})

const ATLAS_NEEDING_YOU = {
	...ATLAS,
	badge: "attention" as const,
	pendingQuestion: PENDING_QUESTION,
}

const DARK = { theme: "dark", theme_layout: "single" }

const expectBotNeedingYou = async (canvasElement: HTMLElement) => {
	const row = slotIn(canvasElement, "sidebar-menu-button")
	await expectNeedingYou(row, PENDING_QUESTION)
	await expect(
		getComputedStyle(slotIn(row, "roster-row-needs-you")).paddingInlineEnd,
	).toBe("4px")
}

const expectBotAnswered = async (canvasElement: HTMLElement) => {
	const row = slotIn(canvasElement, "sidebar-menu-button")
	await expectAnswered(row)
	await expect(slotIn(row, "roster-row-preview")).toHaveTextContent(
		ATLAS.lastMessage ?? "",
	)
}

export const BotNeedingYou = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: { bot: ATLAS_NEEDING_YOU, isSelected: false },
	play: ({ canvasElement }) => expectBotNeedingYou(canvasElement),
})

export const BotNeedingYouDark = meta.story({
	globals: DARK,
	args: { bot: ATLAS_NEEDING_YOU, isSelected: false },
	play: ({ canvasElement }) => expectBotNeedingYou(canvasElement),
})

export const BotAnswered = meta.story({
	args: { isSelected: false },
	play: ({ canvasElement }) => expectBotAnswered(canvasElement),
})

export const BotAnsweredDark = meta.story({
	globals: DARK,
	args: { isSelected: false },
	play: ({ canvasElement }) => expectBotAnswered(canvasElement),
})

export const BotLongQuestionStaysOnOneLine = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: {
		bot: { ...ATLAS_NEEDING_YOU, pendingQuestion: LONG_PENDING_QUESTION },
		isSelected: false,
	},
	play: ({ canvasElement }) =>
		expectQuestionCutInsideTheRow(slotIn(canvasElement, "sidebar-menu-button")),
})
