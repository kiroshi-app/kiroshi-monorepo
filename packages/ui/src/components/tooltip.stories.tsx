import type { ComponentType, ReactNode } from "react"
import { expect, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	FRAME_POLL,
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip"

type TooltipArgs = {
	children?: ReactNode
	defaultOpen?: boolean
	open?: boolean
}

const TypedTooltip = Tooltip as ComponentType<TooltipArgs>

const LONG_LABEL =
	"Sends the prompt to the bot holding the conversation, then waits for its first token"

type Side = "top" | "right" | "bottom" | "left"

const SITS_ON: Record<Side, (bubble: DOMRect, trigger: DOMRect) => boolean> = {
	top: (bubble, trigger) => bubble.bottom <= trigger.top,
	right: (bubble, trigger) => bubble.left >= trigger.right,
	bottom: (bubble, trigger) => bubble.top >= trigger.bottom,
	left: (bubble, trigger) => bubble.right <= trigger.left,
}

const withMotion = (run: () => Promise<void>) =>
	isInBrowserRunner() ? withMotionAllowed(run) : run()

type HoverPlayContext = {
	canvasElement: HTMLElement
	userEvent: {
		hover: (element: Element) => Promise<void>
		unhover: (element: Element) => Promise<void>
	}
}

type Pace = {
	transitionDuration: string
	transitionDelay: string
}

const paceOfLeaving = (bubble: HTMLElement) =>
	new Promise<Pace>((resolve) => {
		const observer = new MutationObserver(() => {
			if (!bubble.hasAttribute("data-ending-style")) return
			const { transitionDuration, transitionDelay } = getComputedStyle(bubble)
			observer.disconnect()
			resolve({ transitionDuration, transitionDelay })
		})
		observer.observe(bubble, { attributes: true })
	})

const sideStory = (side: Side) => ({
	parameters: {
		docs: {
			description: {
				story: `The bubble opening on the ${side} of its trigger, then closing. Check that it waits a beat, fades in while growing from 98% towards the trigger without sliding, and that it is gone at once when the pointer leaves.`,
			},
		},
	},
	render: () => (
		<div className="p-24">
			<Tooltip>
				<TooltipTrigger
					render={
						<Button aria-label="New bot" size="icon-sm" variant="ghost">
							<Icons.Add />
						</Button>
					}
				/>
				<TooltipContent side={side}>New bot</TooltipContent>
			</Tooltip>
		</div>
	),
	play: ({ canvasElement, userEvent }: HoverPlayContext) =>
		withMotion(async () => {
			const trigger = within(canvasElement).getByRole("button", {
				name: "New bot",
			})

			await userEvent.hover(trigger)
			const bubble = await screen.findByText("New bot")

			await waitFor(async () => {
				await expect(bubble).not.toHaveAttribute("data-starting-style")
			}, FRAME_POLL)
			const entering = getComputedStyle(bubble)
			await expect(entering.animationName).toBe("none")
			await expect(entering.transitionProperty).toBe("opacity, scale")
			await expect(entering.transitionDuration).toBe("0.15s")
			await expect(entering.transitionDelay).toBe("0.08s")
			await expect(entering.transitionTimingFunction).toBe("ease-out")

			await waitFor(async () => {
				const resting = getComputedStyle(bubble)

				await expect(resting.opacity).toBe("1")
				await expect(resting.scale).toBe("none")
				await expect(resting.translate).toBe("none")
				await expect(
					SITS_ON[side](
						bubble.getBoundingClientRect(),
						trigger.getBoundingClientRect(),
					),
				).toBe(true)
			}, FRAME_POLL)

			const leaving = paceOfLeaving(bubble)
			await userEvent.unhover(trigger)

			await expect(await leaving).toEqual({
				transitionDuration: "0.05s",
				transitionDelay: "0s",
			})
			await waitFor(async () => {
				await expect(bubble).not.toBeInTheDocument()
			}, FRAME_POLL)
		}),
})

const meta = preview.meta({
	title: "Overlays/Tooltip",
	component: TypedTooltip,
	decorators: [
		(Story) => (
			<TooltipProvider>
				<Story />
			</TooltipProvider>
		),
	],
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The tooltip as the shadcn registry ships it: a root, a trigger and a portalled popup, opening on hover and on focus alike. It is the assembly, not the label — reach for `TooltipHint` to hand one element a piece of text, and for `TooltipButton` to name an icon-only control.",
			},
		},
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three parts wired by hand, under the provider that sets the open delay for a whole region. Check that the bubble opens under the pointer after the provider's delay and closes when the pointer leaves. The app reaches the registry tooltip through `TooltipHint` at `apps/app/src/App.tsx:935`.",
			},
		},
	},
	render: () => (
		<Tooltip>
			<TooltipTrigger render={<Button variant="outline">Send</Button>} />
			<TooltipContent>Send this prompt</TooltipContent>
		</Tooltip>
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Send" }))

		const bubble = await screen.findByText("Send this prompt")

		await waitFor(async () => {
			await expect(bubble).toBeVisible()
		}, FRAME_POLL)
	},
})

export const SideTop = meta.story(sideStory("top"))

export const SideRight = meta.story(sideStory("right"))

export const SideBottom = meta.story(sideStory("bottom"))

export const SideLeft = meta.story({
	...sideStory("left"),
	tags: ["test-only"],
})

export const LongContent = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A sentence rather than a word, which is what a translated label turns into. Check that it wraps at the registry's own `max-w-xs` instead of running off the window edge, and that the trigger keeps its own width.",
			},
		},
	},
	render: () => (
		<Tooltip>
			<TooltipTrigger render={<Button variant="outline">Send</Button>} />
			<TooltipContent>{LONG_LABEL}</TooltipContent>
		</Tooltip>
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Send" }))
		const bubble = await screen.findByText(LONG_LABEL)

		await waitFor(async () => {
			await expect(bubble.getBoundingClientRect().right).toBeLessThanOrEqual(
				window.innerWidth,
			)
		}, FRAME_POLL)
	},
})

export const OnDarkSurface = meta.story({
	tags: ["test-only"],
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The bubble open on the dark surface, where it inverts with its tokens rather than keeping the light fill. Check that the label reads against the bubble and that the bubble reads against the page behind it.",
			},
		},
	},
	render: () => (
		<Tooltip>
			<TooltipTrigger render={<Button variant="outline">Send</Button>} />
			<TooltipContent>Send this prompt</TooltipContent>
		</Tooltip>
	),
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: "Send" }))

		const bubble = await screen.findByText("Send this prompt")

		await waitFor(async () => {
			await expect(bubble).toBeVisible()
		}, FRAME_POLL)
	},
})
