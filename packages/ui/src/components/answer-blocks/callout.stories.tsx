import type { ReactNode } from "react"
import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
	resolvedRootColor,
} from "@workspace/storybook/story-utils"
import { Callout } from "@workspace/ui/components/answer-blocks/callout"

type StackProps = { children: ReactNode }

const Stack = ({ children }: StackProps) => (
	<div className="flex w-full flex-col gap-2.5">{children}</div>
)

const iconColourOf = (callout: Element) =>
	getComputedStyle(callout.querySelector("svg") as SVGElement).color

const meta = preview.meta({
	title: "Conversation/Markdown/Callout",
	component: Callout,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A boxed aside with a title and a body: tone `note` in the Space colour with the info icon, tone `warning` in the warning token with the triangle. Reach for it when one piece of the answer must not be skimmed past; a blockquote covers a plain quotation.",
			},
		},
	},
	args: {
		tone: "note" as const,
		title: "Trams fill up after ten",
		children: "Take line 28 from Martim Moniz before ten to get a seat.",
	},
	render: (args) => (
		<AgentAnswerFrame intro="Two things to know before you ride the 28.">
			<Stack>
				<Callout {...args} />
				<Callout tone="warning" title="Watch your bag on line 28">
					Keep it zipped and in front of you on the busy stretch through Alfama.
				</Callout>
			</Stack>
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 10. A note stacked over a warning, 10 apart. Check the note tints and strokes in the Space colour with the info icon, the warning in the warning token with the triangle.",
			},
		},
	},
	play: async ({ canvas }) => {
		const [note, warning] = canvas.getAllByRole("note")
		await expect(note).toHaveAttribute("data-tone", "note")
		await expect(iconColourOf(note)).toBe(resolvedRootColor("--primary-strong"))
		await expect(warning).toHaveAttribute("data-tone", "warning")
		await expect(iconColourOf(warning)).toBe(resolvedRootColor("--warning"))
	},
})

export const InNarrowColumn = meta.story({
	args: {
		tone: "warning",
		title: "Watchyourbagonline28throughAlfamaandGraça",
		children: "Keep it zipped and in front of you on the busy stretch.",
	},
	render: (args) => (
		<AgentAnswerFrame intro="Two things to know." width={320}>
			<Callout {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with an unbroken title. Check it wraps beside the icon column and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
