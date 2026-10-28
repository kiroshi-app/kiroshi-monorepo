import { expect, fn, screen } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { listExhaustively, slotsIn } from "@workspace/storybook/story-utils"
import {
	UpdateBadge,
	type UpdateBadgeStatus,
} from "@workspace/ui/components/update-badge"

const UPDATE_BADGE_STATUSES = listExhaustively<UpdateBadgeStatus>({
	idle: true,
	available: true,
	downloading: true,
	ready: true,
	error: true,
})

const VERSION = "0.4.0"

const RESTART_LABEL = `Restart to update to ${VERSION}`

const BUSY_LABEL = "2 agents are still running. Stop them to restart."

const meta = preview.meta({
	title: "Feedback/UpdateBadge",
	component: UpdateBadge,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The sidebar pastille for the auto-updater, driven by props alone: it never polls, never touches the host, and holds no timer. One tap starts the download, the ring reports it, and once the bytes have landed the badge becomes a single restart control with no panel. Restarting is refused while a companion is still running, because a restart would kill the run. The release notes live in the What's new dialog shown on the first launch of the new version.",
			},
		},
	},
	args: {
		status: "available",
		version: VERSION,
		onDownload: fn(),
		onRestart: fn(),
	},
	argTypes: {
		status: { control: "inline-radio", options: UPDATE_BADGE_STATUSES },
		progress: { control: { type: "range", min: 0, max: 100, step: 1 } },
	},
})

export const Empty = meta.story({
	args: { status: "idle" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the state the app spends almost all its life in: the updater answered, and the running build is the latest one. Check that nothing at all is painted — no placeholder, no reserved slot, no dot — so the sidebar's bottom edge is identical to a build with no updater. Pick `Default` for the first frame after a release is found.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(slotsIn(canvasElement, "update-badge")).toHaveLength(0)
	},
})

export const Default = meta.story({
	args: { status: "available" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this the moment a release is found and nothing has been fetched yet: a circular button with an up arrow, the only affordance the reader gets. Check that a tap calls `onDownload` straight away: there is no confirmation step and no panel. Pick `Loading` for what the same badge becomes one tap later.",
			},
		},
	},
	play: async ({ canvas, args, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Download update" }),
		)
		await expect(args.onDownload).toHaveBeenCalledTimes(1)
	},
})

export const Loading = meta.story({
	args: { status: "downloading", progress: 42 },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the release is coming down: the arrow stays put and the share already on disk closes as an arc around it. Check that the button is inert — a second tap must not queue a second download — and that the badge keeps the exact footprint it had in `Default`, so the sidebar does not shift when the ring appears. Pick `Error` for a download that stopped short.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"42",
		)
		await expect(
			canvas.getByRole("button", { name: "Downloading update" }),
		).toBeDisabled()
	},
})

export const Ready = meta.story({
	args: { status: "ready" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the bytes have landed: the glyph became a restart and the badge is the whole affordance, with no panel, popover or dialog. Check that hovering or focusing it names the action and the version in a tooltip, that the spoken name is that same text, and that one click calls `onRestart` once. Pick `ReadyWithAgentsRunning` for the same control when a restart would cost a running companion.",
			},
		},
	},
	play: async ({ canvas, args, userEvent }) => {
		const restart = canvas.getByRole("button", { name: RESTART_LABEL })

		await userEvent.tab()
		await expect(restart).toHaveFocus()
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			RESTART_LABEL,
		)

		await userEvent.click(restart)
		await expect(args.onRestart).toHaveBeenCalledTimes(1)
		await expect(screen.queryByRole("dialog")).toBeNull()
	},
})

export const ReadyWithAgentsRunning = meta.story({
	args: { status: "ready", activeBotCount: 2 },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the update is ready but two companions are mid-run: restarting would kill both, so the control stays in reach yet refuses the click. Check that it still takes keyboard focus, that its tooltip and spoken name spell out the running count and how to unblock it, and that a click calls nothing. Pick `Ready` for the same control with nothing running.",
			},
		},
	},
	play: async ({ canvas, args, userEvent }) => {
		const restart = canvas.getByRole("button", { name: BUSY_LABEL })

		await userEvent.tab()
		await expect(restart).toHaveFocus()
		await expect(restart).toHaveAttribute("aria-disabled", "true")

		await userEvent.hover(restart)
		await expect(await screen.findByRole("tooltip")).toHaveTextContent(
			BUSY_LABEL,
		)
		await userEvent.click(restart)
		await expect(args.onRestart).not.toHaveBeenCalled()
	},
})

export const Error = meta.story({
	args: { status: "error" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the download stopped short — offline, disk full, a signature that did not check out. Check that the badge turns destructive and offers a single resume action rather than a dead end, and that tapping it calls `onDownload` again from the top. Pick `Loading` for the run that this one is retrying.",
			},
		},
	},
	play: async ({ canvas, args, userEvent }) => {
		await userEvent.click(
			canvas.getByRole("button", { name: "Download the update again" }),
		)
		await expect(args.onDownload).toHaveBeenCalledTimes(1)
	},
})
