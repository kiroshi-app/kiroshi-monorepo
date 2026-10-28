import type { CSSProperties } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSoloAvatarInBothThemes,
	expectSubjectIconInBothThemes,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	ATLAS,
	BEACON,
	DESK_ROOM,
} from "@workspace/ui/components/app-sidebar.fixtures"
import type { AppSidebarConversation } from "@workspace/ui/components/app-sidebar-model"
import {
	BotRowAvatar,
	InsertionLine,
	LiftedRow,
	RosterDropArea,
	RosterZoneSeparator,
	SectionDropZone,
} from "@workspace/ui/components/app-sidebar-roster-parts"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"

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

export const InsertionMarkAbove = meta.story({
	render: () => (
		<div className="relative h-10 w-48">
			<InsertionLine edge="above" />
		</div>
	),
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "roster-insertion")).toHaveClass(
			"-top-0.5",
		)
	},
})

const LIFTED_SIDE = 40

const POINTER = 48

const POINTER_HOLDER: CSSProperties = {
	"--lift-x": `${POINTER}px`,
	"--lift-y": `${POINTER}px`,
} as CSSProperties

type LiftedConversationAtPointerProps = {
	conversation: AppSidebarConversation
}

const LiftedConversationAtPointer = ({
	conversation,
}: LiftedConversationAtPointerProps) => (
	<div
		className="relative size-24 [transform:translateZ(0)]"
		data-slot="lifted-pointer-holder"
		style={POINTER_HOLDER}
	>
		<LiftedRow conversation={conversation} ref={() => undefined} />
	</div>
)

const expectLiftedOnPointer = async (canvasElement: HTMLElement) => {
	const holders = slotsIn(canvasElement, "lifted-pointer-holder")
	await expect(holders).toHaveLength(2)
	for (const holder of holders) {
		const lifted = slotIn(holder, "roster-lifted-bot")
		const at = holder.getBoundingClientRect()
		const box = lifted.getBoundingClientRect()
		await expect(lifted).toHaveAttribute("aria-hidden", "true")
		await expect(getComputedStyle(lifted).filter).toContain("drop-shadow")
		await expect(box.left + box.width / 2 - at.left).toBe(POINTER)
		await expect(box.top + box.height / 2 - at.top).toBe(POINTER)
	}
}

export const ThemesLiftedSolo = meta.story({
	globals: { theme_layout: "side-by-side" },
	render: () => (
		<LiftedConversationAtPointer
			conversation={{ ...DESK_ROOM, participants: [ATLAS] }}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectSoloAvatarInBothThemes(canvasElement, LIFTED_SIDE)
		await expectLiftedOnPointer(canvasElement)
	},
})

export const ThemesLiftedGroup = meta.story({
	globals: { theme_layout: "side-by-side" },
	render: () => <LiftedConversationAtPointer conversation={DESK_ROOM} />,
	play: async ({ canvasElement }) => {
		await expectSubjectIconInBothThemes(canvasElement, LIFTED_SIDE)
		await expectLiftedOnPointer(canvasElement)
	},
})

export const ThemesLiftedGroupRed = meta.story({
	globals: { theme_layout: "side-by-side" },
	render: () => (
		<LiftedConversationAtPointer
			conversation={{ ...DESK_ROOM, color: BLOT_HUES.red, icon: "ShieldKey" }}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectSubjectIconInBothThemes(canvasElement, LIFTED_SIDE)
		await expectLiftedOnPointer(canvasElement)
	},
})

export const LandingAreaWithMarkBelow = meta.story({
	args: { isLanding: true, insertion: "below", children: ATLAS.name },
	play: async ({ canvasElement }) => {
		const area = slotIn(canvasElement, "roster-drop-area")
		await expect(area).toHaveAttribute("data-landing", "true")
		await expect(slotIn(area, "roster-insertion")).toHaveClass("-bottom-0.5")
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
