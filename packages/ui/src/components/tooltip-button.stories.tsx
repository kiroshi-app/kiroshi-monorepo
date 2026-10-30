import { expect, fn, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Row } from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"

const LONG_TOOLTIP =
	"Sends the prompt to the agent currently holding the conversation, then waits for its first token"

const meta = preview.meta({
	title: "Primitives/TooltipButton",
	component: TooltipButton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The registry `Button` with a label that opens on hover and on focus. It is the one composition that pairs the vendored button with `TooltipHint`, so an icon-only control can carry a name without a visible one. Nothing links the bubble to the button: there is no `aria-describedby` between them, so a screen reader never reads the tooltip and the `aria-label` is what has to carry the name.",
			},
		},
	},
	args: { onClick: fn() },
})

export const Default = meta.story({
	args: {
		"aria-label": "Copy",
		size: "icon-sm",
		tooltip: "Copy",
		variant: "ghost",
		children: <Icons.Copy />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: an icon-only control whose meaning lives in the tooltip. Check that the button is rendered as itself, with no wrapper around it, so a row of them keeps the same rhythm as plain buttons.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button", { name: "Copy" })

		await expect(button.parentElement?.tagName).not.toBe("SPAN")
	},
})

export const States = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Keyboard focus and the disabled state side by side. Check that Tab reaches the first control and opens its label without a pointer, and that the disabled control takes no focus and shows no label — a tooltip on an unreachable button is a label nobody can read.",
			},
		},
	},
	render: () => (
		<Row>
			<TooltipButton aria-label="Copy" size="icon-sm" tooltip="Copy">
				<Icons.Copy />
			</TooltipButton>
			<TooltipButton
				aria-label="Delete"
				disabled
				size="icon-sm"
				tooltip="Delete"
				variant="destructive"
			>
				<Icons.Delete />
			</TooltipButton>
		</Row>
	),
	play: async ({ canvas, userEvent }) => {
		const copy = canvas.getByRole("button", { name: "Copy" })
		const remove = canvas.getByRole("button", { name: "Delete" })

		await expect(remove).toBeDisabled()

		await userEvent.tab()
		await expect(copy).toHaveFocus()
		await waitFor(async () => {
			await expect(
				document.body.querySelector('[role="tooltip"]'),
			).toBeVisible()
		})
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	args: {
		tooltip: LONG_TOOLTIP,
		variant: "outline",
		children: "Send",
	},
	parameters: {
		docs: {
			description: {
				story:
					"A sentence rather than a word. Check that the label wraps inside the viewport instead of running off its edge, which is what a translated string will do to any tooltip sized for English.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Send" }))
		await waitFor(async () => {
			const label = document.body.querySelector('[role="tooltip"]')

			await expect(label).toBeVisible()
			await expect(label?.getBoundingClientRect().right).toBeLessThanOrEqual(
				window.innerWidth,
			)
		})
	},
})

export const WithSide = meta.story({
	args: {
		"aria-label": "New agent",
		size: "icon-sm",
		tooltip: "New agent",
		tooltipSide: "bottom",
		variant: "ghost",
		children: <Icons.Add />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"`tooltipSide` for the controls that have nothing above them: a button pinned to the top of a window opens its label downwards or off the screen. Check that the label sits under the button.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name: "New agent" })

		await userEvent.hover(button)
		await waitFor(async () => {
			const label = document.body.querySelector('[role="tooltip"]')

			await expect(label).toBeVisible()
			await expect(label?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				button.getBoundingClientRect().bottom,
			)
		})
	},
})
