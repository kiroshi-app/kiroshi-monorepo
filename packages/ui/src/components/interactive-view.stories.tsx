import { type ReactNode, useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	InteractiveView,
	type InteractiveViewMode,
	type InteractiveViewProps,
	type InteractiveViewResult,
	type InteractiveViewSlider,
	type InteractiveViewValues,
} from "@workspace/ui/components/interactive-view"
import type { RosterBot } from "@workspace/ui/components/roster"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"

const AGENT: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const LEAD =
	"I built you a quick view to size the offsite. Move the sliders, the total follows."

const BUDGET = 5000

const MEALS_PER_PERSON_NIGHT = 25

const TRANSPORT_PER_PERSON = 45

const euros = (amount: number) => `€${amount.toLocaleString("en-US")}`

const SLIDERS: InteractiveViewSlider[] = [
	{
		id: "people",
		label: "People",
		min: 2,
		max: 20,
		defaultValue: 8,
		formatValue: (value) => `${value}`,
	},
	{
		id: "nights",
		label: "Nights",
		min: 1,
		max: 7,
		defaultValue: 3,
		formatValue: (value) => `${value}`,
	},
	{
		id: "rate",
		label: "Room per night",
		min: 60,
		max: 300,
		step: 10,
		defaultValue: 120,
		formatValue: euros,
	},
]

const offsiteBudget = (
	values: InteractiveViewValues,
): InteractiveViewResult => {
	const { people, nights, rate } = values
	const lodging = Math.ceil(people / 2) * nights * rate
	const meals = people * nights * MEALS_PER_PERSON_NIGHT
	const transport = people * TRANSPORT_PER_PERSON
	const total = lodging + meals + transport

	return {
		caption: "Estimated total",
		total: euros(total),
		totalNote: `${euros(Math.round(total / people))} per person`,
		meter: {
			ratio: total / BUDGET,
			caption: `${Math.round((total / BUDGET) * 100)}% of the ${euros(BUDGET)} budget`,
		},
		breakdown: [
			{ label: "Rooms, two per room", value: euros(lodging) },
			{ label: "Meals", value: euros(meals) },
			{ label: "Transport", value: euros(transport) },
		],
	}
}

const DEFAULT_TOTAL = "€2,400"

type InAnswerProps = {
	children: ReactNode
}

const InAnswer = ({ children }: InAnswerProps) => (
	<div className="mx-auto flex w-full max-w-2xl flex-col px-6">
		<TurnGroup>
			<AssistantTurn copyText={LEAD} identity={AGENT}>
				{LEAD}
			</AssistantTurn>
			<AssistantTurn framed fills copyText="" identity={AGENT}>
				{children}
			</AssistantTurn>
		</TurnGroup>
	</div>
)

const ControlledView = ({
	mode: initialMode,
	onModeChange,
	...props
}: InteractiveViewProps) => {
	const [mode, setMode] = useState<InteractiveViewMode>(initialMode)

	return (
		<InteractiveView
			{...props}
			mode={mode}
			onModeChange={(next) => {
				setMode(next)
				onModeChange(next)
			}}
		/>
	)
}

const sliderValueOf = (canvasElement: HTMLElement, index: number) =>
	canvasElement.querySelectorAll('[data-slot="interactive-view-slider-value"]')[
		index
	]

const totalOf = (canvasElement: HTMLElement) =>
	canvasElement.querySelector('[data-slot="interactive-view-total"]')

const meta = preview.meta({
	title: "Conversation/Markdown/InteractiveView",
	component: InteractiveView,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A small view an agent builds into its answer: sliders on one side, a result panel on the other, a footer that sends the values back. The panel is drawn from `result`, a pure function of the slider values the caller passes, so the block holds no arithmetic of its own. The mode control only reports `inline`, `pinned` or `fullscreen`.",
			},
		},
	},
	args: {
		title: "Offsite budget",
		agentName: "Atlas",
		sliders: SLIDERS,
		result: offsiteBudget,
		mode: "inline" as InteractiveViewMode,
		sendLabel: "Use these numbers",
		source: "Room rates from the three guesthouses Atlas found.",
		onModeChange: fn(),
		onSend: fn(),
		onValuesChange: fn(),
	},
	render: (args) => (
		<InAnswer>
			<ControlledView {...args} />
		</InAnswer>
	),
})

export const DefaultValues = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The artboard at its default values: eight people, three nights, a room at €120. Check that the value of each slider sits on the baseline of its label and that the total reads in tabular figures.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(sliderValueOf(canvasElement, 0)).toHaveTextContent("8")
		await expect(sliderValueOf(canvasElement, 2)).toHaveTextContent("€120")
		await expect(totalOf(canvasElement)).toHaveTextContent(DEFAULT_TOTAL)
		await expect(canvas.getByText("View made by Atlas")).toBeVisible()
		await expect(
			canvas.getByRole("button", { name: "Inline" }),
		).toHaveAttribute("aria-pressed", "true")
	},
})

export const ArrowKeyAdjust = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"ArrowRight on the People slider: its value label and the total change in the same render, and `onValuesChange` receives every slider value.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		canvas.getByRole("slider", { name: "People" }).focus()
		await userEvent.keyboard("{ArrowRight}")

		await expect(sliderValueOf(canvasElement, 0)).toHaveTextContent("9")
		await expect(totalOf(canvasElement)).toHaveTextContent("€2,880")
		await expect(args.onValuesChange).toHaveBeenLastCalledWith({
			people: 9,
			nights: 3,
			rate: 120,
		})
	},
})

export const SendValues = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The footer button sends the current values back through `onSend`, its label coming from the caller.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		canvas.getByRole("slider", { name: "Nights" }).focus()
		await userEvent.keyboard("{ArrowLeft}")
		await userEvent.click(
			canvas.getByRole("button", { name: "Use these numbers" }),
		)

		await expect(args.onSend).toHaveBeenCalledWith({
			people: 8,
			nights: 2,
			rate: 120,
		})
	},
})

export const ModePick = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The mode control reports the mode picked, and the mode handed back renders pressed. What the pinned and full screen modes display belongs to the caller.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const pin = canvas.getByRole("button", { name: "Pin" })

		await userEvent.click(pin)
		await expect(args.onModeChange).toHaveBeenLastCalledWith("pinned")
		await expect(pin).toHaveAttribute("aria-pressed", "true")
		await expect(
			canvas.getByRole("button", { name: "Inline" }),
		).toHaveAttribute("aria-pressed", "false")

		await userEvent.click(canvas.getByRole("button", { name: "Full screen" }))
		await expect(args.onModeChange).toHaveBeenLastCalledWith("fullscreen")

		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await expect(getComputedStyle(pin).transitionDuration).toBe("0s")
		})
	},
})

export const DefaultValuesDark = DefaultValues.extend({
	globals: { theme: "dark" },
})
