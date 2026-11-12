import type { ComponentType, ReactNode } from "react"
import { useState } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { Disclosure } from "@workspace/ui/components/disclosure"
import { Button } from "@workspace/ui/components/ui/button"

type DisclosureArgs = {
	id?: string
	open: boolean
	children?: ReactNode
}

const TypedDisclosure = Disclosure as ComponentType<DisclosureArgs>

const TRACE = [
	"Read the nest manifest",
	"Rewrote the nest card",
	"Ran the checks",
]

type TraceProps = {
	children?: ReactNode
}

const Trace = ({ children }: TraceProps) => (
	<ul className="space-y-1 pt-2 text-muted-foreground text-sm">
		{TRACE.map((line) => (
			<li key={line}>{line}</li>
		))}
		{children ? <li>{children}</li> : null}
	</ul>
)

const Toggled = () => {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col items-start gap-2">
			<Button
				aria-expanded={open}
				aria-controls="reveal"
				onClick={() => setOpen((current) => !current)}
				size="sm"
				variant="outline"
			>
				{open ? "Hide the trace" : "Show the trace"}
			</Button>
			<Disclosure id="reveal" open={open}>
				<Trace>
					<a
						className="underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
						href="https://nestbook.example/runs/482"
					>
						Open the full run
					</a>
				</Trace>
			</Disclosure>
		</div>
	)
}

const meta = preview.meta({
	title: "Primitives/Disclosure",
	component: TypedDisclosure,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The reveal every collapsible agent surface shares: content wipes down from its top edge on the way in and clips back up on the way out, opening a touch slower than it closes so the arrival reads as content and the dismissal as gone. It animates a clip path and a 4px lift rather than the height itself, which keeps the reveal off the layout thread. The height drops to zero only once the closing wipe has finished, so the content below moves up after the reveal has left. Closed, it is inert and hidden from assistive tech, so a folded trace is not in the tab order. Under `prefers-reduced-motion` the wipe drops and only the opacity remains. It draws nothing: bring your own trigger, spacing and border.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="w-full max-w-md">
				<Story />
			</div>
		),
	],
	args: {
		id: "reveal",
		open: true,
		children: <Trace />,
	},
	argTypes: {
		open: { control: "boolean" },
	},
})

export const Open = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The revealed state. Height resolves to `auto`, so the content sizes itself and a trace that grows while open pushes the surface below it rather than being clipped. Check that nothing inside is hidden from assistive tech and that the top edge is where the wipe originates.",
			},
		},
	},
})

export const Closed = meta.story({
	args: { open: false },
	parameters: {
		docs: {
			description: {
				story:
					"The folded state, and the reason this primitive exists rather than a `hidden` attribute: the content stays mounted — so reopening costs no remount and no refetch — while the element collapses to zero height, drops out of the accessibility tree, turns inert and stops taking pointer events. Check that it leaves no gap behind and that a screen reader never announces a folded trace.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const disclosure = canvasElement.querySelector("#reveal")

		await expect(disclosure).toHaveAttribute("aria-hidden", "true")
		await expect(disclosure).toHaveAttribute("inert")
		await expect(disclosure?.getBoundingClientRect().height).toBe(0)
	},
})

export const Toggle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The primitive in the shape it ships in: a trigger the surface owns, wired to `aria-expanded` and `aria-controls`, and the disclosure underneath. Check the keyboard path — the trigger takes focus, Enter opens it, and the link inside is unreachable by Tab until it does, because `inert` keeps a folded trace out of the tab order.",
			},
		},
	},
	render: () => <Toggled />,
	play: async ({ canvas, canvasElement, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Show the trace" })
		const link = canvas.getByText("Open the full run")

		await userEvent.tab()
		await expect(trigger).toHaveFocus()

		await userEvent.tab()
		await expect(link).not.toHaveFocus()

		await userEvent.click(trigger)
		await expect(canvasElement.querySelector("#reveal")).not.toHaveAttribute(
			"inert",
		)
		await expect(
			canvas.getByRole("button", { name: "Hide the trace" }),
		).toHaveAttribute("aria-expanded", "true")
	},
})
