import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { tokenStyleIn } from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import {
	QuotableAnswer,
	type QuotableAnswerProps,
} from "@workspace/ui/components/quotable-answer"
import type { RosterBot } from "@workspace/ui/components/roster"
import { SelectionQuote } from "@workspace/ui/components/selection-quote"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"

const AGENT: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const QUESTION = "Why did the sync take so long this morning?"

const ANSWER =
	"The sync finished, but two devices needed a full pass instead of the usual delta. The Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself. Nothing was lost."

const QUOTED =
	"the studio tablet came back with a clock drift of about four minutes"

const QuotingConversation = ({ children, onQuote }: QuotableAnswerProps) => {
	const [quote, setQuote] = useState<string | null>(QUOTED)

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6">
			<TurnGroup>
				<AssistantTurn copyText={QUESTION} identity={AGENT}>
					{QUESTION}
				</AssistantTurn>
				<AssistantTurn copyText={ANSWER} identity={AGENT}>
					<QuotableAnswer
						onQuote={(text) => {
							setQuote(text)
							onQuote(text)
						}}
					>
						{children}
					</QuotableAnswer>
				</AssistantTurn>
			</TurnGroup>
			<PromptInput
				aria-label="Message"
				attachments={
					quote ? (
						<SelectionQuote
							agentName={AGENT.name}
							text={quote}
							onRemove={() => setQuote(null)}
						/>
					) : undefined
				}
			/>
		</div>
	)
}

const answerOf = (canvasElement: HTMLElement) => {
	const answer = canvasElement.querySelector<HTMLElement>(
		'[data-slot="quotable-answer"]',
	)
	if (!answer) throw new Error("No quotable answer drawn")
	return answer
}

const answerTextOf = (canvasElement: HTMLElement) => {
	const text = answerOf(canvasElement).querySelector("p")?.firstChild
	if (!text) throw new Error("The answer drew no text")
	return text
}

const select = (start: [Node, number], end: [Node, number]) => {
	const range = document.createRange()
	range.setStart(...start)
	range.setEnd(...end)
	const selection = document.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}

const selectInAnswer = (canvasElement: HTMLElement, phrase: string) => {
	const text = answerTextOf(canvasElement)
	const start = ANSWER.indexOf(phrase)
	select([text, start], [text, start + phrase.length])
}

const releasePointer = (target: HTMLElement) =>
	target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))

const releaseShift = (target: HTMLElement) =>
	target.dispatchEvent(
		new KeyboardEvent("keyup", { key: "Shift", bubbles: true }),
	)

const meta = preview.meta({
	title: "Conversation/Markdown/QuotableAnswer",
	component: QuotableAnswer,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"An agent answer the reader can quote from. Selecting text inside it paints the selection in the Space colour, and completing a non-empty selection, by releasing the pointer or the Shift key, reports the trimmed text through `onQuote`. A selection that is only whitespace or reaches outside the answer reports nothing. The caller puts the quote in the input as a `SelectionQuote`.",
			},
		},
	},
	args: { children: <p>{ANSWER}</p>, onQuote: fn() },
	render: (args) => <QuotingConversation {...args} />,
})

export const InAnswer = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The artboard: a phrase selected in the answer, painted in the Space colour at 30%, and the quote waiting in the input. Releasing the pointer on the selection reports its text.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const answer = answerOf(canvasElement)

		selectInAnswer(canvasElement, ` ${QUOTED}`)
		releasePointer(answer)

		await expect(args.onQuote).toHaveBeenCalledOnce()
		await expect(args.onQuote).toHaveBeenCalledWith(QUOTED)
		await expect(
			getComputedStyle(answer.querySelector("p") as Element, "::selection")
				.backgroundColor,
		).toBe(tokenStyleIn(answer, "bg-primary/30", "backgroundColor"))
	},
})

export const KeyboardSelection = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A selection extended from the keyboard completes when Shift is released, and reports the same trimmed text.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		selectInAnswer(canvasElement, "Nothing was lost.")
		releaseShift(answerOf(canvasElement))

		await expect(args.onQuote).toHaveBeenCalledOnce()
		await expect(args.onQuote).toHaveBeenCalledWith("Nothing was lost.")
	},
})

export const WhitespaceSelection = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A selection holding only the space between two words reports nothing.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const answer = answerOf(canvasElement)

		selectInAnswer(canvasElement, " ")
		releasePointer(answer)
		releaseShift(answer)

		await expect(args.onQuote).not.toHaveBeenCalled()
	},
})

export const SelectionReachingOutside = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A selection that starts in the question above and ends inside the answer reports nothing: only text wholly inside the answer is quotable.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const question = canvas.getByText(QUESTION).firstChild
		if (!question) throw new Error("The question drew no text")

		select([question, 0], [answerTextOf(canvasElement), 20])
		releasePointer(answerOf(canvasElement))

		await expect(args.onQuote).not.toHaveBeenCalled()
	},
})

export const InAnswerDark = InAnswer.extend({
	globals: { theme: "dark" },
})
