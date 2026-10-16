import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import {
	AboutFields,
	type AboutFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/about-fields"

const MINUTE = 60_000

const AboutHost = (props: AboutFieldsProps) => {
	const [channel, setChannel] = useState(props.channel)
	const [showsWhatsNew, setShowsWhatsNew] = useState(props.showsWhatsNew)

	return (
		<AboutFields
			{...props}
			channel={channel}
			onChannelChange={(next) => {
				setChannel(next)
				props.onChannelChange(next)
			}}
			onShowsWhatsNewChange={(next) => {
				setShowsWhatsNew(next)
				props.onShowsWhatsNewChange(next)
			}}
			showsWhatsNew={showsWhatsNew}
		/>
	)
}

const lightPanelIn = (canvasElement: HTMLElement) => {
	const panels = slotsIn(canvasElement, "about-fields")
	expect(panels).toHaveLength(2)
	return within(panels[0])
}

const expectHeadline = async (
	canvasElement: HTMLElement,
	isEmphasized: boolean,
) => {
	const status = slotIn(canvasElement, "about-update-status")
	const headline = status.firstElementChild as HTMLElement
	const icon = headline.querySelector("svg") as SVGElement
	const { fontWeight, color } = getComputedStyle(headline)
	await expect(fontWeight).toBe(isEmphasized ? "500" : "400")
	await expect(color).toBe(getComputedStyle(isEmphasized ? icon : status).color)
	return { headline, icon }
}

const renderAbout = (args: AboutFieldsProps) => (
	<div className="w-[36rem]">
		<AboutHost {...args} />
	</div>
)

const UP_TO_DATE: AboutFieldsProps = {
	version: "0.23.3",
	channel: "stable",
	update: { status: "upToDate", checkedAt: Date.now() - 2 * MINUTE },
	showsWhatsNew: true,
	onChannelChange: fn(),
	onShowsWhatsNewChange: fn(),
	onCheck: fn(),
	onDownload: fn(),
	onRestart: fn(),
	onWhatsNew: fn(),
	onReleaseNotes: fn(),
}

const meta = preview.meta({
	title: "Settings/User/AboutFields",
	component: AboutFields,
	globals: { theme_layout: "side-by-side" },
	render: renderAbout,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The About tab of the user Settings: which Kiroshi this is, how it updates, and where to read what changed. The first row names the running version and, under it, one status line that says where the update stands, its icon and tone carrying the same news as its words. The action beside it is the one gesture that moves the update forward: check, download, restart, or download again. The release channel and the What's new switch sit under it, then the two links. It holds nothing and reads nothing: the host hands it the version, the channel and the update state, and every gesture goes back through its own callback. Every story draws light and dark side by side.",
			},
		},
	},
	args: UP_TO_DATE,
})

export const UpToDate = meta.story({
	loaders: [() => ({ checkedAt: Date.now() - 2 * MINUTE })],
	render: (args, { loaded }) =>
		renderAbout({
			...args,
			update: { status: "upToDate", checkedAt: loaded.checkedAt },
		}),
	parameters: {
		docs: {
			description: {
				story:
					"A1, nothing to fetch. Check the green check and the muted line naming when Kiroshi last looked, and that Check for updates is an outline button that calls `onCheck` once. The switch hands back its new value, What's new calls `onWhatsNew`, and Release notes says it opens outside the app. Pick `Checking` for the look in flight.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"Up to date · Checked 2 minutes ago",
		)
		await expectHeadline(canvasElement, false)
		await expect(panel.getByText("Kiroshi 0.23.3")).toBeVisible()

		await userEvent.click(
			panel.getByRole("button", { name: "Check for updates" }),
		)
		await expect(args.onCheck).toHaveBeenCalledOnce()

		await userEvent.click(
			panel.getByRole("switch", { name: "Show what’s new after an update" }),
		)
		await expect(args.onShowsWhatsNewChange).toHaveBeenCalledWith(false)

		await userEvent.click(
			panel.getByRole("button", { name: "What’s new in 0.23.3" }),
		)
		await expect(args.onWhatsNew).toHaveBeenCalledOnce()

		await userEvent.click(
			panel.getByRole("button", {
				name: "Release notes, opens in your browser",
			}),
		)
		await expect(args.onReleaseNotes).toHaveBeenCalledOnce()
	},
})

export const Checking = meta.story({
	args: { update: { status: "checking" } },
	parameters: {
		docs: {
			description: {
				story:
					"A2, the look in flight. Check the muted spinner, drawn still under reduced motion, and that Check for updates stays in place at half strength and refuses a press. Pick `UpdateAvailable` for what a found update looks like.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"Checking for updates…",
		)
		await expectHeadline(canvasElement, false)

		const check = panel.getByRole("button", { name: "Check for updates" })
		await expect(check).toBeDisabled()
		check.click()
		await expect(args.onCheck).not.toHaveBeenCalled()

		const spinner = slotIn(canvasElement, "about-update-status").querySelector(
			"svg",
		)
		await expect(spinner).not.toBeNull()
		await expect(getComputedStyle(spinner as SVGElement).animationName).toBe(
			"none",
		)
	},
})

export const UpdateAvailable = meta.story({
	args: { update: { status: "available", version: "0.24.0" } },
	parameters: {
		docs: {
			description: {
				story:
					"A3, a newer Kiroshi on the stable channel. Check the accent arrow and line, and that Download update is the primary button and calls `onDownload` once. Pick `Downloading` for the next step, `BetaAvailable` for the same news on the beta channel.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"Kiroshi 0.24.0 is available.",
		)
		await expectHeadline(canvasElement, true)

		await userEvent.click(
			panel.getByRole("button", { name: "Download update" }),
		)
		await expect(args.onDownload).toHaveBeenCalledOnce()
	},
})

export const Downloading = meta.story({
	args: { update: { status: "downloading", version: "0.24.0", progress: 42 } },
	parameters: {
		docs: {
			description: {
				story:
					"A4, the download under way. Check that the action gives way to a progress bar named by the status line, its percentage in tabular figures so it does not jitter as it climbs. Pick `ReadyToRestart` for the end of it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const panel = lightPanelIn(canvasElement)
		const progress = panel.getByRole("progressbar", {
			name: "Downloading 0.24.0. You can keep working meanwhile.",
		})
		await expect(progress).toHaveAttribute("aria-valuenow", "42")

		const { headline, icon } = await expectHeadline(canvasElement, false)
		await expect(getComputedStyle(icon).color).not.toBe(
			getComputedStyle(headline).color,
		)

		const percentage = within(progress).getByText("42%")
		await expect(getComputedStyle(percentage).fontVariantNumeric).toBe(
			"tabular-nums",
		)
		await expect(panel.queryByRole("button", { name: /update/ })).toBe(null)
	},
})

export const ReadyToRestart = meta.story({
	args: {
		update: { status: "ready", version: "0.24.0", runningCompanions: 0 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A5, downloaded and waiting for a restart. Check the accent refresh icon and that Restart now calls `onRestart` once. Pick `CompanionsStillRunning` for the restart held back.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"0.24.0 is ready. Restart Kiroshi to finish updating.",
		)
		await expectHeadline(canvasElement, true)

		await userEvent.click(panel.getByRole("button", { name: "Restart now" }))
		await expect(args.onRestart).toHaveBeenCalledOnce()
	},
})

export const CompanionsStillRunning = meta.story({
	args: {
		update: { status: "ready", version: "0.24.0", runningCompanions: 2 },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A6, ready while two companions still work. Check the second line, indented under the first, saying what to stop, and that Restart now stays at half strength and refuses a press. Pick `ReadyToRestart` for the restart allowed.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"0.24.0 is ready.2 companions are still running. Stop them to restart.",
		)
		await expectHeadline(canvasElement, true)

		const restart = panel.getByRole("button", { name: "Restart now" })
		await expect(restart).toBeDisabled()
		restart.click()
		await expect(args.onRestart).not.toHaveBeenCalled()
	},
})

export const DownloadFailed = meta.story({
	args: { update: { status: "failed", version: "0.24.0" } },
	parameters: {
		a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
		docs: {
			description: {
				story:
					"A7, the download broke off. Check the destructive triangle and line, the muted hint saying how to fix it, and that Download again calls `onDownload` once. Pick `UpdateAvailable` for the first try.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"Couldn’t download 0.24.0.Check your connection, then download it again.",
		)
		await expectHeadline(canvasElement, true)

		const [light, dark] = slotsIn(canvasElement, "about-fields").map((theme) =>
			within(theme).getByRole("button", { name: "Download again" }),
		)
		await expect(getComputedStyle(light).backgroundColor).toMatch(/0\.1\)$/)
		await expect(getComputedStyle(dark).backgroundColor).toMatch(/0\.14\)$/)

		await userEvent.click(light)
		await expect(args.onDownload).toHaveBeenCalledOnce()
	},
})

export const BetaAvailable = meta.story({
	args: {
		channel: "beta",
		update: { status: "available", version: "0.25.0-beta.1" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A8, a beta build on the beta channel. Check that Beta reads as the chosen segment, that the notice under the rows says what staying on beta costs, and that picking Stable calls `onChannelChange` with `stable` and takes the notice away. Pick `UpdateAvailable` for the stable channel.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const panel = lightPanelIn(canvasElement)
		await expect(panel.getByRole("status")).toHaveTextContent(
			"Kiroshi 0.25.0-beta.1 is available.",
		)
		await expectHeadline(canvasElement, true)

		const channel = panel.getByRole("radiogroup", { name: "Release channel" })
		await expect(
			within(channel).getByRole("radio", { name: "Beta" }),
		).toBeChecked()
		await expect(panel.getByText("Beta builds are tested less")).toBeVisible()

		await userEvent.click(
			within(channel).getByRole("radio", { name: "Stable" }),
		)
		await expect(args.onChannelChange).toHaveBeenCalledWith("stable")
		await expect(panel.queryByText("Beta builds are tested less")).toBe(null)
	},
})
