import { expect, screen, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	isInBrowserRunner,
	Row,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"

const COPY_BUTTON = (
	<Button aria-label="Copy" size="icon-sm" variant="ghost">
		<Icons.Copy />
	</Button>
)

const LONG_HINT =
	"Reads every file the run touched, then writes the summary back to the conversation"

const withMotion = (run: () => Promise<void>) =>
	isInBrowserRunner() ? withMotionAllowed(run) : run()

const meta = preview.meta({
	title: "Overlays/TooltipHint",
	component: TooltipHint,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					'The registry tooltip closed down to what a call site needs: a piece of content, one element to hang it on, a side. It renders no wrapper of its own — the child stays the element the layout around it sees — and the bubble carries `role="tooltip"`. A `content` of nothing draws no bubble while keeping the child mounted, so a caller that only sometimes has a name to give never swaps the control it wraps. Under `TooltipHintProvider`, which the app mounts at its root, every hint feeds one shared bubble, and that is what lets the bubble travel from a control to its neighbour. Nothing links the bubble to its child: the registry writes no `aria-describedby` on the trigger, so a screen reader never reads the bubble and its text has to live in the child\'s accessible name as well.',
			},
		},
	},
})

export const Default = meta.story({
	args: { content: "Copy", children: COPY_BUTTON },
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: an icon-only control whose meaning lives in the hint. Check that the child is rendered as-is, with no span around it, so a row of hinted controls keeps the rhythm of a row of plain ones. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Copy" })

		await expect(trigger.parentElement?.tagName).not.toBe("SPAN")

		await userEvent.hover(trigger)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy")
	},
})

export const WithoutContent = meta.story({
	args: { content: null, children: COPY_BUTTON },
	parameters: {
		docs: {
			description: {
				story:
					"A hint with nothing to say, which is how a caller that only sometimes has a name to give keeps one element rather than swapping it. Check that hovering opens no bubble at all instead of an empty one, and that the child is still the element the layout sees — a caller switching `content` on and off never remounts the control it wraps, so focus and a drag under way both survive the switch. Pick `Default` for the hint with content. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Copy" })

		await userEvent.hover(trigger)
		await expect(screen.queryByRole("tooltip")).toBeNull()
	},
})

export const OnFocus = meta.story({
	args: { content: "Copy", children: COPY_BUTTON },
	parameters: {
		docs: {
			description: {
				story:
					"The keyboard path: no pointer, one Tab. Check that the hint opens on focus as it does on hover — a name that only a pointer can read is a name half the readers never get. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()

		await expect(canvas.getByRole("button", { name: "Copy" })).toHaveFocus()
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy")
	},
})

export const WithSide = meta.story({
	args: {
		content: "New bot",
		side: "bottom",
		children: (
			<Button aria-label="New bot" size="icon-sm" variant="ghost">
				<Icons.Add />
			</Button>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"`side` for a control pinned against the top of the window, where a bubble above it would be drawn off the screen. Check that the hint sits under the control and stays inside the window on every edge. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "New bot" })

		await userEvent.hover(trigger)
		const hint = await screen.findByRole("tooltip")

		await waitFor(async () => {
			await expect(hint.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				trigger.getBoundingClientRect().bottom,
			)
		}, FRAME_POLL)
	},
})

export const LongContent = meta.story({
	args: {
		content: LONG_HINT,
		children: <Button variant="outline">Summarise</Button>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A sentence rather than a word, the shape a tool title or a translated string takes. Check that it wraps over several lines inside the window rather than running off its edge, and that the trigger keeps its own width. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Summarise" }))
		const hint = await screen.findByRole("tooltip")

		await expect(hint).toHaveTextContent(LONG_HINT)
		await waitFor(async () => {
			const box = hint.getBoundingClientRect()

			await expect(box.left).toBeGreaterThanOrEqual(0)
			await expect(box.right).toBeLessThanOrEqual(window.innerWidth)
			await expect(box.height).toBeGreaterThan(
				2 * Number.parseFloat(getComputedStyle(hint).lineHeight),
			)
		}, FRAME_POLL)
	},
})

export const InRow = meta.story({
	tags: ["test-only"],
	args: {
		content: "Delete",
		children: (
			<Button aria-label="Delete" disabled size="icon-sm" variant="destructive">
				<Icons.Delete />
			</Button>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A disabled control beside a live one. Check that the disabled button takes no focus and opens no hint — a label on an unreachable control is a label nobody can read — while the one beside it still names itself.",
			},
		},
	},
	render: (args) => (
		<Row>
			<TooltipHint content="Copy">{COPY_BUTTON}</TooltipHint>
			<TooltipHint {...args} />
		</Row>
	),
	play: async ({ canvas, userEvent }) => {
		const remove = canvas.getByRole("button", { name: "Delete" })

		await expect(remove).toBeDisabled()

		await userEvent.tab()
		await expect(canvas.getByRole("button", { name: "Copy" })).toHaveFocus()
		await expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy")
	},
})

export const AdjacentHints = meta.story({
	name: "Adjacent hints",
	args: {
		content: "Delete",
		children: (
			<Button aria-label="Delete" size="icon-sm" variant="ghost">
				<Icons.Delete />
			</Button>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Two hinted controls side by side under the one `TooltipHintProvider` the app mounts at its root, which this Storybook mounts around every story too. Check that the pointer leaving the first control for its neighbour keeps the one bubble on screen: a short grace holds it open across the gap, it glides over to the second control with the second label in it, and it neither closes nor fades in again on the way. Pick `InRow` for a disabled neighbour, this one for a toolbar the pointer travels across.",
			},
		},
	},
	render: (args) => (
		<Row>
			<TooltipHint content="Copy">{COPY_BUTTON}</TooltipHint>
			<TooltipHint {...args} />
		</Row>
	),
	play: ({ canvas, userEvent }) =>
		withMotion(async () => {
			await userEvent.hover(canvas.getByRole("button", { name: "Copy" }))
			const bubble = await screen.findByRole("tooltip")
			const positioner = bubble.parentElement as HTMLElement

			await waitFor(async () => {
				await expect(getComputedStyle(bubble).opacity).toBe("1")
			}, FRAME_POLL)
			const travel = getComputedStyle(positioner)
			await expect(travel.transitionProperty).toBe("transform")
			await expect(travel.transitionDuration).toBe("0.16s")
			await expect(travel.transitionTimingFunction).toBe(
				"cubic-bezier(0.22, 1, 0.36, 1)",
			)

			let hasTravelled = false
			positioner.addEventListener("transitionrun", (event) => {
				hasTravelled ||=
					event.target === positioner && event.propertyName === "transform"
			})
			const flipped: string[] = []
			const watch = new MutationObserver((records) => {
				for (const { attributeName } of records) {
					if (attributeName) flipped.push(attributeName)
				}
			})
			watch.observe(bubble, {
				attributeFilter: [
					"data-open",
					"data-closed",
					"data-starting-style",
					"data-ending-style",
				],
			})

			const remove = canvas.getByRole("button", { name: "Delete" })
			await userEvent.hover(remove)

			await waitFor(async () => {
				await expect(bubble).toHaveTextContent("Delete")
				await expect(hasTravelled).toBe(true)
			}, FRAME_POLL)
			watch.disconnect()
			await expect(screen.getByRole("tooltip")).toBe(bubble)
			await expect(flipped).toEqual([])
			await expect(bubble).toHaveAttribute("data-open")
			await expect(bubble).not.toHaveAttribute("data-starting-style")
			await expect(getComputedStyle(bubble).opacity).toBe("1")

			await waitFor(async () => {
				const over = bubble.getBoundingClientRect()
				const under = remove.getBoundingClientRect()

				await expect(over.left + over.width / 2).toBeCloseTo(
					under.left + under.width / 2,
					0,
				)
			}, FRAME_POLL)
		}),
})

export const ReducedMotion = meta.story({
	args: { content: "Copy", children: COPY_BUTTON },
	parameters: {
		docs: {
			description: {
				story:
					"The same hint for a reader who asked the system to stop moving things. The bubble keeps its fade and drops everything that moves: it does not grow in and it does not glide to a neighbour. Check that the open bubble transitions its opacity alone, sits at full size from its first frame, and that the layer placing it carries no transition; then that it still leaves the document when the pointer does. The app assembles it at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const trigger = canvas.getByRole("button", { name: "Copy" })

		await userEvent.hover(trigger)
		const hint = await screen.findByRole("tooltip")
		const positioner = hint.parentElement as HTMLElement

		await expect(getComputedStyle(hint).animationName).toBe("none")
		await expect(getComputedStyle(hint).scale).toBe("none")
		await waitFor(async () => {
			await expect(getComputedStyle(hint).transitionProperty).toBe("opacity")
		}, FRAME_POLL)
		await expect(getComputedStyle(positioner).transitionDuration).toBe("0s")

		await userEvent.unhover(trigger)
		await waitFor(async () => {
			await expect(screen.queryByRole("tooltip")).toBeNull()
		}, FRAME_POLL)
	},
})
