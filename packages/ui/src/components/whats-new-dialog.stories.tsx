import { useEffect, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { lineHeightOf, settled, slotIn } from "@workspace/storybook/story-utils"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import { UserSettingsDialog } from "@workspace/ui/components/user-settings-dialog"
import {
	WhatsNewDialog,
	type WhatsNewDialogProps,
	type WhatsNewDialogVisual,
} from "@workspace/ui/components/whats-new-dialog"

type VignettePalette = {
	card: string
	cardBorder: string
	chip: string
	text: string
	muted: string
}

type Vignette = {
	hexagon: string
	title: string
	chip: string
	chipWidth: number
	chipGlyph: string
	status: string
}

const LIGHT_VIGNETTE: VignettePalette = {
	card: "#ffffff",
	cardBorder: "#e5e5e5",
	chip: "#f2f2f2",
	text: "#0a0a0a",
	muted: "#6b6b6b",
}

const DARK_VIGNETTE: VignettePalette = {
	card: "#121213",
	cardBorder: "#212224",
	chip: "#262626",
	text: "#f5f5f5",
	muted: "#a3a3a3",
}

const BRANCH_GLYPH =
	'<circle cx="3" cy="3" r="1.75"/><circle cx="3" cy="11" r="1.75"/><circle cx="11" cy="4.5" r="1.75"/><path d="M3 4.75v4.5M11 6.25c0 2.5-2 3-6.25 4"/>'

const CALENDAR_GLYPH =
	'<rect x="1.5" y="2.5" width="11" height="10" rx="2"/><path d="M1.5 6h11M4.5 1v3M9.5 1v3"/>'

const MISSION_VIGNETTE: Vignette = {
	hexagon: "#A0BEE8",
	title: "Ship the onboarding copy",
	chip: "feature/onboarding-copy",
	chipWidth: 200,
	chipGlyph: BRANCH_GLYPH,
	status: "Watching · checks passed",
}

const ROUTINE_VIGNETTE: Vignette = {
	hexagon: "#AFC99B",
	title: "Morning digest",
	chip: "Mon-Fri · 8:00",
	chipWidth: 136,
	chipGlyph: CALENDAR_GLYPH,
	status: "Next run tomorrow",
}

const vignetteOf = (vignette: Vignette, palette: VignettePalette) => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="164" viewBox="0 0 560 164" font-family="Geist, ui-sans-serif, system-ui, sans-serif">
<path d="M56.5 46.5a14 14 0 0 1 14-14h419a14 14 0 0 1 14 14V172h-447Z" fill="${palette.card}" stroke="${palette.cardBorder}"/>
<polygon points="86,48 96.4,54 96.4,66 86,72 75.6,66 75.6,54" fill="${vignette.hexagon}"/>
<text x="108" y="65" font-size="14" font-weight="600" fill="${palette.text}">${vignette.title}</text>
<rect x="74" y="82" width="${vignette.chipWidth}" height="20" rx="10" fill="${palette.chip}"/>
<g transform="translate(82 85)" fill="none" stroke="${palette.muted}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${vignette.chipGlyph}</g>
<text x="100" y="96" font-size="12" font-family="Geist Mono, ui-monospace, monospace" fill="${palette.text}">${vignette.chip}</text>
<text x="${74 + vignette.chipWidth + 10}" y="96" font-size="12" fill="${palette.muted}">${vignette.status}</text>
</svg>`

	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const missionVisual = (palette: VignettePalette): WhatsNewDialogVisual => ({
	src: vignetteOf(MISSION_VIGNETTE, palette),
	alt: "A mission card naming the branch it watches",
})

const routineVisual = (palette: VignettePalette): WhatsNewDialogVisual => ({
	src: vignetteOf(ROUTINE_VIGNETTE, palette),
	alt: "A routine card running on weekdays",
})

const NOTES = [
	"The sidebar remembers how wide you left it.",
	"Copying a message keeps its code blocks intact.",
	"Conversations open faster on a slow connection.",
]

const LONG_NOTES = [
	...NOTES,
	"Search finds a companion by any word of its name, so a companion called Release manager answers to manager too.",
	"Notifications name the mission they're about, and opening one lands you on the message that raised it rather than at the top.",
	"Settings reopen on the tab you used last.",
	"A branch name too long for its card now wraps onto a second line instead of running past the edge of the card.",
	"Approvals you already answered on another device close here on their own, without a second click.",
]

const RELEASE_NOTES_URL = "https://example.com/releases/0.24.0"

const FIRST_LAUNCH: WhatsNewDialogProps = {
	version: "0.24.0",
	visual: missionVisual(LIGHT_VIGNETTE),
	headline: "Missions show the branch they're watching",
	subline: "See where the work lands without asking the companion.",
	notes: NOTES,
	releaseNotesUrl: RELEASE_NOTES_URL,
	variant: "first-launch",
	channel: "stable",
	open: true,
	onOpenChange: fn(),
	onOpenReleaseNotes: fn(),
}

const dialogIn = async () => settled(await screen.findByRole("dialog"))

const closeButtonIn = (dialog: HTMLElement) => slotIn(dialog, "whats-new-close")

const meta = preview.meta({
	title: "Overlays/WhatsNewDialog",
	component: WhatsNewDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"What a release changed, told once. It opens on the first launch after an update, or from the About tab when a reader asks for it, and it is fully controlled: the host owns `open` and decides when it shows. An optional visual fills a 164px band above the body; without one the body starts at the top and nothing else moves. The eyebrow names the version, a Beta chip follows it on the beta channel, the headline names the dialog and the subline describes it. Extra notes sit under a legend and scroll inside a 236px box with a fade at its bottom edge once they outgrow it, the header and footer staying put. Release notes hands its URL back to the host, which opens the browser.",
			},
		},
	},
	args: FIRST_LAUNCH,
})

export const FirstLaunch = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"W1. The first launch after an update, with a visual. Check the band is 164px with the vignette full-bleed under the close button's backing, that the dialog is named by its headline and described by its subline, that Release notes hands back its URL and that Got it asks the host to close.",
			},
		},
	},
	play: async ({ args }) => {
		const dialog = await dialogIn()
		const scope = within(dialog)

		await expect(dialog).toHaveAccessibleName(args.headline)
		await expect(dialog).toHaveAccessibleDescription(args.subline)
		const visual = scope.getByRole("img", { name: args.visual?.alt })
		await expect(visual.parentElement?.getBoundingClientRect().height).toBe(164)
		await expect(scope.getByText("New in 0.24.0")).toBeVisible()
		await expect(scope.getByText("Also in this update")).toBeVisible()

		await scope.getByRole("button", { name: "Release notes" }).click()
		await expect(args.onOpenReleaseNotes).toHaveBeenCalledWith(
			RELEASE_NOTES_URL,
		)

		await scope.getByRole("button", { name: "Got it" }).click()
		await expect(args.onOpenChange).toHaveBeenCalledWith(
			false,
			expect.anything(),
		)
	},
})

export const FirstLaunchDark = FirstLaunch.extend({
	globals: { theme: "dark" },
	args: { visual: missionVisual(DARK_VIGNETTE) },
})

export const WithoutAVisual = meta.story({
	args: {
		version: "0.24.1",
		visual: undefined,
		headline: "Approvals name the companion that's asking",
		subline: "Know who wants what before you answer.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"W2. A release with nothing to picture. No band is drawn: the body starts at the top, and the close button loses its backing since there is nothing under it to read against. Check the close button asks the host to close.",
			},
		},
	},
	play: async ({ args }) => {
		const dialog = await dialogIn()

		await expect(within(dialog).queryByRole("img")).toBeNull()
		await closeButtonIn(dialog).click()
		await expect(args.onOpenChange).toHaveBeenCalledWith(
			false,
			expect.anything(),
		)
	},
})

export const WithoutAVisualDark = WithoutAVisual.extend({
	globals: { theme: "dark" },
})

export const LongContent = meta.story({
	args: { notes: LONG_NOTES },
	parameters: {
		docs: {
			description: {
				story:
					"W3. Eight notes, several of them wrapping, more than the 236px list box holds. The list scrolls inside its box with a fade at its bottom edge while the header and footer stay where they are, and the box takes keyboard focus so it scrolls without a pointer.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const box = slotIn(dialog, "whats-new-notes")
		const note = within(dialog).getByText(LONG_NOTES[0])

		await waitFor(() =>
			expect(box.scrollHeight - box.clientHeight).toBeGreaterThan(
				lineHeightOf(note),
			),
		)
		await expect(box).toHaveAttribute("tabindex", "0")
	},
})

export const LongContentDark = LongContent.extend({
	globals: { theme: "dark" },
	args: { visual: missionVisual(DARK_VIGNETTE) },
})

const OverUserSettings = ({ open, ...props }: WhatsNewDialogProps) => {
	const [isSettingsUp, setIsSettingsUp] = useState(false)
	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsSettingsUp(true))
		return () => cancelAnimationFrame(frame)
	}, [])

	return (
		<>
			<UserSettingsDialog
				history={{
					days: HISTORY_DAYS,
					oldestDate: HISTORY_OLDEST_DATE,
					onUndo: fn(),
				}}
				language={null}
				onClose={fn()}
				onLanguageChange={fn()}
				onSkillChange={fn()}
				onSkillCreate={fn()}
				onSkillDelete={fn()}
				onSkillPreloadedChange={fn()}
				onValueChange={fn()}
				open
				skills={BOT_SKILLS}
				value={{ name: "Ada Martin", colorScheme: "system" }}
			/>
			<WhatsNewDialog {...props} open={open && isSettingsUp} />
		</>
	)
}

export const FromAbout = meta.story({
	args: {
		version: "0.23.3",
		visual: undefined,
		variant: "from-about",
		headline: "Conversations reopen where you left off",
		subline: "Come back to one and you land on the last message you read.",
	},
	render: (args) => <OverUserSettings {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"W4. Opened from the About tab of the user settings, over that dialog and its own dimmed overlay. The eyebrow reads Version, the legend Also in this version, and the primary button Close.",
			},
		},
	},
	play: async ({ args }) => {
		const dialog = await settled(
			await screen.findByRole("dialog", { name: args.headline }),
		)
		const scope = within(dialog)

		await expect(
			document.querySelectorAll("[data-slot=dialog-overlay]"),
		).toHaveLength(2)
		await expect(scope.getByText("Version 0.23.3")).toBeVisible()
		await expect(scope.getByText("Also in this version")).toBeVisible()

		await scope.getByText("Close", { selector: "button" }).click()
		await expect(args.onOpenChange).toHaveBeenCalledWith(
			false,
			expect.anything(),
		)
	},
})

export const FromAboutDark = FromAbout.extend({
	globals: { theme: "dark" },
})

export const BetaChannel = meta.story({
	args: {
		version: "0.25.0-beta.1",
		visual: routineVisual(LIGHT_VIGNETTE),
		channel: "beta",
		headline: "Routines can run on a weekday schedule",
		subline:
			"Pick the days, and the companion runs it at the same time on each one.",
	},
	parameters: {
		docs: {
			description: {
				story:
					"W5. A beta build. A Beta chip follows the version line, on the secondary surface so it reads as a label rather than a button.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const version = within(dialog).getByText("New in 0.25.0-beta.1")

		await expect(version.nextElementSibling).toHaveTextContent("Beta")
	},
})

export const BetaChannelDark = BetaChannel.extend({
	globals: { theme: "dark" },
	args: { visual: routineVisual(DARK_VIGNETTE) },
})
