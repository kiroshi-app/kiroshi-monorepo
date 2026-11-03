import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	isInBrowserRunner,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { MessageSelection } from "@workspace/ui/components/message-selection"
import type { RosterBot } from "@workspace/ui/components/roster"
import { AssistantTurn, TurnGroup } from "@workspace/ui/components/turn"

const AGENT: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
}

const QUESTION = "Why did the sync take so long this morning?"

const ANSWER =
	"The sync finished, but two devices needed a full pass instead of the usual delta. The Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself. Nothing was lost."

const SELECTED =
	"the studio tablet came back with a clock drift of about four minutes"

const NO_RING = "none"

const SELECTION_GAP = 8

const answerTextOf = (canvasElement: HTMLElement) => {
	const text = canvasElement.querySelector(
		'[data-slot="message-selection"] p',
	)?.firstChild
	if (!text) throw new Error("The answer drew no text")
	return text
}

const messageOf = (canvasElement: HTMLElement) => {
	const message = canvasElement.querySelector<HTMLElement>(
		'[data-slot="message-selection"]',
	)
	if (!message) throw new Error("No message selection drawn")
	return message
}

const select = (start: [Node, number], end: [Node, number]) => {
	const range = document.createRange()
	range.setStart(...start)
	range.setEnd(...end)
	const selection = document.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
	return range
}

const selectInAnswer = (canvasElement: HTMLElement, phrase: string) => {
	const text = answerTextOf(canvasElement)
	const start = ANSWER.indexOf(phrase)
	return select([text, start], [text, start + phrase.length])
}

const releasePointer = (target: HTMLElement) =>
	target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))

const releaseShift = (target: HTMLElement) =>
	target.dispatchEvent(
		new KeyboardEvent("keyup", { key: "Shift", bubbles: true }),
	)

const selectAndRelease = (canvasElement: HTMLElement, phrase = SELECTED) => {
	const range = selectInAnswer(canvasElement, phrase)
	releasePointer(messageOf(canvasElement))
	return range
}

const toolbarIn = (canvasElement: HTMLElement) =>
	within(canvasElement).findByRole("toolbar", { name: "Selected text" })

const expectToolbarGone = (canvasElement: HTMLElement) =>
	waitFor(() =>
		expect(
			within(canvasElement).queryByRole("toolbar", { name: "Selected text" }),
		).not.toBeInTheDocument(),
	)

const meta = preview.meta({
	title: "Conversation/Message/MessageSelection",
	component: MessageSelection,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A message whose text the reader can act on. Finishing a selection inside it, by releasing the pointer or the Shift key, raises the selection toolbar centred above the selection with Reply then Copy, and quotes nothing on its own. Each button reports the trimmed selected text through `onReply` or `onCopy`, then the toolbar hides. The toolbar also hides when the selection collapses, reaches outside the message, or Escape is pressed.",
			},
		},
	},
	args: { children: <p>{ANSWER}</p>, onReply: fn(), onCopy: fn() },
	render: (args) => (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-24">
			<TurnGroup>
				<AssistantTurn copyText={QUESTION} identity={AGENT}>
					{QUESTION}
				</AssistantTurn>
				<AssistantTurn copyText={ANSWER} identity={AGENT}>
					<MessageSelection {...args} />
				</AssistantTurn>
			</TurnGroup>
		</div>
	),
})

export const ReplyHovered = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 1 of Selection and Reply: a phrase selected in an answer, the toolbar centred 8px above it, the pointer resting on Reply. Check that the toolbar holds exactly Reply then Copy with no separator, that releasing the selection reported nothing, that Reply sits on the toolbar highlight and that its tooltip names it with no shortcut.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const range = selectAndRelease(canvasElement)
		const toolbar = await toolbarIn(canvasElement)
		const buttons = within(toolbar).getAllByRole("button")

		await expect(buttons.map((button) => button.ariaLabel)).toEqual([
			"Reply",
			"Copy",
		])
		await expect(within(toolbar).queryByRole("separator")).toBeNull()
		await expect(args.onReply).not.toHaveBeenCalled()
		await expect(args.onCopy).not.toHaveBeenCalled()
		await expect(document.getSelection()?.toString()).toBe(SELECTED)

		const selected = range.getBoundingClientRect()
		const bar = toolbar.getBoundingClientRect()
		await expect((bar.left + bar.right) / 2).toBeCloseTo(
			(selected.left + selected.right) / 2,
			0,
		)
		await expect(selected.top - bar.bottom).toBeCloseTo(SELECTION_GAP, 0)

		const [reply] = buttons
		if (isInBrowserRunner()) {
			const { userEvent: pointer } = await import("vitest/browser")
			await pointer.hover(reply)
			await expect(getComputedStyle(reply).backgroundColor).toBe(
				tokenStyleIn(
					reply,
					"bg-selection-toolbar-highlight",
					"backgroundColor",
				),
			)
		} else {
			await userEvent.hover(reply)
		}
		const tooltip = await screen.findByRole("tooltip")
		await expect(tooltip).toHaveTextContent(/^Reply$/)
		await expect(tooltip.querySelector("kbd")).toBeNull()
	},
})

export const ReplyPressed = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Pressing Reply hands the selected text to `onReply` and hides the toolbar. Check that the selection stays painted while the button is pressed, since the toolbar never takes it, and that Copy is not called.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		selectAndRelease(canvasElement, ` ${SELECTED}`)
		const toolbar = await toolbarIn(canvasElement)

		await userEvent.click(
			within(toolbar).getByRole("button", { name: "Reply" }),
		)

		await expect(args.onReply).toHaveBeenCalledOnce()
		await expect(args.onReply).toHaveBeenCalledWith(SELECTED)
		await expect(args.onCopy).not.toHaveBeenCalled()
		await expect(document.getSelection()?.toString().trim()).toBe(SELECTED)
		await expectToolbarGone(canvasElement)
	},
})

export const CopyPressed = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Pressing Copy hands the selected text to `onCopy` and hides the toolbar, the selection still painted when it goes.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		selectAndRelease(canvasElement)
		const toolbar = await toolbarIn(canvasElement)

		await userEvent.click(within(toolbar).getByRole("button", { name: "Copy" }))

		await expect(args.onCopy).toHaveBeenCalledOnce()
		await expect(args.onCopy).toHaveBeenCalledWith(SELECTED)
		await expect(args.onReply).not.toHaveBeenCalled()
		await expect(document.getSelection()?.toString()).toBe(SELECTED)
		await expectToolbarGone(canvasElement)
	},
})

export const KeyboardSelection = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A selection extended from the keyboard finishes when Shift is released. Check that Tab then lands on Reply with a visible focus ring and its tooltip, that the arrow keys walk to Copy and back, and that Enter on Copy reports the text and hides the toolbar.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		selectInAnswer(canvasElement, "Nothing was lost.")
		const message = messageOf(canvasElement)
		releaseShift(message)
		const toolbar = await toolbarIn(canvasElement)
		const button = (name: string) =>
			within(toolbar).getByRole("button", { name })

		button("Reply").focus()
		await userEvent.keyboard("{Shift>}{Tab}{/Shift}")
		await userEvent.tab()
		await expect(document.activeElement).toBe(button("Reply"))
		await expect(getComputedStyle(button("Reply")).boxShadow).not.toBe(NO_RING)
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent(/^Reply$/),
		)
		await userEvent.keyboard("{ArrowRight}")
		await expect(document.activeElement).toBe(button("Copy"))
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent(/^Copy$/),
		)
		await userEvent.keyboard("{ArrowLeft}")
		await expect(document.activeElement).toBe(button("Reply"))
		await userEvent.keyboard("{ArrowRight}{Enter}")

		await expect(args.onCopy).toHaveBeenCalledWith("Nothing was lost.")
		await expectToolbarGone(canvasElement)
	},
})

export const Dismissed = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The three ways the toolbar leaves without an action: the selection collapses, the selection is stretched past the message into the question above, and Escape. Check that each hides it and that neither callback runs.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		selectAndRelease(canvasElement)
		await toolbarIn(canvasElement)
		document.getSelection()?.collapseToEnd()
		await expectToolbarGone(canvasElement)

		selectAndRelease(canvasElement)
		await toolbarIn(canvasElement)
		const question = canvas.getByText(QUESTION).firstChild
		if (!question) throw new Error("The question drew no text")
		select([question, 0], [answerTextOf(canvasElement), 20])
		await expectToolbarGone(canvasElement)

		selectAndRelease(canvasElement)
		await toolbarIn(canvasElement)
		await userEvent.keyboard("{Escape}")
		await expectToolbarGone(canvasElement)

		await expect(args.onReply).not.toHaveBeenCalled()
		await expect(args.onCopy).not.toHaveBeenCalled()
	},
})
