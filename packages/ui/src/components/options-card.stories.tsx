import type { ReactNode } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	OptionsCard,
	type OptionsCardOption,
} from "@workspace/ui/components/options-card"
import type { RosterBot } from "@workspace/ui/components/roster"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"

const AGENT: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const LEAD =
	"Here are three ways to run the team offsite. Open the one you want to explore and tell me what to change."

const OPTIONS: OptionsCardOption[] = [
	{
		id: "da-lat",
		label: "Da Lat, in the hills",
		description:
			"Three nights in a guesthouse above the lake, one long workshop day, the rest free. Cool weather, a five hour bus ride from the city.",
	},
	{
		id: "hoi-an",
		label: "Hoi An, by the river",
		description:
			"Two nights in the old town with a meeting room booked for the mornings. A short flight, and evenings on the riverside.",
	},
	{
		id: "in-town",
		label: "Stay in town",
		description:
			"Two days in a rented studio near the office, everyone home at night. The cheapest option, and the easiest to move if plans change.",
	},
]

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

const headerOf = (canvasElement: HTMLElement, label: string) => {
	const header = Array.from(
		canvasElement.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
	).find((button) => button.textContent === label)
	if (!header) throw new Error(`No option header reads ${label}`)
	return header
}

const meta = preview.meta({
	title: "Conversation/Markdown/OptionsCard",
	component: OptionsCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A set of options an agent lays out in its answer for the reader to explore. Opening an option is the pick: the card reports it through `onPick` and the answer leaves through the input, so the card carries no send button. One option is open at a time.",
			},
		},
	},
	args: {
		title: "Three ways to run the offsite",
		subtitle: "Open one to see what it involves.",
		options: OPTIONS,
		onPick: fn(),
	},
	render: (args) => (
		<InAnswer>
			<OptionsCard {...args} />
		</InAnswer>
	),
})

export const OneOpen = meta.story({
	args: { defaultOpenId: "da-lat" },
	parameters: {
		docs: {
			description: {
				story:
					"The artboard: the first option open, tinted in the Space colour, its title in semibold over the body copy, the two others folded. Check that the open option keeps the same 12px inset on every side.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const open = headerOf(canvasElement, "Da Lat, in the hills")
		const body = canvasElement.querySelector(
			`#${CSS.escape(open.getAttribute("aria-controls") ?? "")}`,
		)

		await expect(open).toHaveAttribute("aria-expanded", "true")
		await expect(body).toHaveTextContent(OPTIONS[0].description)
		await expect(headerOf(canvasElement, "Stay in town")).toHaveAttribute(
			"aria-expanded",
			"false",
		)
	},
})

export const AllFolded = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Nothing picked yet: every option folded to a single row. A click unfolds one and reports its id, a second click folds it back and reports `null`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const daLat = headerOf(canvasElement, "Da Lat, in the hills")
		const hoiAn = headerOf(canvasElement, "Hoi An, by the river")

		await userEvent.click(daLat)
		await expect(daLat).toHaveAttribute("aria-expanded", "true")
		await expect(args.onPick).toHaveBeenLastCalledWith("da-lat")

		await userEvent.click(hoiAn)
		await expect(hoiAn).toHaveAttribute("aria-expanded", "true")
		await expect(daLat).toHaveAttribute("aria-expanded", "false")
		await expect(args.onPick).toHaveBeenLastCalledWith("hoi-an")

		await userEvent.click(hoiAn)
		await expect(hoiAn).toHaveAttribute("aria-expanded", "false")
		await expect(args.onPick).toHaveBeenLastCalledWith(null)

		if (!isInBrowserRunner()) return
		await withMotionAllowed(async () => {
			await expect(getComputedStyle(daLat).transitionDuration).toBe("0s")
		})
	},
})

export const KeyboardPick = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same pick from the keyboard: Enter on one header, then Space on the next, which folds the first.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const daLat = headerOf(canvasElement, "Da Lat, in the hills")
		const inTown = headerOf(canvasElement, "Stay in town")

		daLat.focus()
		await userEvent.keyboard("{Enter}")
		await expect(daLat).toHaveAttribute("aria-expanded", "true")
		await expect(args.onPick).toHaveBeenLastCalledWith("da-lat")

		inTown.focus()
		await userEvent.keyboard(" ")
		await expect(inTown).toHaveAttribute("aria-expanded", "true")
		await expect(daLat).toHaveAttribute("aria-expanded", "false")
		await expect(args.onPick).toHaveBeenLastCalledWith("in-town")
	},
})

export const OneOpenDark = OneOpen.extend({
	globals: { theme: "dark" },
})

const UNBREAKABLE =
	"https://example.com/offsites/da-lat/guesthouse-above-the-lake/booking-terms"

export const NarrowLongContent = meta.story({
	tags: ["test-only"],
	args: {
		title:
			"Three ways to run the offsite for the design and platform teams this June",
		subtitle: `Open one to see what it involves. Terms live at ${UNBREAKABLE}.`,
		defaultOpenId: "da-lat",
		options: [
			{
				...OPTIONS[0],
				label:
					"Da Lat, in the hills above the lake, with the long workshop day",
				description: `${OPTIONS[0].description} Booking terms: ${UNBREAKABLE}`,
			},
			...OPTIONS.slice(1),
		],
	},
	render: (args) => (
		<div style={{ width: 320 }}>
			<OptionsCard {...args} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const card = canvasElement.querySelector<HTMLElement>(
			'[data-slot="options-card"]',
		)
		if (!card) throw new Error("No options card drawn")

		await expect(card.scrollWidth).toBe(card.clientWidth)
	},
})
