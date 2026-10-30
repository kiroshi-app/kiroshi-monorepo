import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { expectHeadingFont } from "@workspace/storybook/story-utils"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"

const MARK = (
	<BotIdentityAvatar
		hue={BLOT_HUES.blue}
		name="Nest Keeper"
		seed="bot_4f8c21"
		size={64}
	/>
)

const ALERT_MARK = (
	<span className="flex size-12 items-center justify-center rounded-2xl border border-destructive bg-destructive/10 text-destructive">
		<Icons.Alert aria-hidden="true" className="size-6" />
	</span>
)

const meta = preview.meta({
	title: "Conversation/Message/EmptyStateShell",
	component: EmptyStateShell,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The frame every empty conversation surface is drawn in: a centered column holding a mark, a heading over its description, an optional action and an optional arrow hint. It owns the spacing and the type scale only — it reads no copy and knows no companion, so `ChatEmptyState` and `ConversationEmptyState` stay the components an app mounts. Reach for it directly only to add a third empty surface to the transcript region.",
			},
		},
	},
	args: {
		"data-slot": "empty-state-shell",
		mark: MARK,
		title: "Nest Keeper",
		description:
			"Kiroshi talks to the agent directly. Nothing leaves your device.",
		hint: "Type your first prompt in the composer below",
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read the frame at its nominal fill: a mark, a heading, one line of copy and the arrow hint, with no action between them. Check that the gap above and below the title block is even and that the hint sits last, so the composer below the surface stays the first thing to act on. Pick `WithAction` when the host has a button to offer. `packages/ui/src/components/conversation-empty-state.tsx:114` fills it exactly this way for a seated conversation: a mark, a heading, one line of copy and the hint, with no action.",
			},
		},
	},
	play: async ({ canvas }) => {
		const title = canvas.getByRole("heading", { name: "Nest Keeper" })
		await expect(title).toBeVisible()
		await expectHeadingFont(title)
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const WithAction = meta.story({
	args: {
		action: <Button onClick={fn()}>Agent settings</Button>,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the surface carries a secondary way out beside the composer. Check that the action lands between the copy and the hint — never after it — so the arrow stays the last thing read. Pick `WithoutHint` when the action is the only thing left to do. `packages/ui/src/components/chat-empty-state.tsx:73` fills it this way when the agent answers and the host can open the companion settings.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Agent settings" }),
		).toBeVisible()
		await expect(
			canvas.getByText(/Type your first prompt in the composer below/),
		).toBeVisible()
	},
})

export const WithoutHint = meta.story({
	args: {
		hint: undefined,
		action: <Button onClick={fn()}>Try again</Button>,
		title: "Couldn’t reach the agent",
		description: "Kiroshi’s built-in agent didn’t answer. Try again.",
		mark: ALERT_MARK,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the composer below is dead and the action on the surface is the only thing a reader can do. Check that dropping the hint closes the column cleanly instead of leaving a trailing gap, and that the button is the single focusable target. Pick `WithAction` while the composer is still live. `packages/ui/src/components/chat-empty-state.tsx:73` drops the hint and swaps the mark for the alert one as soon as the status is not ready.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getAllByRole("button")).toHaveLength(1)
		await expect(canvas.queryByText(/composer below/)).toBeNull()
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"Ship the December release, then plan the January retrospective with everyone involved",
		description:
			"Six agents are here and waiting on your first message, and every one of them reads the whole room before answering.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a long-named room whose copy runs past one line. Check that both the heading and the description wrap inside the same measure rather than stretching the surface wider. Pick `Default` for the nominal length. The title is the conversation name `packages/ui/src/components/conversation-empty-state.tsx:114` passes through, which nothing shortens.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading")).toBeVisible()
	},
})
