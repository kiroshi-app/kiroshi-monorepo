import type { ComponentProps } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	expectAnswered,
	expectMutedUntilHoveredOrActive,
	expectNeedingYou,
	expectQuestionCutInsideTheRow,
	expectTooltipCard,
	expectTooltipPastTheSidebarEdge,
	openTooltipOf,
	SidebarFrame,
	slotIn,
	slotsIn,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import type { AppSidebarBot } from "@workspace/ui/components/app-sidebar"
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
import { CompactRowsContext } from "@workspace/ui/components/compact-rows"
import { formatSentDate } from "@workspace/ui/components/message"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/components/sidebar-menu-row"
import { SidebarMenu } from "@workspace/ui/components/ui/sidebar"

const meta = preview.meta({
	title: "Navigation/AppSidebarBotRow",
	component: BotRosterRow,
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
	tags: ["test-only"],
	play: async ({ args, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(row).toHaveAttribute("aria-current", "page")
		await expect(within(row).getByText(ATLAS.name)).toBeVisible()
		row.click()
		await expect(args.onSelect).toHaveBeenCalledWith(
			ATLAS.id,
			NO_CLICK_MODIFIERS,
		)
	},
})

export const BotOwnRowKeepsItsAvatarAndNoPile = meta.story({
	tags: ["test-only"],
	args: { isSelected: false },
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		const avatar = slotIn(row, "bot-identity-avatar").getBoundingClientRect()
		await expect([avatar.width, avatar.height]).toEqual([28, 28])
		await expect(
			row.querySelector('[data-slot="conversation-subject-icon"]'),
		).toBeNull()
		await expect(
			row.querySelector('[data-slot="conversation-bot-pile"]'),
		).toBeNull()
	},
})

export const WorkingBotKeepsItsTimestamp = meta.story({
	tags: ["test-only"],
	args: { bot: BEACON, isSelected: false },
	play: async ({ canvas, canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(
			slotIn(slotIn(row, "roster-row-preview"), "shimmer-text"),
		).toBeVisible()
		await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
			BEACON.timestamp ?? "",
		)
		await expect(canvas.getAllByRole("button")).toEqual([row])
	},
})

const expectWorkingPreview = async (
	canvasElement: HTMLElement,
	text: string,
) => {
	const row = slotIn(canvasElement, "sidebar-menu-button")
	const preview = slotIn(row, "roster-row-preview")
	await expect(slotIn(preview, "shimmer-text")).toBeVisible()
	await expect(preview.textContent).toBe(text)
	await expect(slotIn(row, "roster-row-timestamp")).toHaveTextContent(
		BEACON.timestamp ?? "",
	)
}

export const WorkingBotWaitingOnTwoBackgroundTasks = meta.story({
	args: { bot: { ...BEACON, backgroundTasks: 2 }, isSelected: false },
	play: ({ canvasElement }) =>
		expectWorkingPreview(canvasElement, "waiting on 2 background tasks"),
})

export const WorkingBotWaitingOnOneBackgroundTask = meta.story({
	args: { bot: { ...BEACON, backgroundTasks: 1 }, isSelected: false },
	play: ({ canvasElement }) =>
		expectWorkingPreview(canvasElement, "waiting on 1 background task"),
})

export const IdleBotIgnoresItsBackgroundTasks = meta.story({
	tags: ["test-only"],
	args: {
		bot: { ...BEACON, status: "idle", backgroundTasks: 2 },
		isSelected: false,
	},
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		await expect(slotIn(row, "roster-row-preview").textContent).toBe(
			BEACON.lastMessage,
		)
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
	tags: ["test-only"],
	args: { isSelected: false },
	play: ({ canvasElement }) => expectBotAnswered(canvasElement),
})

export const BotAnsweredDark = meta.story({
	tags: ["test-only"],
	globals: DARK,
	args: { isSelected: false },
	play: ({ canvasElement }) => expectBotAnswered(canvasElement),
})

export const BotLongQuestionStaysOnOneLine = meta.story({
	tags: ["test-only"],
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	args: {
		bot: { ...ATLAS_NEEDING_YOU, pendingQuestion: LONG_PENDING_QUESTION },
		isSelected: false,
	},
	play: ({ canvasElement }) =>
		expectQuestionCutInsideTheRow(slotIn(canvasElement, "sidebar-menu-button")),
})

const AT_REST_BOT: AppSidebarBot = { ...ATLAS, id: "at-rest", name: "At rest" }

const HOVERED_BOT: AppSidebarBot = { ...ATLAS, id: "hovered", name: "Hovered" }

const ACTIVE_BOT: AppSidebarBot = { ...ATLAS, id: "active", name: "Active" }

const renderCompactRowStates = (args: ComponentProps<typeof BotRosterRow>) => (
	<CompactRowsContext.Provider value>
		{[AT_REST_BOT, HOVERED_BOT, ACTIVE_BOT].map((bot) => (
			<BotRosterRow
				{...args}
				bot={bot}
				isSelected={bot === ACTIVE_BOT}
				key={bot.id}
			/>
		))}
	</CompactRowsContext.Provider>
)

const avatarPartsOf = (row: HTMLElement) => {
	const avatar = slotIn(row, "bot-identity-avatar")
	return [avatar, ...avatar.querySelectorAll("*")]
}

const compactRowStatesStory = (globals?: { theme: "dark" }) => ({
	globals,
	render: renderCompactRowStates,
	parameters: {
		pseudo: { hover: 'li:nth-child(2) [data-slot="sidebar-menu-button"]' },
		docs: {
			description: {
				story:
					"Three agents as the expanded sidebar lists them: one at rest, one under the pointer, one open. Check the name sits in `--muted-foreground` at rest and in `--sidebar-foreground` under the pointer and on the open row, that the colour switches with no fade, and that the avatar reads `--muted-foreground` from its slot on all three, under the pointer included.",
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const [atRest, hovered, active] = slotsIn(
			canvasElement,
			"sidebar-menu-button",
		) as HTMLElement[]

		await expect(active).toHaveAttribute("aria-current", "page")
		await expectMutedUntilHoveredOrActive({
			states: { atRest, hovered, active },
			inkedPartsOf: (row) => [slotIn(row, "roster-row-name")],
			steadyPartsOf: avatarPartsOf,
			fullInk: "text-sidebar-foreground",
		})
		for (const row of [atRest, hovered, active])
			await expect(
				getComputedStyle(slotIn(row, "bot-identity-avatar")).color,
			).toBe(tokenStyleIn(atRest, "text-muted-foreground", "color"))
	},
})

export const CompactRowAtRestHoveredAndActive = meta.story(
	compactRowStatesStory(),
)

export const CompactRowAtRestHoveredAndActiveDark = meta.story(
	compactRowStatesStory({ theme: "dark" }),
)

const SPOKEN_AT = new Date(2026, 10, 12, 9, 24).getTime()

const SPOKEN_ATLAS: AppSidebarBot = { ...ATLAS, lastActivityAt: SPOKEN_AT }

export const TooltipCarriesTheAgentNameAndTitle = meta.story({
	args: { bot: SPOKEN_ATLAS, isSelected: false },
	decorators: [
		(Story) => (
			<>
				<li aria-hidden="true" className="h-40" />
				<Story />
			</>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"The pointer resting on an agent row. Check the tooltip names the agent with its title on one line, then its last message and the full date of that message, with no line for seated agents, that it sits just past the sidebar edge and centred on the row, and that the row gains it as its description.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const row = slotIn(canvasElement, "sidebar-menu-button")
		const tooltip = await openTooltipOf(row)
		const sentDate = formatSentDate(SPOKEN_AT)

		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-heading"),
		).toHaveTextContent("Atlas · Research")
		await expect(slotsIn(tooltip, "sidebar-row-tooltip-agents")).toEqual([])
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-message"),
		).toHaveTextContent(ATLAS.lastMessage ?? "")
		await expect(slotIn(tooltip, "sidebar-row-tooltip-time")).toHaveTextContent(
			sentDate,
		)
		await expectTooltipCard(tooltip)
		await expectTooltipPastTheSidebarEdge(row, tooltip)
		await expect(row).toHaveAccessibleDescription(
			["Atlas · Research", ATLAS.lastMessage, sentDate].join("\n"),
		)
	},
})
