import { useTranslation } from "react-i18next"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively } from "@workspace/storybook/story-utils"
import { Notice, type NoticeTone } from "@workspace/ui/components/notice"
import type { SpaceWaitReason } from "@workspace/ui/components/space-access-banner"

const CHAT_NOTICE_TONES = listExhaustively<NoticeTone>({
	warning: true,
	error: true,
})

const meta = preview.meta({
	title: "Feedback/Notice",
	component: Notice,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface a panel or a thread uses to tell the operator that something it needed could not be read: a history entry, a secret file, a mission, a skill file, an attachment. Every notice states what happened, and carries a Retry button only when replaying the same read is actually valid.",
			},
		},
	},
	args: {
		title: "The change history isn't available",
	},
	argTypes: {
		tone: { control: "select", options: CHAT_NOTICE_TONES },
		title: { control: "text" },
		description: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div className="w-[30rem] max-w-full">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The shape `history-change-page.tsx` renders when a change's files cannot be read: a title, nothing else. Reach for this when the failure needs no elaboration and nothing can be retried from the notice. Check that the surface stays one line tall and that no action row appears under the title.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("alert")).toBeVisible()
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const WithDescription = meta.story({
	args: {
		title: "Some secrets couldn't be read",
		description:
			"The environment file exists but could not be parsed. Fix it on disk, then reopen this panel.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `environment-panel.tsx` renders when the secrets file is unreadable: the description carries the fix, which happens outside the app. Reach for this when the operator needs to know what to do and no button in the notice can do it. Check that no action row is rendered under the description.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.queryByRole("button")).toBeNull()
	},
})

export const WithRetry = meta.story({
	args: {
		title: "This mission couldn't be read",
		description:
			"The mission could not be loaded. Nothing was changed, so the same read can be run again.",
		retry: { onRetry: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `mission-thread-screen.tsx` renders when a mission fails to load. Reach for this when the read can simply be run again: check that the Retry button is keyboard-reachable and calls back. Use `WithDescription` when retrying cannot help.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }))
		await expect(args.retry?.onRetry).toHaveBeenCalled()
	},
})

export const WithRetryLabel = meta.story({
	args: {
		title: "This skill file couldn't be opened",
		retry: { label: "Open again", onRetry: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `skill-files-panel.tsx` renders when a skill file fails to open: the retry reopens one file, so it says so instead of saying Retry. Reach for this when the generic label would hide which read is replayed. Check that the given label replaces the catalogue one entirely.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("button", { name: "Open again" }),
		).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull()
	},
})

export const RetryBusy = meta.story({
	args: {
		title: "The run history couldn't be read",
		description:
			"The runs of this routine could not be loaded. The read is running again.",
		retry: { onRetry: fn(), isBusy: true },
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `routine-detail.tsx` renders while a retried read is still in flight. Reach for this to check that the button stays focusable and announced as busy rather than being removed from the tab order, and that a second click does not queue a second read.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const retry = canvas.getByRole("button", { name: "Retry" })

		await expect(retry).toHaveAttribute("aria-busy", "true")
		await expect(retry).toHaveAttribute("aria-disabled", "true")

		await userEvent.click(retry)
		await expect(args.retry?.onRetry).not.toHaveBeenCalled()
	},
})

export const Dismissible = meta.story({
	args: {
		tone: "warning",
		title: "Some attachments were refused",
		description:
			"They exceed the size a turn can carry. The rest of the prompt was sent.",
		onDismiss: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape `thread-notice.tsx` renders when attachments or pins are refused: the turn went through, so the notice is a warning the operator closes rather than a failure to replay. Check that it is announced politely through `status`, and that the close control is the only button on the surface.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByRole("status")).toBeVisible()
		await expect(canvas.queryByRole("button", { name: "Retry" })).toBeNull()

		await userEvent.click(
			canvas.getByRole("button", { name: "Dismiss notice" }),
		)
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"The run history of packages/ui/src/components/notice.tsx couldn't be read",
		description:
			"The file exists but could not be parsed, and the panel has nothing to list until it can be. Nothing was written to disk, the workspace is still mounted, and the same read can be run again once the operator has fixed the file.",
		retry: { onRetry: fn() },
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when checking layout under a wrapping title and a multi-line description. Check that both wrap instead of pushing the icon or the Retry button off the surface, and that the button stays under the text rather than beside it.",
			},
		},
	},
})

const JOINED_SPACE = { host: "Noa", space: "Studio" }

type WaitingForHostNoticeProps = { reason: SpaceWaitReason }

const WaitingForHostNotice = ({ reason }: WaitingForHostNoticeProps) => {
	const { t } = useTranslation("chat")
	return (
		<Notice
			title={t("screen.notice.joinRefused.waitingForHost.title", JOINED_SPACE)}
			description={t(
				`screen.notice.joinRefused.waitingForHost.reasons.${reason}`,
				JOINED_SPACE,
			)}
		/>
	)
}

const waitingForHostStory = (
	reason: SpaceWaitReason,
	description: string,
	because: string,
) => ({
	render: () => <WaitingForHostNotice reason={reason} />,
	parameters: {
		docs: {
			description: {
				story: `The notice a joined space raises when it can't open because ${because}. Check that the title names the host, and that the description says what failed and what to do.`,
			},
		},
	},
	play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText("Waiting for Noa")).toBeVisible()
		await expect(canvas.getByText(description)).toBeVisible()
	},
})

export const JoinWaitingRelayUnreachable = meta.story({
	name: "Join waiting, Kiroshi unreachable",
	...waitingForHostStory(
		"relayUnreachable",
		"Couldn’t reach Kiroshi to open this space on Noa’s computer. Check your connection.",
		"this computer couldn't reach Kiroshi, the only reason that asks to check the connection",
	),
})

export const JoinWaitingRekeySendFailed = meta.story({
	name: "Join waiting, key request unanswered",
	...waitingForHostStory(
		"rekeySendFailed",
		"Couldn’t get this space’s key, Noa hasn’t answered. Ask them to open Kiroshi on their computer.",
		"the request for the space key got no answer from the host",
	),
})

export const JoinWaitingHostSilent = meta.story({
	name: "Join waiting, host silent",
	...waitingForHostStory(
		"hostSilent",
		"This space isn’t open yet, Noa hasn’t let this computer in. Ask them to open Kiroshi on their computer.",
		"the host hasn't answered with a verified key yet",
	),
})

export const JoinWaitingSocketClosed = meta.story({
	name: "Join waiting, connection closed",
	...waitingForHostStory(
		"socketClosed",
		"Couldn’t open this space, Noa hasn’t answered. Ask them to open Kiroshi on their computer.",
		"the connection closed before the host answered",
	),
})

export const JoinWaitingRekeyNotVerified = meta.story({
	name: "Join waiting, key not verified",
	...waitingForHostStory(
		"rekeyNotVerified",
		"Couldn’t verify the key Noa sent for this space. Ask them for a new link.",
		"a key the host sent failed verification",
	),
})

export const JoinWaitingNotMember = meta.story({
	name: "Join waiting, not a member",
	...waitingForHostStory(
		"notMember",
		"Kiroshi says this account isn’t a member of this space. Ask Noa for a new link.",
		"Kiroshi answered that this account isn't a member",
	),
})

export const JoinWaitingUnknownInstance = meta.story({
	name: "Join waiting, space not hosted",
	...waitingForHostStory(
		"unknownInstance",
		"Kiroshi doesn’t host this space anymore. Ask Noa to turn hosting on again.",
		"Kiroshi no longer knows the hosted space",
	),
})

export const JoinWaitingDeviceKeysUnreadable = meta.story({
	name: "Join waiting, device keys unreadable",
	...waitingForHostStory(
		"deviceKeysUnreadable",
		"Couldn’t read this computer’s device keys to connect to Noa. Quit Kiroshi and open it again.",
		"this computer couldn't read its own device keys",
	),
})

export const JoinWaitingDeviceAwaitingApproval = meta.story({
	name: "Join waiting, device awaiting approval",
	...waitingForHostStory(
		"deviceAwaitingApproval",
		"This computer isn’t approved to connect to Noa yet. Approve it from another computer signed in to your account.",
		"this computer still awaits approval from another device of the account",
	),
})

export const JoinWaitingSocketUrlFailed = meta.story({
	name: "Join waiting, address not received",
	...waitingForHostStory(
		"socketUrlFailed",
		"Couldn’t get this space’s address on Noa’s computer from Kiroshi. Quit Kiroshi and open it again.",
		"Kiroshi didn't give the address to connect to the space",
	),
})

export const JoinWaitingRosterMissing = meta.story({
	name: "Join waiting, member list missing",
	...waitingForHostStory(
		"rosterMissing",
		"This space’s member list hasn’t arrived from Noa yet. Ask them to open Kiroshi on their computer.",
		"the space key is held but no verified member list is",
	),
})

export const JoinWaitingKeychainReadFailed = meta.story({
	name: "Join waiting, secure storage unreadable",
	...waitingForHostStory(
		"keychainReadFailed",
		"Couldn’t read the key Noa sent for this space from this computer’s secure storage. Quit Kiroshi, open it again, and allow access if this computer asks.",
		"the space key couldn't be read from this computer's secure storage",
	),
})

const UnexpectedJoinNotice = () => {
	const { t } = useTranslation("chat")
	return (
		<Notice
			title={t("screen.notice.joinRefused.unexpected.title", JOINED_SPACE)}
			description={t("screen.notice.joinRefused.unexpected.description")}
		/>
	)
}

export const JoinUnexpected = meta.story({
	name: "Join failed, unexpected",
	render: () => <UnexpectedJoinNotice />,
	parameters: {
		docs: {
			description: {
				story:
					"The notice a joined space raises when opening it failed for a reason Kiroshi doesn't name. Check that the title names the space and that the description asks to try again.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText("Something went wrong with Studio"),
		).toBeVisible()
		await expect(
			canvas.getByText(
				"Kiroshi couldn’t finish the request. Try again in a moment.",
			),
		).toBeVisible()
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"Both tones side by side, a composition no screen assembles. `warning` is what the operator can close (something was refused, the turn went through), `error` is what failed to be read. Check that the two read as different at a glance in light and dark, and that neither rests on the icon colour alone.",
			},
		},
	},
	render: () => (
		<div className="flex flex-col gap-3">
			{CHAT_NOTICE_TONES.map((tone) => (
				<Notice
					key={tone}
					tone={tone}
					title={`Tone: ${tone}`}
					description="The same notice body rendered in each tone."
				/>
			))}
		</div>
	),
})
