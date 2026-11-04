import { expect, fireEvent, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AuthorLine,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { Icons } from "@workspace/ui/components/icons"
import { ImageMenu } from "@workspace/ui/components/image-menu"
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
import { en } from "@workspace/ui/lib/i18n-en"
import { fr } from "@workspace/ui/lib/i18n-fr"

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

type MenuLabels = {
	reply: string
	copy: string
	pin: string
	saveAsDocument: string
}

type MenuProps = {
	labels: MenuLabels
}

const Menu = ({ labels }: MenuProps) => (
	<>
		<MessageMenuItem label={labels.reply} onClick={noop}>
			<Icons.Reply aria-hidden="true" />
			{labels.reply}
		</MessageMenuItem>
		<MessageMenuItem label={labels.copy} onClick={noop}>
			<Icons.Copy aria-hidden="true" />
			{labels.copy}
		</MessageMenuItem>
		<MessageMenuItem label={labels.pin} onClick={noop}>
			<Icons.Pin aria-hidden="true" />
			{labels.pin}
		</MessageMenuItem>
		<ContextMenuSeparator />
		<MessageMenuItem label={labels.saveAsDocument} onClick={noop}>
			<Icons.File aria-hidden="true" />
			{labels.saveAsDocument}
		</MessageMenuItem>
	</>
)

const AgentBubble = ({ labels = en.chat.turn }: Partial<MenuProps>) => (
	<MessageBubble variant="soft">
		<MessageActions menu={<Menu labels={labels} />}>
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
					"An agent answer at rest. Right click it and check the menu: as wide as its longest label and never under the shared context menu floor, Reply, Copy and Pin, then a separator and Save as document with the file glyph, each row 32 high with a 14 icon. Tab onto the bubble and check that its author line shows Pin, Reply and Copy, 24 square each, and no Save as document button.",
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

const MESSAGE_MENU_LABEL = en.chat.transcript.message.actions
const IMAGE_NAME = "release-checklist.png"
const IMAGE_MENU_LABEL = en.common.library.itemMenu.label.replace(
	"{{name}}",
	IMAGE_NAME,
)

const IMAGE_THUMBNAIL = (
	<button
		type="button"
		className="h-24 w-32 rounded-xl bg-muted text-compact text-muted-foreground"
	>
		{IMAGE_NAME}
	</button>
)

const NextToImageMenu = () => (
	<div className="flex items-start gap-6">
		<AgentBubble />
		<ImageMenu
			item={IMAGE_NAME}
			name={IMAGE_NAME}
			trigger={IMAGE_THUMBNAIL}
			onCopyImage={noop}
			onSaveToLibrary={noop}
		/>
	</div>
)

const surfaceOf = (menu: HTMLElement) => {
	const style = getComputedStyle(menu)
	return {
		background: style.backgroundColor,
		ring: style.getPropertyValue("--tw-ring-color"),
		shadow: style.boxShadow,
	}
}

const openMenuOn = async (target: Element, name: string) => {
	const { left, top } = target.getBoundingClientRect()
	fireEvent.contextMenu(target, { clientX: left + 8, clientY: top + 8 })
	return screen.findByRole("menu", { name })
}

const expectSameSurfaceAsImageMenu = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	const answer = canvas.getByText(ANSWER)
	const imageMenu = await openMenuOn(
		canvas.getByRole("button", { name: IMAGE_NAME }),
		IMAGE_MENU_LABEL,
	)
	const messageMenu = await openMenuOn(answer, MESSAGE_MENU_LABEL)
	await expect(messageMenu).toBeVisible()
	await expect(imageMenu).toBeVisible()
	await expect(surfaceOf(messageMenu)).toEqual(surfaceOf(imageMenu))
}

const SAME_SURFACE_DESCRIPTION =
	"The message menu open beside the image menu of a thread, both on the shared context menu surface: the same `popover` background, the same ring and the same shadow, with nothing on the message menu overriding the primitive."

export const SameSurfaceAsImageMenu = meta.story({
	render: () => <NextToImageMenu />,
	parameters: {
		docs: { description: { story: SAME_SURFACE_DESCRIPTION } },
	},
	play: async ({ canvasElement }) => {
		await expectSameSurfaceAsImageMenu(canvasElement)
	},
})

export const SameSurfaceAsImageMenuInDark = meta.story({
	render: () => <NextToImageMenu />,
	globals: { theme: "dark" },
	parameters: {
		docs: { description: { story: SAME_SURFACE_DESCRIPTION } },
	},
	play: async ({ canvasElement }) => {
		await expectSameSurfaceAsImageMenu(canvasElement)
	},
})

const expectEveryLabelOnOneLine = async (canvasElement: HTMLElement) => {
	const menu = await openMenuOn(
		within(canvasElement).getByText(ANSWER),
		MESSAGE_MENU_LABEL,
	)
	for (const item of within(menu).getAllByRole("menuitem")) {
		const label = [...item.childNodes].find(
			(node) => node.nodeType === Node.TEXT_NODE,
		)
		if (!label) throw new Error(`${item.textContent} has no text label`)
		const range = document.createRange()
		range.selectNodeContents(label)
		const lineHeight = Number.parseFloat(getComputedStyle(item).lineHeight)
		await expect(range.getClientRects()).toHaveLength(1)
		await expect(range.getBoundingClientRect().height).toBeLessThan(
			lineHeight * 2,
		)
	}
}

export const EveryLabelOnOneLine = meta.story({
	render: () => <AgentBubble />,
	parameters: {
		docs: {
			description: {
				story:
					"The open menu in English: the panel grows to its longest label, so Save as document stays on one line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectEveryLabelOnOneLine(canvasElement)
	},
})

export const EveryLabelOnOneLineInFrench = meta.story({
	render: () => <AgentBubble labels={fr.chat.turn} />,
	parameters: {
		docs: {
			description: {
				story:
					"The open menu with the French labels: Enregistrer comme document, the longest, widens the panel and stays on one line.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectEveryLabelOnOneLine(canvasElement)
	},
})
