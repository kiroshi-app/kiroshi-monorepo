import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSkeletonFilledTo,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { ThreadTranscriptSkeleton } from "@workspace/ui/components/thread-transcript-skeleton"

const meta = preview.meta({
	title: "Feedback/ThreadTranscriptSkeleton",
	component: ThreadTranscriptSkeleton,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The stand-in for a conversation transcript while its first page is on its way: companion turns, a hexagon beside a name bar and a bubble, alternating with your bubbles on the right. It rests on the composer and rises to the top of the transcript region, the last turn cut by its edge. It takes the transcript's place through `ThreadLayout`'s `skeleton` slot, so the header and the composer stay the loaded components.",
			},
		},
	},
	render: () => (
		<ThreadLayout
			composer={<PromptInput onSubmit={fn()} />}
			header={
				<AppHeader
					leading={
						<HeaderIdentityButton
							connection="ready"
							name="Skippy"
							onOpenSettings={fn()}
							seed="bot-skippy"
							version="2.1.233"
						/>
					}
				/>
			}
			skeleton={<ThreadTranscriptSkeleton />}
		>
			{null}
		</ThreadLayout>
	),
	play: async ({ canvasElement }) => {
		await expectSkeletonFilledTo(canvasElement, "top")
		const list = slotIn(canvasElement, "list-skeleton")
		const [agent, user] = slotsIn(list, "list-skeleton-row")
		const [hexagon, name] = slotsIn(agent, "skeleton")

		await expect(list).toHaveAttribute("aria-hidden", "true")
		await expect(
			list.getBoundingClientRect().bottom -
				agent.getBoundingClientRect().bottom,
		).toBe(16)
		await expect(
			agent.getBoundingClientRect().top - user.getBoundingClientRect().bottom,
		).toBe(16)
		await expect(hexagon.getBoundingClientRect().width).toBe(40)
		await expect(hexagon.getBoundingClientRect().bottom).toBe(
			agent.getBoundingClientRect().bottom,
		)
		await expect(name.getBoundingClientRect().width).toBe(44)
		const agentBubble = slotIn(
			agent,
			"skeleton-agent-bubble",
		).getBoundingClientRect()
		await expect([agentBubble.width, agentBubble.height]).toEqual([400, 44])
		const userBubble = slotIn(
			user,
			"skeleton-user-bubble",
		).getBoundingClientRect()
		await expect([userBubble.width, userBubble.height]).toEqual([236, 44])
	},
})

export const Light = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The transcript between the thread header and the composer, light theme. Check that the newest turn sits one small gap above the composer, that companion and user bubbles alternate in two sizes each, and that the topmost turn is cut by the header's edge. Pick `Dark` for the dark theme.",
			},
		},
	},
})

export const Dark = meta.story({
	globals: { theme: "dark", theme_layout: "single" },
	parameters: {
		docs: {
			description: {
				story:
					"The same transcript in the dark theme. Check that the solid hexagon and name bar stay apart from the faint bubbles against the dark ground. Pick `Light` for the light theme.",
			},
		},
	},
})
