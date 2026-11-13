import { useState } from "react"
import { expect, fn, type UserEventObject, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import {
	LibraryCommentComposer,
	type LibraryCommentComposerProps,
} from "@workspace/ui/components/library-comment-composer"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import {
	COMMENT_PARTICIPANTS,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
	PASSAGE_ANCHOR,
	STEVE,
	UNBREAKABLE,
} from "@workspace/ui/components/library-comments.fixtures"

const QUESTION = "Can we push the boat to 17:30?"

const ComposerOnPage = ({
	value: initialValue,
	onValueChange,
	...props
}: LibraryCommentComposerProps) => {
	const [value, setValue] = useState(initialValue)

	return (
		<div
			className="flex w-110 max-w-full flex-col items-start gap-3 bg-background p-10 pb-64 dark:bg-card"
			data-slot="composer-page"
			{...hueScopeOf("blue")}
		>
			<LibraryCommentPin author={STEVE} state="selected" />
			<LibraryCommentComposer
				{...props}
				onValueChange={(next) => {
					setValue(next)
					onValueChange(next)
				}}
				value={value}
			/>
		</div>
	)
}

const fieldIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole<HTMLTextAreaElement>("textbox", {
		name: "Comment, @ to mention",
	})

const typeAtEnd = (
	userEvent: UserEventObject,
	field: HTMLTextAreaElement,
	text: string,
) =>
	userEvent.type(field, text, {
		initialSelectionStart: field.value.length,
		initialSelectionEnd: field.value.length,
	})

const namesIn = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("option")
		.map((option) => slotIn(option, "library-comment-mention-name").textContent)

const sendIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole("button", { name: "Send" })

const meta = preview.meta({
	title: "Navigation/LibraryCommentComposer",
	component: LibraryCommentComposer,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The card a new comment is written in, under its selected pin: the line naming what the comment is on, the field, the @ button and Send. The field takes the caret as soon as the card mounts, without scrolling the page. Send stays disabled while the field is empty; Enter sends and Shift+Enter breaks the line. Typing @ or pressing the @ button opens the mention menu under the card, Agents then People, moved with the arrow keys and chosen with Enter, and the chosen name lands in the field in the Space colour. The card is 360 px wide and narrows with its container.",
			},
		},
	},
	args: {
		anchor: PASSAGE_ANCHOR,
		value: "",
		participants: COMMENT_PARTICIPANTS,
		onValueChange: fn(),
		onSubmit: fn(),
	},
	render: (args) => <ComposerOnPage {...args} />,
})

export const Empty = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The field before a word is typed, as artboard Thread 1 draws it. Check the field holding the focus with no click, the placeholder, the caret in the Space colour, a disabled Send that Enter does not get past, and the names of the two icon buttons.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const field = fieldIn(canvasElement)
		await expect(field).toHaveFocus()
		await expect(field).toHaveAttribute("placeholder", "Comment, @ to mention")
		await expect(sendIn(canvasElement)).toBeDisabled()
		await expect(
			within(canvasElement).getByRole("button", { name: "Mention someone" }),
		).toBeEnabled()

		await userEvent.click(field)
		await userEvent.keyboard("{Enter}")
		await expect(args.onSubmit).not.toHaveBeenCalled()
		await expect(getComputedStyle(field).caretColor).toBe(
			getComputedStyle(
				slotIn(canvasElement.ownerDocument.body, "library-comment-pin"),
			).backgroundColor,
		)
	},
})

export const EmptyDark = meta.story({
	globals: { theme: "dark" },
	play: Empty.input.play,
})

export const Filled = meta.story({
	args: { value: QUESTION },
	parameters: {
		docs: {
			description: {
				story:
					"The field holding a sentence. Check Send is enabled and wears the Space colour with no colour transition, that Enter sends once, that Shift+Enter breaks the line instead, and that clearing the field disables Send again.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const field = fieldIn(canvasElement)
		const send = sendIn(canvasElement)
		await expect(send).toBeEnabled()
		await expect(getComputedStyle(send).transitionProperty).toBe("none")

		await typeAtEnd(userEvent, field, "{Enter}")
		await expect(args.onSubmit).toHaveBeenCalledOnce()
		await userEvent.click(send)
		await expect(args.onSubmit).toHaveBeenCalledTimes(2)

		await typeAtEnd(userEvent, field, "{Shift>}{Enter}{/Shift}")
		await expect(field).toHaveValue(`${QUESTION}\n`)
		await expect(args.onSubmit).toHaveBeenCalledTimes(2)

		await userEvent.clear(field)
		await expect(send).toBeDisabled()
	},
})

export const FilledDark = meta.story({
	args: Filled.input.args,
	globals: { theme: "dark" },
	play: Filled.input.play,
})

export const Mentioning = meta.story({
	args: { value: `${QUESTION} ` },
	parameters: {
		docs: {
			description: {
				story:
					"The mention menu open under the card, as artboard Thread 2 draws it. Check typing @ opens it with Agents then People, each agent with its role and a hexagonal avatar, each person with a round one, the first row active; that Down moves to Juniper and Enter writes the name into the field without sending; and that Escape closes a menu opened again.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const field = fieldIn(canvasElement)
		await typeAtEnd(userEvent, field, "@")

		const menu = await within(canvasElement).findByRole("listbox", {
			name: "Mention",
		})
		const [agents, people] = within(menu).getAllByRole("group")
		await expect(agents).toHaveAccessibleName("Agents")
		await expect(people).toHaveAccessibleName("People")

		const options = within(menu).getAllByRole("option")
		await expect(namesIn(menu)).toEqual([
			"Atlas",
			"Juniper",
			"Lena Ortiz",
			"Marta Silva",
		])
		await expect(
			slotIn(options[0], "library-comment-mention-role"),
		).toHaveTextContent("Planner")
		await expect(options[0]).toHaveAttribute("aria-selected", "true")
		await expect(slotIn(options[0], "bot-identity-avatar")).toBeVisible()
		await expect(slotIn(options[2], "library-comment-person")).toBeVisible()

		await userEvent.keyboard("{ArrowDown}")
		await expect(options[1]).toHaveAttribute("aria-selected", "true")
		await userEvent.keyboard("{Enter}")

		await expect(field).toHaveValue(`${QUESTION} @Juniper `)
		await expect(args.onSubmit).not.toHaveBeenCalled()
		await expect(within(canvasElement).queryByRole("listbox")).toBe(null)
		await expect(
			slotIn(canvasElement, "library-comment-mention"),
		).toHaveTextContent("@Juniper")

		await userEvent.keyboard("@le")
		const narrowed = await within(canvasElement).findByRole("listbox")
		await expect(namesIn(narrowed)).toEqual(["Lena Ortiz"])
		await userEvent.keyboard("{Escape}")
		await expect(within(canvasElement).queryByRole("listbox")).toBe(null)
	},
})

export const MentioningDark = meta.story({
	args: Mentioning.input.args,
	globals: { theme: "dark" },
	play: Mentioning.input.play,
})

export const MentionFromButton = meta.story({
	args: { value: QUESTION },
	parameters: {
		docs: {
			description: {
				story:
					"The @ button pressed after a sentence. Check it writes a spaced @ at the caret, opens the menu, keeps the keyboard in the field, and that a click on a person writes the name.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const field = fieldIn(canvasElement)
		await userEvent.click(
			within(canvasElement).getByRole("button", { name: "Mention someone" }),
		)
		await expect(field).toHaveValue(`${QUESTION} @`)
		await expect(field).toHaveFocus()

		const menu = await within(canvasElement).findByRole("listbox")
		await userEvent.click(
			within(menu).getByRole("option", { name: "Lena Ortiz" }),
		)
		await expect(field).toHaveValue(`${QUESTION} @Lena Ortiz `)
		await expect(field).toHaveFocus()
	},
})

export const MentionFromButtonDark = meta.story({
	args: MentionFromButton.input.args,
	globals: { theme: "dark" },
	play: MentionFromButton.input.play,
})

export const Mentioned = meta.story({
	args: { value: `${QUESTION} @Atlas ask the captain.` },
	parameters: {
		docs: {
			description: {
				story:
					"A sentence naming an agent, as artboard Doc 3 draws it. Check the name wears the Space colour, the same as Send, and the rest of the sentence does not.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const mention = slotIn(canvasElement, "library-comment-mention")
		await expect(mention).toHaveTextContent("@Atlas")
		await expect(getComputedStyle(mention).color).toBe(
			getComputedStyle(sendIn(canvasElement)).backgroundColor,
		)
		await expect(
			canvasElement.querySelectorAll('[data-slot="library-comment-mention"]'),
		).toHaveLength(1)
	},
})

export const MentionedDark = meta.story({
	args: Mentioned.input.args,
	globals: { theme: "dark" },
	play: Mentioned.input.play,
})

export const LongContent = meta.story({
	args: {
		anchor: `On “${UNBREAKABLE}”`,
		value: `${UNBREAKABLE} and several sentences after it, so the field grows.`,
		participants: [LONG_NAMED_AGENT, LONG_NAMED_PERSON],
	},
	parameters: {
		docs: {
			description: {
				story:
					"An unbreakable link in the anchor line and in the field, the menu open on two long names, in a 320 px page. Check nothing overflows the card or the menu sideways and the field grows instead of scrolling.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const page = slotIn(canvasElement, "composer-page")
		page.style.width = "320px"

		const field = fieldIn(canvasElement)
		await typeAtEnd(userEvent, field, " @")
		const menu = await within(canvasElement).findByRole("listbox")
		const card = slotIn(canvasElement, "library-comment-composer")

		await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
		await expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth)
		await expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight)
		await expect(card.getBoundingClientRect().right).toBeLessThanOrEqual(
			page.getBoundingClientRect().right,
		)
	},
})

export const LongContentDark = meta.story({
	args: LongContent.input.args,
	globals: { theme: "dark" },
	play: LongContent.input.play,
})
