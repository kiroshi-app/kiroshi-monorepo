import { useState } from "react"
import { expect, fn, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	lineHeightOf,
} from "@workspace/storybook/story-utils"
import {
	RoutineRow,
	type RoutineRowProps,
} from "@workspace/ui/components/routine-row"
import {
	MORNING_DIGEST,
	RELEASE_WATCH,
} from "@workspace/ui/components/routines.fixtures"
import { ROUTINES_PANEL_WIDTH } from "@workspace/ui/components/routines-panel"

const LONG_TITLE =
	"Read every changelog of every package this workspace depends on and summarise it"

const RowHost = (props: RoutineRowProps) => {
	const [isEnabled, setEnabled] = useState(props.isEnabled)

	return (
		<RoutineRow
			{...props}
			hasStoppedItself={props.hasStoppedItself && !isEnabled}
			isEnabled={isEnabled}
			onEnabledChange={(next) => {
				setEnabled(next)
				props.onEnabledChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Conversation/Routines/RoutineRow",
	component: RoutineRow,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One routine of a conversation, as it reads in the routines panel: its title on one line, the source that fires it under it, the switch that holds it on or off, and the way to delete it. The row is the whole surface a reader gets before the editor exists, so it never truncates the switch or the badge to make room for a long title — the title gives way instead. Reach for it inside `RoutinesPanel`; on its own it is only useful to check one row's states.",
			},
		},
	},
	args: {
		...MORNING_DIGEST,
		onEnabledChange: fn(),
		onDelete: fn(),
	},
	render: (args) => (
		<ul className="flex flex-col gap-2" style={{ width: ROUTINES_PANEL_WIDTH }}>
			<RowHost {...args} />
		</ul>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A routine running on its own schedule, switched on and healthy. Check that the title and the source read as two steps of one sentence, and that the switch is the only thing that changes when it is thrown. `packages/ui/src/components/routines-panel.tsx:298` lists one row per stored routine, with the switch and the menu wired to the routines controller.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const routine = canvas.getByRole("switch", { name: MORNING_DIGEST.title })

		await expect(routine).toBeChecked()
		await userEvent.click(routine)
		await expect(args.onEnabledChange).toHaveBeenCalledWith(false)
	},
})

export const StoppedItself = meta.story({
	args: RELEASE_WATCH,
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The routine failed often enough that it switched itself off. The badge says so in words, not in colour alone, and it is drawn on the destructive status token — the palette's known contrast gap, flagged for review rather than nudged here. Check that enabling the routine again clears the badge in the same press, and that the badge keeps its full size while the title truncates beside it. `packages/ui/src/components/routines-panel.tsx:298` lists one row per stored routine, with the switch and the menu wired to the routines controller.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("Stopped itself")).toBeVisible()

		const routine = canvas.getByRole("switch", { name: RELEASE_WATCH.title })
		await expect(routine).not.toBeChecked()

		await userEvent.click(routine)
		await expect(args.onEnabledChange).toHaveBeenCalledWith(true)
		await waitFor(() =>
			expect(canvas.queryByText("Stopped itself")).not.toBeInTheDocument(),
		)
	},
})

export const LongContent = meta.story({
	args: { ...RELEASE_WATCH, title: LONG_TITLE },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A title no reader would write, in a panel at its 320px width. Check that the title stays on one line and ends in an ellipsis rather than wrapping the row to two, and that neither the switch nor the badge is squeezed by it. `packages/ui/src/components/routines-panel.tsx:298` lists one row per stored routine, with the switch and the menu wired to the routines controller.",
			},
		},
	},
	play: async ({ canvas }) => {
		const title = canvas.getByText(LONG_TITLE)
		const routine = canvas.getByRole("switch", { name: LONG_TITLE })
		const badge = canvas.getByText("Stopped itself")

		await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth)
		await expect(title.getBoundingClientRect().height).toBeLessThanOrEqual(
			lineHeightOf(title),
		)
		await expect(routine.getBoundingClientRect().width).toBe(32)
		await expect(badge.scrollWidth).toBe(badge.clientWidth)
	},
})

export const Deleting = meta.story({
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"The question that stands before a deletion. Check that the routine is named in the title rather than left to `this routine`, and that the row is still there until the deletion resolves — the caller removes it, the dialog only asks. `packages/ui/src/components/routines-panel.tsx:298` lists one row per stored routine, with the switch and the menu wired to the routines controller.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: `Delete ${MORNING_DIGEST.title}` }),
		)

		const question = await screen.findByRole("alertdialog")
		await waitFor(() => expect(question).toBeVisible())
		await expect(
			await screen.findByText(`Delete ${MORNING_DIGEST.title}?`),
		).toBeVisible()

		await userEvent.click(
			await screen.findByRole("button", { name: "Delete routine" }),
		)
		await expect(args.onDelete).toHaveBeenCalled()
	},
})
