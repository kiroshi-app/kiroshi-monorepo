import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AuthorLine } from "@workspace/ui/components/author-line"
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
		<MessageMenuItem label="Pin" onClick={noop}>
			<Icons.Pin aria-hidden="true" />
			Pin
		</MessageMenuItem>
		<ContextMenuSeparator />
		<MessageMenuItem label="Reply" onClick={noop}>
			<Icons.Reply aria-hidden="true" />
			Reply
		</MessageMenuItem>
		<MessageMenuItem label="Copy" onClick={noop}>
			<Icons.Copy aria-hidden="true" />
			Copy
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
					"The right-click menu of a bubble and the 24 by 20 action button its author line shows on hover or focus. `MessageActions` wraps the bubble so a right click anywhere on it opens Pin, a separator, Reply and Copy; `MessageAction` is the icon button `AuthorLine` lays after its divider. `Turn` hands both the same actions, so the menu and the hover row never disagree.",
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
					"An agent answer at rest. Right click it and check the menu: 168 wide, Pin first, a separator, then Reply and Copy, each 32 high with a 14 icon. Tab onto the bubble and check that the same three actions appear in its author line, 24 by 20 each.",
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
		await expect(pin.getBoundingClientRect().height).toBe(20)

		await userEvent.pointer({ keys: "[MouseRight]", target: bubble })
		const menu = await within(canvasElement.ownerDocument.body).findByRole(
			"menu",
		)
		const items = within(menu).getAllByRole("menuitem")
		await expect(items.map((item) => item.textContent)).toEqual([
			"Pin",
			"Reply",
			"Copy",
		])
		await waitFor(() => expect(menu.getBoundingClientRect().width).toBe(168))
		await userEvent.keyboard("{Escape}")
	},
})
