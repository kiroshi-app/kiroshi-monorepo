import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	glyphIn,
	probedStyleOf,
	slotIn,
} from "@workspace/storybook/story-utils"
import { Icons } from "@workspace/ui/components/icons"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { SpaceAccessBanner } from "@workspace/ui/components/space-access-banner"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only, in the thread of a joined space."

const bannerIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "space-access-banner")

const expectBetweenTranscriptAndComposer = async (
	canvasElement: HTMLElement,
) => {
	const banner = bannerIn(canvasElement).getBoundingClientRect()
	const composer = within(canvasElement)
		.getByRole("textbox", { name: "Message" })
		.getBoundingClientRect()
	const transcript = slotIn(
		canvasElement,
		"message-scroller",
	).getBoundingClientRect()

	await expect(banner.top).toBeGreaterThanOrEqual(transcript.bottom)
	await expect(banner.bottom).toBeLessThanOrEqual(composer.top)
}

const meta = preview.meta({
	title: "Feedback/SpaceAccessBanner",
	component: SpaceAccessBanner,
	globals: { theme: "dark" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"Why a joined space's thread can no longer be used as before, drawn in the thread between the transcript and the composer so what is already there stays readable. Three reasons, each with its mark and its copy: the host removed the reader, the host deleted the space, or the host's computer is offline. It is a polite status, not an alert: the reader lands on it, nothing interrupted them. The host places it in `ThreadLayout`'s `notice` slot.",
			},
		},
	},
	args: { space: "Studio", host: "Noa" },
	render: (args) => (
		<WorkspaceShell>
			<ThreadLayout
				composer={<PromptInput onSubmit={fn()} />}
				notice={<SpaceAccessBanner {...args} />}
			>
				<UserTurn>Can you check the release notes before Friday?</UserTurn>
				<AssistantTurn>
					I read them twice. Two links are broken, I listed them below.
				</AssistantTurn>
			</ThreadLayout>
		</WorkspaceShell>
	),
})

export const Removed = meta.story({
	name: "8 No longer a member",
	args: { reason: "removed" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 8: the host removed the reader from the space. Check the leave mark, the title naming the space, the body naming the host to ask, the raised card on its hairline ring, and that it sits between the transcript and the composer. Pick \`Deleted\` for a space the host deleted.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const banner = bannerIn(canvasElement)

		await expect(banner).toHaveAttribute("role", "status")
		await expect(banner).toHaveTextContent(
			"You're no longer a member of Studio",
		)
		await expect(banner).toHaveTextContent(
			"Its conversations aren’t on this device anymore. Ask Noa for a new invitation.",
		)
		await expect(glyphIn(banner, Icons.Leave)).not.toBe(null)
		await expect(getComputedStyle(banner).borderTopLeftRadius).toBe("20px")
		await expect(getComputedStyle(banner).boxShadow).toContain(
			probedStyleOf("text-border", "color", banner),
		)
		await expectBetweenTranscriptAndComposer(canvasElement)
	},
})

export const Deleted = meta.story({
	name: "8.1 Space deleted",
	args: { reason: "deleted" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 8.1: the host deleted the space. Check the leave mark, the title naming who deleted which space, and the body. Pick \`Offline\` for a space whose host is only away.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const banner = bannerIn(canvasElement)

		await expect(banner).toHaveTextContent("Noa deleted Studio")
		await expect(banner).toHaveTextContent(
			"Its conversations aren't on this device anymore.",
		)
		await expect(glyphIn(banner, Icons.Leave)).not.toBe(null)
	},
})

export const Offline = meta.story({
	name: "8.2 Host offline",
	args: { reason: "offline" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 8.2: the host's computer is offline. Check the clock mark, the title, and the body saying what still works and when sending comes back. Pick \`Removed\` for a reader who lost the space.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		const banner = bannerIn(canvasElement)

		await expect(banner).toHaveTextContent("Studio is offline")
		await expect(banner).toHaveTextContent(
			"You can read what’s here. You can send again once Kiroshi is open on Noa’s computer.",
		)
		await expect(glyphIn(banner, Icons.Clock)).not.toBe(null)
	},
})
