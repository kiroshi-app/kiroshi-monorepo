import { expect, fn, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	A11Y_FLOATING_FOCUS_GUARDS,
	listExhaustively,
	opaque,
	probedStyleOf,
	settled,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { GIT_CLIFF_BODY_0_24_2 } from "@workspace/ui/components/release-notes.fixtures"
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

const RELEASE_NOTES_URL = "https://example.com/releases/0.4.0"

const RELEASE_NOTES_LABEL = "Read the full release notes in your browser"

const RELEASE_NOTE_LINES = [
	"Companions keep their transcript when the window is reopened.",
	"Faster first paint on the workspace shell.",
	"Fixes a crash when a tool result arrived after a stop.",
]

const RELEASE_NOTES = RELEASE_NOTE_LINES.map((line) => `- ${line}`).join("\n")

const WINDOW_VIEWPORT = {
	window: { name: "Window", styles: { width: "1000px", height: "700px" } },
}

const isInsideViewport = ({ top, bottom }: DOMRect) =>
	top >= 0 && bottom <= window.innerHeight

const meta = preview.meta({
	title: "Feedback/UpdateBadge",
	component: UpdateBadge,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The sidebar pastille for the auto-updater, driven by props alone — it never polls, never touches the host, and holds no timer. One tap starts the download, the ring reports it, and the panel opens itself exactly once when the bytes have landed. Postponing is final: the panel never reopens on its own, only a deliberate tap on the badge brings it back. Restarting is refused while a companion is still running, because a restart would kill the run.",
			},
		},
	},
	args: {
		status: "available",
		version: VERSION,
		releaseNotes: RELEASE_NOTES,
		onDownload: fn(),
		onRestart: fn(),
		onPostpone: fn(),
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
					"Reach for this the moment a release is found and nothing has been fetched yet: a circular button with an up arrow, the only affordance the reader gets. Check that a tap calls `onDownload` straight away — there is no confirmation step and no panel here, the panel is reserved for the end of the download. Pick `Loading` for what the same badge becomes one tap later.",
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
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Reach for this for the one moment the badge speaks first: the bytes have landed, the glyph became a restart, and the panel opened by itself. Check that the version and the release notes are both there, that `Restart now` is live, and that `Later` closes the panel for good — it will not reopen on its own afterwards. Pick `WithActiveBots` for the same panel when a restart would cost a running companion.",
			},
		},
	},
	play: async ({ canvas, canvasElement, args, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		await expect(
			canvas.getByRole("button", { name: "Restart to update" }),
		).toHaveAttribute("aria-expanded", "true")

		const panel = await opaque(await body.findByRole("dialog"))

		await expect(within(panel).getByText(`Version ${VERSION}`)).toBeVisible()
		await expect(within(panel).getByText(RELEASE_NOTE_LINES[0])).toBeVisible()
		await expect(
			body.queryByRole("link", { name: RELEASE_NOTES_LABEL }),
		).toBeNull()
		await userEvent.click(
			await body.findByRole("button", { name: "Remind me later" }),
		)
		await expect(args.onPostpone).toHaveBeenCalledTimes(1)
		await expect(
			canvas.getByRole("button", { name: "Restart to update" }),
		).toHaveAttribute("aria-expanded", "false")
	},
})

export const WithActiveBots = meta.story({
	args: { status: "ready", activeBotCount: 2 },
	parameters: {
		a11y: {
			config: {
				rules: [
					...A11Y_FLOATING_FOCUS_GUARDS.config.rules,
					...A11Y_CONTRAST_AWAITING_DESIGN_DECISION.config.rules,
				],
			},
		},
		docs: {
			description: {
				story:
					"Reach for this when the update is ready but two companions are mid-run: restarting would kill both, so the action is refused rather than hidden. Check that `Restart now` is disabled, that the count is spelled out instead of left to a badge, and that `Later` still works — the reader must always be able to dismiss. Pick `Ready` for the same panel with nothing running.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const panel = await opaque(await body.findByRole("dialog"))

		await expect(
			within(panel).getByRole("button", { name: "Restart now" }),
		).toBeDisabled()
		await expect(
			within(panel).getByText(
				"2 companions are still running. Stop them to restart.",
			),
		).toBeVisible()
	},
})

export const WithReleaseNotes = meta.story({
	args: { status: "ready", releaseNotesUrl: RELEASE_NOTES_URL },
	parameters: {
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Reach for this when the panel's three lines are a summary and the whole changelog lives on the web: a quiet icon at the trailing edge of the row opens it. Check that `Restart now` is still the one action the eye lands on, that the link names itself and says it leaves the window — no visible text carries that — and that it opens in a new tab rather than replacing the app. Pick `Ready` for the same panel when no address was handed down and the summary is all there is.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const link = await body.findByRole("link", { name: RELEASE_NOTES_LABEL })
		await expect(link).toHaveAttribute("href", RELEASE_NOTES_URL)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(link).toHaveAttribute("rel", "noreferrer noopener")
		await expect(
			body.getByRole("button", { name: "Restart now" }),
		).toBeEnabled()
	},
})

export const LongGitCliffNotes = meta.story({
	args: {
		status: "ready",
		version: "0.24.2",
		releaseNotes: GIT_CLIFF_BODY_0_24_2,
	},
	globals: { viewport: { value: "window" } },
	render: (args) => (
		<div className="flex h-dvh items-end p-3">
			<UpdateBadge {...args} />
		</div>
	),
	parameters: {
		layout: "fullscreen",
		viewport: { options: WINDOW_VIEWPORT },
		a11y: A11Y_FLOATING_FOCUS_GUARDS,
		docs: {
			description: {
				story:
					"Reach for this when the release notes are the real git-cliff body of 0.24.2, far taller than a 700px window, with the badge at the bottom of the rail. Check that the panel stays inside the window, that only the notes scroll while the title, version and buttons hold still, that each `###` heading reads as a section label over its entries, that every `**scope**` is bold with no asterisk left, and that `Restart now` stays on screen and clickable. Pick `Ready` for a summary short enough to read whole.",
			},
		},
	},
	play: async ({ canvasElement, args, userEvent }) => {
		const body = within(canvasElement.ownerDocument.body)
		const panel = await settled(await body.findByRole("dialog"))
		const notes = await body.findByRole("region", { name: "Release notes" })
		const restart = within(panel).getByRole("button", { name: "Restart now" })

		await expect(window.innerHeight).toBe(700)
		await waitFor(() =>
			expect(isInsideViewport(panel.getBoundingClientRect())).toBe(true),
		)
		await expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
			window.innerHeight,
		)
		await waitFor(() =>
			expect(notes.scrollHeight).toBeGreaterThan(notes.clientHeight),
		)
		await expect(panel.contains(notes)).toBe(true)
		await expect(notes).toHaveAttribute("tabindex", "0")
		await expect(within(panel).getByText("Update ready")).toBeVisible()
		await expect(within(panel).getByText("Version 0.24.2")).toBeVisible()
		await expect(
			within(notes).getByRole("heading", { level: 3, name: "Features" }),
		).toBeVisible()
		await expect(
			within(notes).getAllByText("ui", { selector: "strong" }).length,
		).toBeGreaterThan(0)
		await expect(notes.textContent).not.toMatch(/\*\*|#/)
		await expect(within(notes).queryByRole("link")).toBeNull()
		const [entry, nextEntry] = within(notes).getAllByRole("listitem")
		await expect(getComputedStyle(entry).lineHeight).toBe(
			probedStyleOf("text-xs", "lineHeight"),
		)
		await expect(
			nextEntry.getBoundingClientRect().top -
				entry.getBoundingClientRect().bottom,
		).toBeCloseTo(Number.parseFloat(probedStyleOf("gap-1", "rowGap")), 1)

		const restartTop = restart.getBoundingClientRect().top
		notes.scrollTop = notes.scrollHeight
		await expect(notes.scrollTop).toBeGreaterThan(0)
		await expect(restart.getBoundingClientRect().top).toBe(restartTop)
		await expect(isInsideViewport(restart.getBoundingClientRect())).toBe(true)
		await userEvent.click(restart)
		await expect(args.onRestart).toHaveBeenCalledTimes(1)
	},
})

export const LongGitCliffNotesDark = LongGitCliffNotes.extend({
	globals: { theme: "dark" },
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
