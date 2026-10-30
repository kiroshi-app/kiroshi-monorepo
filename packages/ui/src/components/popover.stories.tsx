import type { ComponentType, ReactNode } from "react"
import { expect, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_FLOATING_FOCUS_GUARDS,
	Row,
} from "@workspace/storybook/story-utils"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@workspace/ui/components/ui/popover"

type PopoverArgs = {
	children?: ReactNode
	defaultOpen?: boolean
	open?: boolean
}

const TypedPopover = Popover as ComponentType<PopoverArgs>

const PANEL_TITLE = "Release notes"

const PANEL_NOTE = "Agents keep their transcript when the window is reopened."

const LONG_NOTE =
	"The workspace shell paints its first frame before the roster resolves, so a cold start no longer stares at an empty column, and a tool result arriving after a stop no longer takes the window down with it."

const PanelDemo = ({ note }: { note: string }) => (
	<>
		<PopoverTrigger render={<Button variant="outline" />}>
			{PANEL_TITLE}
		</PopoverTrigger>
		<PopoverContent>
			<PopoverHeader>
				<PopoverTitle>{PANEL_TITLE}</PopoverTitle>
				<PopoverDescription>{note}</PopoverDescription>
			</PopoverHeader>
		</PopoverContent>
	</>
)

const meta = preview.meta({
	title: "Overlays/Popover",
	component: TypedPopover,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The anchored panel as the shadcn registry ships it: `PopoverContent` carries its own portal and positioner, and `side`, `align` and `sideOffset` are props on it rather than on the root. It flips and shifts to stay in the viewport. Reach for `PopoverPanel` when the panel has to wear the repo's popup surface at one of its two anchors.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<Popover>
			<PanelDemo note={PANEL_NOTE} />
		</Popover>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"The nominal case, opened by a click. Check the panel is titled by its `PopoverTitle` and that a second click on the trigger closes it - the trigger toggles, it does not only open. The app reaches the registry popover through `PopoverPanel` at `apps/app/src/components/thread-screen.tsx:322`.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: PANEL_TITLE })

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "true")
		const panel = await body.findByRole("dialog", { name: PANEL_TITLE })
		await waitFor(async () => expect(panel).toBeVisible())

		await userEvent.click(trigger)
		await expect(trigger).toHaveAttribute("aria-expanded", "false")
	},
})

export const States = meta.story({
	tags: ["test-only"],
	render: () => (
		<Row>
			<Popover>
				<PanelDemo note={PANEL_NOTE} />
			</Popover>
			<Popover>
				<PopoverTrigger render={<Button disabled variant="outline" />}>
					Unavailable
				</PopoverTrigger>
				<PopoverContent>
					<PopoverTitle>Unavailable</PopoverTitle>
				</PopoverContent>
			</Popover>
		</Row>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Keyboard focus and a disabled trigger. Check Tab reaches the first trigger with a visible ring and Enter opens its panel, and that the disabled trigger takes neither focus nor a click.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const trigger = canvas.getByRole("button", { name: PANEL_TITLE })

		await expect(
			canvas.getByRole("button", { name: "Unavailable" }),
		).toBeDisabled()

		await userEvent.tab()
		await expect(trigger).toHaveFocus()
		await expect(trigger.matches(":focus-visible")).toBe(true)

		await userEvent.keyboard("{Enter}")
		const panel = await body.findByRole("dialog", { name: PANEL_TITLE })
		await waitFor(async () => expect(panel).toBeVisible())
	},
})

export const LongContent = meta.story({
	tags: ["test-only"],
	render: () => (
		<Popover defaultOpen>
			<PanelDemo note={LONG_NOTE} />
		</Popover>
	),
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"A note far longer than the trigger it grew from. Check the panel keeps its 18rem width and wraps instead of running off the viewport. Anything longer than this belongs in a dialog - see `Overlays/Dialog`.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const panel = await body.findByRole("dialog", { name: PANEL_TITLE })

		await expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(
			window.innerWidth,
		)
	},
})
