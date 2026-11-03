import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	LATE_REPORTED_RUN,
	REPORTED_RUN,
} from "@workspace/ui/components/missions.fixtures"
import { ReportedRunRow } from "@workspace/ui/components/reported-run-row"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"

const LONG_TITLE =
	"Read every release of the packages this workspace depends on and write what changed"

const meta = preview.meta({
	title: "Conversation/Routines/ReportedRunRow",
	component: ReportedRunRow,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"A run of a routine that reported something, as it reads in the Earlier today group of the activity panel. It is the bare row of a mission with nothing to open: the companion's blot carries no state dot, the routine title holds the title line at the foreground colour, and the meta line names the routine mark, the trigger that fired it, the companion that ran it and the word reported. The time it reported sits on the trailing slot in the clock format a closed mission uses.",
			},
		},
	},
	args: REPORTED_RUN,
	render: (args) => (
		<ul
			className="flex flex-col gap-0.5"
			style={{ width: ROUTINES_PANEL_WIDTH }}
		>
			<ReportedRunRow {...args} />
		</ul>
	),
})

export const Reported = meta.story({
	args: { bot: { ...REPORTED_RUN.bot, blot: BLOT_HUES.purple } },
	parameters: {
		docs: {
			description: {
				story:
					"A morning digest that reported at 08:04. Check that the agent's face wears its own blot rather than the default blue-grey, that the routine title reads at the foreground colour rather than muted, that no badge dot is drawn on the glyph, that the trigger, the agent and the word reported follow the routine mark, and that the row answers neither the pointer nor the keyboard. `packages/ui/src/components/routines-panel.tsx:384` lists one row per run that reported earlier today, from the rows `apps/app/src/lib/missions/missions-model.ts:174` builds.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText(REPORTED_RUN.routineTitle)).toBeVisible()
		await expect(
			canvas.getByRole("img", { name: REPORTED_RUN.bot.name }),
		).toBeVisible()
		await expect(
			canvas.getByText(REPORTED_RUN.triggerSourceTitle),
		).toBeVisible()
		await expect(canvas.getByText(REPORTED_RUN.bot.name)).toBeVisible()
		await expect(canvas.getByText("reported")).toBeVisible()
		await expect(canvas.getByText("08:04")).toBeVisible()
		await expect(
			canvasElement.querySelector('[data-slot="bot-activity-dot"]'),
		).toBeNull()
		await expect(canvas.queryByRole("button")).not.toBeInTheDocument()
		await expect(slotIn(canvasElement, "companion-field")).toHaveAttribute(
			"data-hue",
			String(BLOT_HUES.purple),
		)
	},
})

export const AnotherBot = meta.story({
	args: LATE_REPORTED_RUN,
	parameters: {
		docs: {
			description: {
				story:
					"A run of another routine, watched by another companion. Check that the row reads its own companion's blot and its own trigger rather than borrowing the ones above it in the group. `packages/ui/src/components/routines-panel.tsx:384` lists one row per run that reported earlier today, from the rows `apps/app/src/lib/missions/missions-model.ts:174` builds.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText(LATE_REPORTED_RUN.bot.name)).toBeVisible()
		await expect(canvas.getByText("10:04")).toBeVisible()
		await expect(slotIn(canvasElement, "companion-field")).not.toHaveAttribute(
			"data-hue",
		)
	},
})

export const LongContent = meta.story({
	args: { ...REPORTED_RUN, routineTitle: LONG_TITLE },
	parameters: {
		docs: {
			description: {
				story:
					"A routine title no reader would write, in a panel at its 320px width. Check that the title stays on one line and ends in an ellipsis, that the time keeps its room at the trailing edge, and that the row keeps the height of a mission row. `packages/ui/src/components/routines-panel.tsx:384` lists one row per run that reported earlier today, from the rows `apps/app/src/lib/missions/missions-model.ts:174` builds.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const title = canvas.getByText(LONG_TITLE)

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(canvas.getByText("08:04")).toBeVisible()
		await expect(
			slotIn(canvasElement, "reported-run-row").getBoundingClientRect().height,
		).toBe(52)
	},
})
