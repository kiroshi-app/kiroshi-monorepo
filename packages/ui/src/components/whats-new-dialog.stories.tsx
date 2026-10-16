import { useEffect, useState } from "react"
import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	lineHeightOf,
	probedStyleOf,
	settled,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	HISTORY_DAYS,
	HISTORY_OLDEST_DATE,
} from "@workspace/ui/components/plugin-settings/history.fixtures"
import { BOT_SKILLS } from "@workspace/ui/components/plugin-settings/skills.fixtures"
import { GIT_CLIFF_BODY_0_24_2 } from "@workspace/ui/components/release-notes.fixtures"
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

const W1_NOTES = [
	"Search across conversations is faster.",
	"Renaming a companion no longer closes the app.",
]

const W2_NOTES = [
	"Secrets can be set for one space only.",
	"Removing an attachment no longer clears the draft.",
]

const W3_NOTES = [
	...W1_NOTES,
	"Routines can run on a schedule you pick from a calendar.",
	"Applications show when they need you to sign in again.",
	"History lists what each companion kept, newest first.",
	"Pinned messages stay at the top of a conversation, even after you scroll far back.",
	"Missions waiting on you move to the top of the list.",
	"Secrets can be set for one space only.",
	"Approvals show how long a companion has been waiting.",
	"Skills can be turned off without deleting them.",
	"Spaces list who joined them, newest first.",
	"Attachments keep their names when you send them.",
	"Conversations show when a companion is still writing.",
	"Missions link to the branch they're watching.",
	"Routines skip a run while the computer is asleep.",
	"Notifications open the conversation they came from.",
	"Applications ask before reading a new folder.",
	"The language setting applies without a restart.",
	"Long messages fold after twenty lines.",
]

const W4_NOTES = [
	"Approvals name the companion that's asking.",
	"Removing an attachment no longer clears the draft.",
]

const W5_NOTES = [
	"The sidebar remembers pinned conversations per space.",
	"Applications reconnect after the computer wakes.",
]

const bulletsOf = (notes: string[]) =>
	notes.map((note) => `- ${note}`).join("\n")

const RELEASE_NOTES_URL = "https://example.com/releases/0.24.0"

const FIRST_LAUNCH: WhatsNewDialogProps = {
	version: "0.24.0",
	visual: missionVisual(LIGHT_VIGNETTE),
	headline: "Missions show the branch they're watching",
	subline: "See where the work lands without asking the companion.",
	notes: bulletsOf(W1_NOTES),
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
					"W1. The first launch after an update, with a visual. Focus lands on the surface itself with no ring, and the first Tab reaches the corner close button. Check the band is 164px with the vignette full-bleed under the close button's backing, that the dialog is named by its headline and described by its subline, that Release notes hands back its URL and that Got it asks the host to close.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await dialogIn()
		const scope = within(dialog)

		await expect(document.activeElement).toBe(dialog)
		await expect(getComputedStyle(dialog).outlineStyle).toBe("none")
		await userEvent.tab()
		await expect(closeButtonIn(dialog)).toHaveFocus()

		await expect(dialog).toHaveAccessibleName(args.headline)
		await expect(dialog).toHaveAccessibleDescription(args.subline)
		const visual = scope.getByRole("img", { name: args.visual?.alt })
		await expect(visual.parentElement?.getBoundingClientRect().height).toBe(164)
		await expect(scope.getByText("New in 0.24.0")).toBeVisible()
		await expect(
			scope.getByRole("group", { name: "Also in this update" }),
		).toBeVisible()
		await expect(scope.queryByRole("region")).toBeNull()

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
		notes: bulletsOf(W2_NOTES),
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
	args: { notes: bulletsOf(W3_NOTES) },
	parameters: {
		docs: {
			description: {
				story:
					"W3. The eight notes the artboard draws come first, and the list runs on past them to more than twice the 236px box, the artboard showing only its top. The list scrolls inside its box with a fade at its bottom edge while the header and footer stay where they are, and the box takes keyboard focus so it scrolls without a pointer.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const box = slotIn(dialog, "whats-new-notes")
		const scope = within(dialog)
		const note = scope.getByText(W3_NOTES[0])
		const list = scope.getByRole("list")

		await waitFor(() =>
			expect(box.scrollHeight - box.clientHeight).toBeGreaterThan(
				lineHeightOf(note),
			),
		)
		await expect(box.clientHeight).toBe(236)
		await expect(list.offsetHeight).toBeGreaterThanOrEqual(2 * box.clientHeight)
		await expect(box).toHaveAttribute("tabindex", "0")
		await expect(
			scope.getByRole("region", { name: "Also in this update" }),
		).toBe(box)
		await expect(list).not.toHaveAccessibleName()
	},
})

export const LongContentDark = LongContent.extend({
	globals: { theme: "dark" },
	args: { visual: missionVisual(DARK_VIGNETTE) },
})

export const LongGitCliffNotes = meta.story({
	args: {
		version: "0.24.2",
		visual: undefined,
		headline: "What’s new in 0.24.2",
		subline: "",
		notes: GIT_CLIFF_BODY_0_24_2,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The real git-cliff body of 0.24.2, which opens on a heading, so the headline falls back to naming the version and no subline is drawn. Each `###` heading reads as a section label over its entries inside the scrolling list, each `**scope**` is bold, and no `#` or asterisk is left on screen.",
			},
		},
	},
	play: async () => {
		const dialog = await dialogIn()
		const box = slotIn(dialog, "whats-new-notes")
		const scope = within(box)
		const label = scope.getByRole("heading", { level: 3, name: "Features" })

		await expect(dialog).toHaveAccessibleName("What’s new in 0.24.2")
		await expect(dialog).not.toHaveAccessibleDescription()
		await expect(label).toBeVisible()
		await expect(label.nextElementSibling?.tagName).toBe("UL")
		await expect(getComputedStyle(label).fontWeight).toBe("500")
		const [scopeLabel] = scope.getAllByText("ui", { selector: "strong" })
		await expect(
			Number(getComputedStyle(scopeLabel).fontWeight),
		).toBeGreaterThanOrEqual(600)
		await expect(box.textContent).not.toMatch(/\*\*|#/)
		await waitFor(() =>
			expect(box.scrollHeight).toBeGreaterThan(box.clientHeight),
		)
		await expect(
			within(dialog).getByRole("region", { name: "Also in this update" }),
		).toBe(box)
	},
})

export const LongGitCliffNotesDark = LongGitCliffNotes.extend({
	globals: { theme: "dark" },
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
		notes: bulletsOf(W4_NOTES),
	},
	render: (args) => <OverUserSettings {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"W4. Opened from the About tab of the user settings, over that dialog and its 30% backdrop, with a lighter backdrop of its own at black 18% so the two stack rather than double. The eyebrow reads Version, the legend Also in this version, and the primary button Close.",
			},
		},
	},
	play: async ({ args }) => {
		const dialog = await settled(
			await screen.findByRole("dialog", { name: args.headline }),
		)
		const scope = within(dialog)

		const overlays = document.querySelectorAll("[data-slot=dialog-overlay]")
		await expect(overlays).toHaveLength(2)
		await expect(getComputedStyle(overlays[1]).backgroundColor).toBe(
			probedStyleOf("bg-black/18", "backgroundColor"),
		)
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
		notes: bulletsOf(W5_NOTES),
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
