import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AuthorLine,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import {
	MessageAction,
	MessageActions,
	MessageMenuItem,
} from "@workspace/ui/components/message-actions"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import { ContextMenuSeparator } from "@workspace/ui/components/ui/context-menu"

const ANSWER = "Yes, all 14 checks passed at 9:12."

const noop = fn()

const Actions = () => (
	<>
		<MessageAction label="Pin" onClick={noop}>
			<Icons.Pin />
		</MessageAction>
		<MessageAction label="Reply" onClick={noop}>
			<Icons.Reply />
		</MessageAction>
		<MessageAction label="Copy" onClick={noop}>
			<Icons.Copy />
		</MessageAction>
	</>
)

const Menu = () => (
	<>
		<MessageMenuItem label="Reply" onClick={noop}>
			<Icons.Reply aria-hidden="true" />
			Reply
		</MessageMenuItem>
		<MessageMenuItem label="Copy" onClick={noop}>
			<Icons.Copy aria-hidden="true" />
			Copy
		</MessageMenuItem>
		<MessageMenuItem label="Pin" onClick={noop}>
			<Icons.Pin aria-hidden="true" />
			Pin
		</MessageMenuItem>
		<ContextMenuSeparator />
		<MessageMenuItem label="Save as document" onClick={noop}>
			<Icons.File aria-hidden="true" />
			Save as document
		</MessageMenuItem>
	</>
)

const AgentBubble = () => (
	<MessageBubble variant="soft">
		<MessageActions menu={<Menu />}>
			<MessageBubbleContent
				tabIndex={0}
				foot={
					<AuthorLine
						tone="agent"
						name="Atlas"
						hue={BLOT_HUES.blue}
						badge="Planner"
						avatar={
							<BotIdentityAvatar hue={BLOT_HUES.blue} seed="atlas" size={20} />
						}
						time="09:20"
						actions={<Actions />}
					/>
				}
			>
				{ANSWER}
			</MessageBubbleContent>
		</MessageActions>
	</MessageBubble>
)

const meta = preview.meta({
	title: "Conversation/Message/MessageActions",
	component: MessageActions,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The right-click menu of a bubble and the 24 square action button its author line shows on hover or focus. `MessageActions` wraps the bubble so a right click anywhere on it opens Reply, Copy and Pin, then a separator and Save as document; `MessageAction` is the icon button `AuthorLine` lays after its divider, Pin, Reply and Copy in that order. The two orders differ: the menu follows the message menu artboard, the hover row keeps its own order, and Save as document lives only in the menu.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => <AgentBubble />,
	parameters: {
		docs: {
			description: {
				story:
					"An agent answer at rest. Right click it and check the menu: 168 wide, Reply, Copy and Pin, then a separator and Save as document with the file glyph, each row 32 high with a 14 icon. Tab onto the bubble and check that its author line shows Pin, Reply and Copy, 24 square each, and no Save as document button.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const bubble = canvas.getByText(ANSWER).closest("[tabindex='0']")
		if (!(bubble instanceof HTMLElement)) throw new Error("bubble missing")

		await userEvent.tab()
		await expect(bubble).toHaveFocus()
		const pin = canvas.getByRole("button", { name: "Pin" })
		await expect(pin).toBeVisible()
		await expect(pin.getBoundingClientRect().width).toBe(24)
		await expect(pin.getBoundingClientRect().height).toBe(24)
		await expect(
			canvas.queryByRole("button", { name: "Save as document" }),
		).toBeNull()

		await userEvent.pointer({ keys: "[MouseRight]", target: bubble })
		const menu = await within(canvasElement.ownerDocument.body).findByRole(
			"menu",
		)
		const items = within(menu).getAllByRole("menuitem")
		await expect(items.map((item) => item.textContent)).toEqual([
			"Reply",
			"Copy",
			"Pin",
			"Save as document",
		])
		const separators = within(menu).getAllByRole("separator")
		await expect(separators).toHaveLength(1)
		await expect(separators[0]?.nextElementSibling).toBe(items.at(-1))
		await waitFor(() => expect(menu.getBoundingClientRect().width).toBe(168))
		await userEvent.keyboard("{Escape}")
	},
})

const AUTHOR_LINE_BUTTONS = ["Pin", "Reply", "Copy", "Cancel this message"]

export const SquareIconButtons = meta.story({
	render: () => (
		<div className="flex flex-col items-start gap-6">
			<AgentBubble />
			<AuthorLineQueued onCancel={noop} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Every icon button an author line carries, Pin, Reply and Copy on hover or focus and Cancel on a queued message, at the Button `icon-xs` size: 24 square, its name read aloud, the Button focus ring when the keyboard lands on it.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.tab()
		for (const name of AUTHOR_LINE_BUTTONS) {
			await userEvent.tab()
			const button = canvas.getByRole("button", { name })
			await expect(button).toHaveFocus()
			const { width, height } = button.getBoundingClientRect()
			await expect([width, height]).toEqual([24, 24])
			await expect(getComputedStyle(button).boxShadow).not.toBe("none")
		}
	},
})
