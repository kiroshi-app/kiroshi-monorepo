import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_PAGE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { WebPageCard } from "@workspace/ui/components/answer-blocks/web-page-card"

const meta = preview.meta({
	title: "Conversation/Markdown/WebPageCard",
	component: WebPageCard,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A preview of a web page the agent read, with its domain, title and an Open as page button. Reach for it when the answer points at one page the reader will want to open whole; an inline link covers a passing reference. The button shows only when `onOpen` is passed.",
			},
		},
	},
	args: {
		domain: "casadorio.pt",
		title: "Casa do Rio · Rooms and rates",
		preview: { src: CASA_DO_RIO_PAGE },
		onOpen: fn(),
	},
	render: (args) => (
		<AgentAnswerFrame intro="The rates for your dates are on their rooms page.">
			<WebPageCard {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 12. A 460 wide card. The preview carries no alt text, so it takes the page title as its name. Check the button reaches `onOpen`.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.getByRole("img", { name: "Casa do Rio · Rooms and rates" }),
		).toBeVisible()
		await userEvent.click(canvas.getByRole("button", { name: "Open as page" }))
		await expect(args.onOpen).toHaveBeenCalledOnce()
	},
})

export const InNarrowColumn = meta.story({
	args: {
		domain: "reservations.casadorio-lisboa-alfama-riverside.pt",
		title: "CasadoRioRoomsandratesforthefirstweekofMarch",
	},
	render: (args) => (
		<AgentAnswerFrame intro="The rates are on their rooms page." width={320}>
			<WebPageCard {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column, narrower than the 460 card. Check the card shrinks to the column, the domain truncates, the title wraps beside the button, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
