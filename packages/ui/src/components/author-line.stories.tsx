import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import {
	AuthorLine,
	type AuthorLineProps,
	AuthorLineQueued,
} from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"

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

const meta = preview.meta({
	title: "Conversation/Message/AuthorLine",
	component: AuthorLine,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"The foot of every bubble, 20 high: the avatar, the name (in the agent colour for an agent), the role badge of an agent and the send time. People and you lay it from the end side. `end` closes an answer with Stopped, or with This response failed and a Retry. `actions` appear after a divider while the bubble is hovered or focused. `AuthorLineQueued` takes its place on a message waiting to be sent.",
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
		await expect(slotIn(canvasElement, "author-line-role")).toHaveTextContent(
			"Planner",
		)
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
