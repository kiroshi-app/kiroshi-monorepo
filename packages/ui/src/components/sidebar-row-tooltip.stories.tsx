import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectClampedTo,
	expectTooltipCard,
	openTooltipOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { formatSentDate } from "@workspace/ui/components/message"
import { SidebarRowTooltip } from "@workspace/ui/components/sidebar-row-tooltip"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { Button } from "@workspace/ui/components/ui/button"

const SPOKEN_AT = new Date(2026, 10, 12, 9, 24).getTime()

const UNBREAKABLE_TITLE =
	"release-notes-2026-11-12-platform-design-support-final-final-reviewed"

const TEN_AGENTS =
	"Agents: Atlas, Beacon, Cinder, Dune, Ember, Flint, Garnet, Harbour, Indigo, Juniper"

const SEVERAL_SENTENCES =
	"The changelog is ready for a read. I grouped the fixes by surface, moved the two breaking changes to the top and linked every entry to its pull request. The migration note still needs a second pair of eyes before it ships, and the screenshots for the settings page are a release behind. Tell me which of the three open questions you want answered first and I will draft the rest around it."

const meta = preview.meta({
	title: "Navigation/SidebarRowTooltip",
	component: SidebarRowTooltip,
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				component:
					"What a conversation row or an agent row of the left sidebar says when the pointer rests on it: a heading, the agents seated, the last message capped at four lines and the full date of that message. It only draws the fields it is given and it inherits its ink from the tooltip surface, so it lives inside a `TooltipHint` with the `card` variant. The app never hangs it on a button: `AppSidebarConversationRow` and `AppSidebarBotRow` carry the stories of the rows that do.",
			},
		},
	},
	args: {
		heading: "Launch room",
		agents: "Agents: Atlas, Beacon",
		message: "The changelog is ready for a read.",
		spokenAt: SPOKEN_AT,
	},
	render: (fields) => (
		<TooltipHint
			content={<SidebarRowTooltip {...fields} />}
			side="right"
			variant="card"
		>
			<Button variant="outline">Launch room</Button>
		</TooltipHint>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every field given. Check the heading is the one emphasised line, the agents sit right under it, the message and its date form a second group further apart, and the surface wears the same padding on its four sides.",
			},
		},
	},
	play: async ({ canvas }) => {
		const tooltip = await openTooltipOf(canvas.getByRole("button"))

		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-heading"),
		).toHaveTextContent("Launch room")
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-agents"),
		).toHaveTextContent("Agents: Atlas, Beacon")
		await expect(
			slotIn(tooltip, "sidebar-row-tooltip-message"),
		).toHaveTextContent("The changelog is ready for a read.")
		await expect(slotIn(tooltip, "sidebar-row-tooltip-time")).toHaveTextContent(
			formatSentDate(SPOKEN_AT),
		)
		await expectTooltipCard(tooltip)
	},
})

export const LongContent = meta.story({
	args: {
		heading: UNBREAKABLE_TITLE,
		agents: TEN_AGENTS,
		message: SEVERAL_SENTENCES,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A title in one unbreakable string, ten agents and a message of several sentences. Check the title breaks inside the bounded width rather than widening the surface, the agents wrap, and the message stops at four lines while keeping its whole text for a reader. `Default` covers the nominal lengths.",
			},
		},
	},
	play: async ({ canvas }) => {
		const tooltip = await openTooltipOf(canvas.getByRole("button"))
		const message = slotIn(tooltip, "sidebar-row-tooltip-message")

		await expect(message).toHaveTextContent(SEVERAL_SENTENCES)
		await expectClampedTo(message, 4)
		await expectTooltipCard(tooltip)
		for (const part of slotsIn(tooltip, "sidebar-row-tooltip-heading"))
			await expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(
				tooltip.getBoundingClientRect().right,
			)
	},
})

export const SparseData = meta.story({
	args: { agents: undefined, message: undefined, spokenAt: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Only a heading, the tooltip of a row nobody has written in yet. Check nothing but that line is drawn: no empty group, no placeholder and no gap left where the message would be.",
			},
		},
	},
	play: async ({ canvas }) => {
		const tooltip = await openTooltipOf(canvas.getByRole("button"))
		const card = slotIn(tooltip, "sidebar-row-tooltip")

		await expect(card).toHaveTextContent(/^Launch room$/)
		await expect(card.children).toHaveLength(1)
		await expect(card.querySelector(":empty")).toBeNull()
	},
})
