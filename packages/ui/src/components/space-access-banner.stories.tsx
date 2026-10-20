import { expect, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	glyphIn,
	probedStyleOf,
	slotIn,
} from "@workspace/storybook/story-utils"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import {
	SpaceAccessBanner,
	type SpaceAccessReason,
	type SpaceWaitReason,
} from "@workspace/ui/components/space-access-banner"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

const ARTBOARD =
	"Measured against the Paper page `Mockup` of `Kiroshi, E2E Spaces v2`, dark only, in the thread of a joined space."

const CARD_INLINE_INSET = 48

const CARD_BOTTOM_INSET = 24

type ExpectedBanner = {
	reason: SpaceAccessReason
	title: string
	body: string
	mark: Icon
}

const expectInComposerSpot = async (
	canvasElement: HTMLElement,
	{ reason, title, body, mark }: ExpectedBanner,
) => {
	const banner = slotIn(canvasElement, "space-access-banner")
	const card = banner.getBoundingClientRect()
	const thread = slotIn(canvasElement, "chat-layout").getBoundingClientRect()
	const titleLine = within(banner).getByText(title)
	const bodyLine = within(banner).getByText(body)

	await expect(banner).toHaveAttribute("role", "status")
	await expect(banner).toHaveAttribute("data-reason", reason)
	await expect(titleLine).toBeVisible()
	await expect(bodyLine).toBeVisible()
	await expect(glyphIn(banner, mark)).not.toBe(null)
	await expect(
		within(canvasElement).queryByRole("textbox", { name: "Message" }),
	).toBe(null)

	await expect(Math.round(card.left - thread.left)).toBe(CARD_INLINE_INSET)
	await expect(Math.round(thread.right - card.right)).toBe(CARD_INLINE_INSET)
	await expect(Math.round(thread.bottom - card.bottom)).toBe(CARD_BOTTOM_INSET)

	const cardStyle = getComputedStyle(banner)
	await expect(cardStyle.borderTopLeftRadius).toBe("20px")
	await expect(cardStyle.backgroundColor).toBe(
		probedStyleOf("bg-sidebar", "backgroundColor", banner),
	)
	await expect(cardStyle.boxShadow).toContain(
		probedStyleOf("text-border", "color", banner),
	)

	const titleStyle = getComputedStyle(titleLine)
	await expect(titleStyle.fontSize).toBe("14px")
	await expect(titleStyle.lineHeight).toBe("20px")
	await expect(titleStyle.fontWeight).toBe("600")
	const bodyStyle = getComputedStyle(bodyLine)
	await expect(bodyStyle.fontSize).toBe("13px")
	await expect(bodyStyle.lineHeight).toBe("18px")
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
					"Why a joined space's thread can no longer be written to, drawn in the composer's spot so what is already there stays readable and nothing invites a message that cannot be sent. Four reasons, each with its mark and its copy: the host removed the reader, the host deleted the space, the space left for a reason the host did not name, or the host's computer is offline. It is a polite status, not an alert: the reader lands on it, nothing interrupted them. The host places it in `ThreadLayout`'s `notice` slot and passes no `composer`.",
			},
		},
	},
	args: { space: "Studio", host: "Noa" },
	render: (args) => (
		<WorkspaceShell>
			<ThreadLayout notice={<SpaceAccessBanner {...args} />}>
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
				story: `${ARTBOARD} Artboard 8: the host removed the reader from the space. Check the leave mark, the title naming the space, the body naming the host to ask, the raised card on its hairline ring, and that it holds the composer's spot with no composer. Pick \`Deleted\` for a space the host deleted.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectInComposerSpot(canvasElement, {
			reason: "removed",
			title: "You’re no longer a member of Studio",
			body: "Its conversations aren’t on this device anymore. Ask Noa for a new invitation.",
			mark: Icons.Leave,
		})
	},
})

export const Deleted = meta.story({
	name: "8.1 Space deleted",
	args: { reason: "deleted" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 8.1: the host deleted the space. Check the leave mark, the title naming who deleted which space, the body, and that it holds the composer's spot with no composer. Pick \`Offline\` for a space whose host is only away.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectInComposerSpot(canvasElement, {
			reason: "deleted",
			title: "Noa deleted Studio",
			body: "Its conversations aren’t on this device anymore.",
			mark: Icons.Leave,
		})
	},
})

export const Offline = meta.story({
	name: "8.2 Host offline",
	args: { reason: "offline" },
	parameters: {
		docs: {
			description: {
				story: `${ARTBOARD} Artboard 8.2: the host's computer is offline. Check the clock mark, the title, the body saying what still works and when sending comes back, and that it holds the composer's spot with no composer. Pick \`Removed\` for a reader who lost the space.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectInComposerSpot(canvasElement, {
			reason: "offline",
			title: "Studio is offline",
			body: "You can read what’s here. You can send again once Kiroshi is open on Noa’s computer.",
			mark: Icons.Clock,
		})
	},
})

export const Unknown = meta.story({
	name: "Reason unknown",
	args: { reason: "unknown" },
	parameters: {
		docs: {
			description: {
				story: `No artboard draws this reason; it wears the leave mark and the card of artboards 8 and 8.1 on the Paper page \`Mockup\` of \`Kiroshi, E2E Spaces v2\`, dark only. The space left this computer for a reason the host did not name. Check the leave mark, the title naming the host and the space, the body saying the conversations stay with the host, and that it holds the composer's spot with no composer. Pick \`Removed\` or \`Deleted\` for a named reason.`,
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectInComposerSpot(canvasElement, {
			reason: "unknown",
			title: "Noa removed you from Studio.",
			body: "It’s gone from your spaces. Its conversations stay on Noa’s Kiroshi.",
			mark: Icons.Leave,
		})
	},
})

const waitStory = (
	waitReason: SpaceWaitReason,
	body: string,
	because: string,
) => ({
	args: { reason: "offline" as const, waitReason },
	parameters: {
		docs: {
			description: {
				story: `No artboard draws this body; it wears the card of artboard 8.2 on the Paper page \`Mockup\` of \`Kiroshi, E2E Spaces v2\`, dark only. The host's computer is out of reach because ${because}. Check the clock mark, the unchanged title, and the body naming what failed and what to do. Pick \`Offline\` for the body without a reason.`,
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await expectInComposerSpot(canvasElement, {
			reason: "offline",
			title: "Studio is offline",
			body,
			mark: Icons.Clock,
		})
	},
})

export const OfflineRelayUnreachable = meta.story({
	name: "Host offline, Kiroshi unreachable",
	...waitStory(
		"relayUnreachable",
		"You can read what’s here. Couldn’t reach Kiroshi, check your connection to send again.",
		"this computer couldn't reach Kiroshi",
	),
})

export const OfflineRekeySendFailed = meta.story({
	name: "Host offline, key request not sent",
	...waitStory(
		"rekeySendFailed",
		"You can read what’s here. Couldn’t ask Noa for the new key, check your connection to send again.",
		"the request for the host's new key didn't leave this computer",
	),
})

export const OfflineHostSilent = meta.story({
	name: "Host offline, host silent",
	...waitStory(
		"hostSilent",
		"You can read what’s here. Noa hasn’t answered yet, ask them to open Kiroshi on their computer.",
		"the host hasn't answered with a verified key yet",
	),
})

export const OfflineSocketClosed = meta.story({
	name: "Host offline, connection closed",
	...waitStory(
		"socketClosed",
		"You can read what’s here. The connection to Kiroshi closed, check your connection to send again.",
		"the connection to Kiroshi closed or went quiet",
	),
})

export const OfflineRekeyNotVerified = meta.story({
	name: "Host offline, key not verified",
	...waitStory(
		"rekeyNotVerified",
		"You can read what’s here. Couldn’t verify the key Noa sent, ask them for a new link.",
		"a key the host sent failed verification",
	),
})

export const OfflineNotMember = meta.story({
	name: "Host offline, not a member",
	...waitStory(
		"notMember",
		"You can read what’s here. Kiroshi says this account isn’t in Studio anymore, ask Noa for a new link.",
		"Kiroshi answered that this account isn't a member",
	),
})

export const OfflineUnknownInstance = meta.story({
	name: "Host offline, space not hosted",
	...waitStory(
		"unknownInstance",
		"You can read what’s here. Kiroshi doesn’t host Studio anymore, ask Noa to turn hosting on again.",
		"Kiroshi no longer knows the hosted space",
	),
})

export const OfflineDeviceKeysUnreadable = meta.story({
	name: "Host offline, device keys unreadable",
	...waitStory(
		"deviceKeysUnreadable",
		"You can read what’s here. Couldn’t read this computer’s device keys, quit Kiroshi and open it again.",
		"this computer couldn't read its own device keys",
	),
})

export const OfflineDeviceAwaitingApproval = meta.story({
	name: "Host offline, device awaiting approval",
	...waitStory(
		"deviceAwaitingApproval",
		"You can read what’s here. This computer isn’t approved yet, approve it from another computer signed in to your account.",
		"this computer still awaits approval from another device of the account",
	),
})

export const OfflineSocketUrlFailed = meta.story({
	name: "Host offline, address not received",
	...waitStory(
		"socketUrlFailed",
		"You can read what’s here. Couldn’t get Studio’s address from Kiroshi, quit Kiroshi and open it again.",
		"Kiroshi didn't give the address to connect to the space",
	),
})

export const OfflineRosterMissing = meta.story({
	name: "Host offline, member list missing",
	...waitStory(
		"rosterMissing",
		"You can read what’s here. Noa hasn’t sent the member list yet, ask them to open Kiroshi on their computer.",
		"the space key is held but no verified member list is",
	),
})

export const OfflineKeychainReadFailed = meta.story({
	name: "Host offline, secure storage unreadable",
	...waitStory(
		"keychainReadFailed",
		"You can read what’s here. Couldn’t read Studio’s key from this computer’s secure storage, quit Kiroshi and open it again.",
		"the space key couldn't be read from this computer's secure storage",
	),
})
