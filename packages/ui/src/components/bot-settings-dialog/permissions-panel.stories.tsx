import { useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	BLANK_BOT_PERMISSIONS,
	BOT_PERMISSION_MODES,
} from "@workspace/ui/components/bot-settings"
import {
	PermissionsPanel,
	type PermissionsPanelProps,
} from "@workspace/ui/components/bot-settings-dialog/permissions-panel"
import { i18n } from "@workspace/ui/lib/i18n"

const PermissionsHost = (props: PermissionsPanelProps) => {
	const [permissions, setPermissions] = useState(props.permissions)

	return (
		<PermissionsPanel
			{...props}
			onPermissionsChange={(next) => {
				setPermissions(next)
				props.onPermissionsChange(next)
			}}
			permissions={permissions}
		/>
	)
}

type SelectedMode = {
	position: number
	label: string
	hint: string
}

const selectingMode = ({ position, label, hint }: SelectedMode) => ({
	args: {
		permissions: {
			...BLANK_BOT_PERMISSIONS,
			defaultMode: BOT_PERMISSION_MODES[position],
		},
	},
	parameters: {
		docs: {
			description: {
				story: `The answer at position ${position} of the shared modes, picked. Check that the field reads ${label} and the hint under it says what that answer lets through.`,
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)

		await expect(
			canvas.getByRole("combobox", { name: /Default answer/ }),
		).toHaveTextContent(label)
		await expect(canvas.getByText(hint)).toBeVisible()
	},
})

const meta = preview.meta({
	title: "Settings/Bot/PermissionsPanel",
	component: PermissionsPanel,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"What a companion is allowed to do: the answer it gives a request by default, then the rules that override it — allowed, asked, refused. The mode is a picker because there are five answers and no more; the rules are lists because there is no telling how many a reader needs. A rule is written the way the runtime reads it, `Tool` or `Tool(specifier)`, and one written any other way is refused at the field rather than saved and dropped later. There is no sixth mode: the one that waves everything through is not offered here at all.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex w-full max-w-md flex-col gap-4">
				<Story />
			</div>
		),
	],
	args: {
		permissions: {
			...BLANK_BOT_PERMISSIONS,
			allow: ["Read", "Bash(git status:*)"],
			deny: ["Bash", "Edit", "Write", "NotebookEdit"],
		},
		onPermissionsChange: fn(),
	},
	render: (args) => <PermissionsHost {...args} />,
})

export const Playground = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Knob story. Check that the four lists read as one panel rather than four fields stacked by accident, and that a rule too long for its row truncates instead of widening the column.",
			},
		},
	},
})

export const Untouched = meta.story({
	args: { permissions: BLANK_BOT_PERMISSIONS },
	parameters: {
		docs: {
			description: {
				story:
					"A companion nobody has ruled on yet. Every list says what its emptiness means rather than showing a blank space, so `no rules` never reads as `settings failed to load`.",
			},
		},
	},
})

export const AskEveryTime = meta.story(
	selectingMode({
		position: 0,
		label: "Ask every time",
		hint: "You approve every tool the rules below don’t cover.",
	}),
)

export const AcceptEdits = meta.story(
	selectingMode({
		position: 1,
		label: "Accept edits",
		hint: "File edits go through. You approve everything else.",
	}),
)

export const PlanFirst = meta.story(
	selectingMode({
		position: 2,
		label: "Plan first",
		hint: "The companion reads and plans, and changes nothing until you approve.",
	}),
)

export const DecideAlone = meta.story(
	selectingMode({
		position: 3,
		label: "Decide alone",
		hint: "The companion decides on its own, within the rules below.",
	}),
)

export const NeverAsk = meta.story(
	selectingMode({
		position: 4,
		label: "Never ask",
		hint: "You’re never asked. Only the deny rules below stop the companion.",
	}),
)

export const PickingTheMode = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The five answers a request can meet before any rule applies. Check that the one that waves everything through is nowhere in the list. Picking an answer closes the list a frame after the click, so the story waits for the list and its focus guards to leave the document before the audit reads it.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("combobox", { name: /Default answer/ }),
		)

		const plan = await screen.findByRole("option", { name: "Plan first" })

		await expect(
			screen.getAllByRole("option").map((option) => option.textContent),
		).toEqual(
			BOT_PERMISSION_MODES.map((mode) =>
				i18n.getResource(
					i18n.language,
					"bots",
					`approvals.mode.option.${mode}.label`,
				),
			),
		)

		await expect(
			screen.queryByRole("option", { name: /bypass/i }),
		).not.toBeInTheDocument()

		await userEvent.click(plan)

		await expect(args.onPermissionsChange).toHaveBeenCalledWith(
			expect.objectContaining({ defaultMode: "plan" }),
		)

		await waitFor(() => {
			expect(document.querySelector("[data-base-ui-focus-guard]")).toBeNull()
			expect(screen.queryAllByRole("option")).toHaveLength(0)
		})
	},
})

export const RefusingAMalformedRule = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A rule the runtime would not understand. The field keeps it in the input, says how a rule is written, and leaves the list untouched — a rule saved and silently dropped is a permission the reader believes they set.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.type(canvas.getByLabelText("Denied"), "rm -rf /")
		await userEvent.click(
			canvas.getAllByRole("button", { name: "Add" })[2] as HTMLElement,
		)

		await expect(args.onPermissionsChange).not.toHaveBeenCalled()
		await expect(canvas.getByRole("alert")).toBeVisible()
	},
})
