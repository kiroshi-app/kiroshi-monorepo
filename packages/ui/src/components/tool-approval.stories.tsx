import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ToolApproval,
	ToolApprovalCode,
	type ToolApprovalParameter,
} from "@workspace/ui/components/tool-approval"

const BASH_COMMAND = "rm -rf apps/app/dist && bun run build"

const APPROVAL_DESCRIPTION = "The agent needs your approval to run this tool."

const PATH_PARAMETERS: ToolApprovalParameter[] = [
	{
		id: "path",
		label: "Path",
		value: "/Users/ada/kiroshi/apps/app/src/App.tsx",
	},
]

const meta = preview.meta({
	title: "Conversation/Tools/ToolApproval",
	component: ToolApproval,
	parameters: {
		docs: {
			description: {
				component:
					'The blocking surface for a `canUseTool` callback: the agent is paused until the user answers. `Allow once` maps to `{ behavior: "allow", updatedInput }` and `Deny` to `{ behavior: "deny", message }` — both one-shot. There is deliberately no `Always allow`, because persisting a rule means echoing a `localSettings` suggestion into `updatedPermissions`, which writes to `.claude/settings.local.json` and is out of scope for V0.1. `apps/app/src/components/thread-prompt.tsx:38` is the only caller: it names the tool, hands over the title the request carries, and leaves the status on its pending default.',
			},
		},
	},
	args: {
		tool: "Bash",
		title: "Run a shell command?",
		description: APPROVAL_DESCRIPTION,
		parameters: [],
		children: <ToolApprovalCode code={BASH_COMMAND} />,
		onAllowOnce: fn(),
		onDeny: fn(),
	},
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The only state the reader can act on, and the shape `apps/app/src/components/thread-prompt.tsx:60` builds for Bash: the command as code under the copy, with no parameter row beside it. Check that `Allow once` and `Deny` are both reachable by keyboard in that order, that each fires on `Enter` and `Space`, and that no third control offers to remember the decision — a permanent rule is not part of this surface. Pick `WithPath` for the tools that name a path instead.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("group")).toHaveFocus()

		const allowOnce = canvas.getByRole("button", { name: /allow once/i })
		const deny = canvas.getByRole("button", { name: /deny/i })

		await expect(
			canvas.queryByRole("button", { name: /tool input/i }),
		).not.toBeInTheDocument()

		allowOnce.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onAllowOnce).toHaveBeenCalledTimes(1)

		await userEvent.tab()
		await expect(deny).toHaveFocus()
		await userEvent.keyboard(" ")
		await expect(args.onDeny).toHaveBeenCalledTimes(1)

		await expect(
			canvas.queryByRole("button", { name: /always/i }),
		).not.toBeInTheDocument()
	},
})

export const WithPath = meta.story({
	args: {
		tool: "Write",
		title: "Allow this file to be written?",
		parameters: PATH_PARAMETERS,
		children: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `apps/app/src/components/thread-prompt.tsx:46` builds for every tool that is not the shell: the detail of the request becomes the single `Path` row, folded behind the tool input control. Check that the reader can still tell what is being written and where before answering, and that opening the row moves neither decision button. Pick `Default` for the shell, where the command takes the place of the row.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const details = canvas.getByRole("button", { name: /tool input/i })

		await expect(details).toHaveAttribute("aria-expanded", "false")

		await userEvent.click(details)

		await expect(details).toHaveAttribute("aria-expanded", "true")
		await expect(
			canvas.getByText("/Users/ada/kiroshi/apps/app/src/App.tsx"),
		).toBeVisible()
	},
})
