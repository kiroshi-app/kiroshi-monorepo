import type { ReactNode } from "react"
import { expect, fn, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	expectClickModifiers,
	rightClick,
	shown,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	AuthorLine,
	type AuthorLineProps,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import {
	CompanionMenuContent,
	CompanionMenuProvider,
} from "@workspace/ui/components/companion-menu"
import { CompanionSelectProvider } from "@workspace/ui/components/companion-select"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	AssistantTurn,
	PersonTurn,
	UserTurn,
} from "@workspace/ui/components/turn"
import { NO_CLICK_MODIFIERS } from "@workspace/ui/lib/click-modifiers"

const ATLAS_AVATAR = (
	<BotIdentityAvatar hue={BLOT_HUES.blue} seed="atlas" size={20} />
)

const AGENT_LINE: AuthorLineProps = {
	tone: "agent",
	name: "Atlas",
	badge: "Planner",
	hue: BLOT_HUES.blue,
	avatar: ATLAS_AVATAR,
	time: "09:41",
}

const ATLAS: RosterBot = {
	id: "bot-atlas",
	name: "Atlas",
	blot: BLOT_HUES.blue,
	title: "Planner",
}

const LONG_NAMED: RosterBot = {
	...ATLAS,
	name: "Atlas Who Plans Every Quarterly Offsite For The Whole Lisbon Team",
}

const ANSWER = "The offsite runs Tuesday to Thursday, in Lisbon."

const SENT_AT = new Date(2026, 9, 10, 9, 41).getTime()

const READ_AT = new Date(2026, 9, 10, 9, 45).getTime()

const AUTHOR_LINE_GAP = 8

const COMPANION_MENU_LABEL = `Actions for ${ATLAS.name}`

const selectAgent = fn()

const menuFor = (companionId: string) =>
	companionId === ATLAS.id ? (
		<CompanionMenuContent
			companion={{ id: ATLAS.id, name: ATLAS.name }}
			isPinned={false}
			memberships={[]}
			sections={[]}
			spaces={[]}
		/>
	) : null

type BubbleFrameProps = {
	children: ReactNode
}

const BubbleFrame = ({ children }: BubbleFrameProps) => (
	<div className="mx-auto flex max-w-2xl flex-col">{children}</div>
)

type SelectableAnswerProps = {
	identity?: RosterBot
}

const SelectableAnswer = ({ identity = ATLAS }: SelectableAnswerProps) => (
	<CompanionSelectProvider onSelect={selectAgent}>
		<CompanionMenuProvider menuFor={menuFor}>
			<AssistantTurn identity={identity} sentAt={SENT_AT} now={READ_AT}>
				{ANSWER}
			</AssistantTurn>
		</CompanionMenuProvider>
	</CompanionSelectProvider>
)

const FramedSelectableAnswer = () => (
	<BubbleFrame>
		<SelectableAnswer />
	</BubbleFrame>
)

const expectFootGap = async (root: HTMLElement, footSlot: string) => {
	const content = slotIn(root, "message-bubble-content")
	const text = slotIn(content, "message-bubble-text").getBoundingClientRect()
	const foot = slotIn(content, footSlot).getBoundingClientRect()
	const padding = getComputedStyle(content)

	await expect(Math.round(foot.top - text.bottom)).toBe(AUTHOR_LINE_GAP)
	await expect(padding.paddingTop).toBe(padding.paddingLeft)
	await expect(padding.paddingBottom).toBe(padding.paddingRight)
}

const identityControlIn = (root: HTMLElement) => {
	const control = slotIn(root, "bot-select")
	return {
		control,
		name: slotIn(control, "author-line-name"),
	}
}

const meta = preview.meta({
	title: "Conversation/Message/AuthorLine",
	component: AuthorLine,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The foot of every message, 20 high: the avatar, the name (in the agent colour for an agent), the role badge of an agent and the send time. People and you lay it from the end side. `end` closes an answer with Stopped, or with This response failed and a Retry. `actions` sit after a divider: always shown on an agent reply, shown while the bubble is hovered or focused on a person's or your bubble. `isWriting` swaps the time and the actions for the word writing…. `AuthorLineQueued` takes its place on a message waiting to be sent.",
			},
		},
	},
	args: AGENT_LINE,
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a finished agent answer. Check the line is 20 high, the name in the agent colour and the badge in a 6 radius fill.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const line = slotIn(canvasElement, "author-line")
		await expect(line.getBoundingClientRect().height).toBe(20)
		await expect(
			slotIn(slotIn(canvasElement, "author-line"), "bot-title-badge"),
		).toHaveTextContent("Planner")
	},
})

export const Failed = meta.story({
	args: { end: "failed", onRetry: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for an answer that failed. Check the time gives way to This response failed and that Retry calls back.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.onRetry).toHaveBeenCalledTimes(1)
	},
})

export const Writing = meta.story({
	args: { isWriting: true, actions: <button type="button">Pin</button> },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the agent writes its reply. Check the avatar, the name and the badge stay, and that the word writing… takes the place of the time, the divider and the actions, in the muted 12 of the time.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const line = slotIn(canvasElement, "author-line")
		await expect(slotIn(line, "author-line-writing")).toHaveTextContent(
			"writing…",
		)
		await expect(canvas.queryByText("09:41")).toBeNull()
		await expect(canvas.queryByRole("button")).toBeNull()
		await expect(line.getBoundingClientRect().height).toBe(20)
	},
})

export const Queued = meta.story({
	render: () => <AuthorLineQueued onCancel={fn()} />,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a message waiting to be sent while an agent answers: a 28 high chip in the Space colour at 35 percent, with its close button.",
			},
		},
	},
})

export const GapAboveAnAgentLine = meta.story({
	render: () => (
		<BubbleFrame>
			<AssistantTurn identity={ATLAS} sentAt={SENT_AT} now={READ_AT}>
				{ANSWER}
			</AssistantTurn>
		</BubbleFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An agent answer with no select and no menu around it. Check the author line sits 8 below the answer text, the bubble padding is the same on every side, and the avatar and name stay plain, with no button.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectFootGap(canvasElement, "author-line")
		await expect(
			canvas.queryByRole("button", { name: ATLAS.name }),
		).not.toBeInTheDocument()
	},
})

export const GapAboveAPersonLine = meta.story({
	render: () => (
		<BubbleFrame>
			<PersonTurn name="Maya" sentAt={SENT_AT} now={READ_AT}>
				{ANSWER}
			</PersonTurn>
		</BubbleFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A message from another person, laid from the end side. Check the author line sits 8 below the text and the bubble padding is the same on every side.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectFootGap(canvasElement, "author-line"),
})

export const GapAboveYourLine = meta.story({
	render: () => (
		<BubbleFrame>
			<UserTurn name="You" sentAt={SENT_AT} now={READ_AT}>
				{ANSWER}
			</UserTurn>
		</BubbleFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your own message, in your bubble colour. Check the author line sits 8 below the text and the bubble padding is the same on every side.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectFootGap(canvasElement, "author-line"),
})

export const GapAboveAQueuedLine = meta.story({
	render: () => (
		<BubbleFrame>
			<UserTurn name="You" state="queued" onCancel={fn()}>
				{ANSWER}
			</UserTurn>
		</BubbleFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Your message waiting to be sent. Check the Queued chip sits 8 below the text and the bubble padding is the same on every side.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectFootGap(canvasElement, "author-line-queued"),
})

export const NameClickSelectsTheAgent = meta.story({
	render: () => <FramedSelectableAnswer />,
	parameters: {
		docs: {
			description: {
				story:
					"An agent answer under a select and an agent menu. Check a click on the name opens the agent the way a click on the avatar does: middle, Cmd, Ctrl and Shift clicks report their key, a plain click and Enter report none, and a right-click selects nothing.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		selectAgent.mockClear()
		const { name } = identityControlIn(canvasElement)

		await expectClickModifiers({
			target: name,
			callback: selectAgent,
			reported: [ATLAS.id],
			userEvent,
		})
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await userEvent.keyboard("{Escape}")
	},
})

export const NameRightClickOpensTheAgentMenu = meta.story({
	render: () => <FramedSelectableAnswer />,
	parameters: {
		docs: {
			description: {
				story:
					"An agent answer under a select and an agent menu. Check a right-click on the name opens the same agent menu as the avatar, and selects nothing.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		selectAgent.mockClear()
		const { name } = identityControlIn(canvasElement)

		rightClick(name)
		await shown(await screen.findByRole("menu", { name: COMPANION_MENU_LABEL }))
		await expect(selectAgent).not.toHaveBeenCalled()
		await userEvent.keyboard("{Escape}")
	},
})

export const KeyboardFocusOnTheAgentBlock = meta.story({
	render: () => <FramedSelectableAnswer />,
	parameters: {
		docs: {
			description: {
				story:
					"An agent answer reached by Tab. Check avatar and name are one control labelled by the agent name, with one ring drawn around both, the badge and the time left outside it, colours that change with no transition, and that Enter and Space open the agent.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		selectAgent.mockClear()
		const { control } = identityControlIn(canvasElement)
		const line = slotIn(canvasElement, "author-line")

		await userEvent.tab()
		await userEvent.tab()
		await expect(control).toHaveFocus()
		await expect(control).toBe(canvas.getByRole("button", { name: ATLAS.name }))
		await expect(control.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(control).outlineStyle).toBe("solid")
		await expect(slotIn(control, "bot-identity-avatar")).toBeVisible()
		await expect(slotIn(control, "shared-mark")).toContainElement(
			slotIn(control, "bot-identity-avatar"),
		)
		await expect(slotIn(line, "bot-title-badge")).toBeVisible()
		await expect(control).not.toContainElement(slotIn(line, "bot-title-badge"))
		await expect(control).not.toContainElement(line.querySelector("time"))
		await expect(colourTransitionsOf(control)).toEqual([])

		await userEvent.keyboard("{Enter}")
		await userEvent.keyboard(" ")
		await expect(selectAgent).toHaveBeenCalledTimes(2)
		await expect(selectAgent).toHaveBeenLastCalledWith(
			ATLAS.id,
			NO_CLICK_MODIFIERS,
		)
	},
})

export const LongNameInANarrowBubble = meta.story({
	render: () => (
		<div className="w-80">
			<SelectableAnswer identity={LONG_NAMED} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An agent with a very long name in a 320 wide bubble. Check the name truncates inside the control and the badge and time stay in full view.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { control, name } = identityControlIn(canvasElement)
		const line = slotIn(canvasElement, "author-line").getBoundingClientRect()
		const time = canvasElement.querySelector("time")?.getBoundingClientRect()

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(control.getBoundingClientRect().right).toBeLessThanOrEqual(
			line.right,
		)
		await expect(time?.width).toBeGreaterThan(0)
		await expect(time?.right).toBeLessThanOrEqual(line.right)
	},
})

export const StickyOutsideABubble = meta.story({
	tags: ["test-only"],
	args: { isSticky: true },
	parameters: {
		docs: {
			description: {
				story:
					"A sticky line rendered with no bubble around it, so no bubble padding to stick by. Check it renders in place and never reads as stuck.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotIn(canvasElement, "author-line").dataset.stuck).toBe(
			"false",
		)
	},
})
