import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	expectSoloAvatarInBothThemes,
	expectSubjectIconInBothThemes,
	pictureOf,
	slotIn,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { hueTone } from "@workspace/ui/components/hue-palette"
import type { RosterBot } from "@workspace/ui/components/roster"
import { schemeOf } from "@workspace/ui/hooks/use-color-scheme"

const KEEPER: RosterBot = {
	id: "bot_4f8c21",
	name: "Nest Keeper",
	blot: BLOT_HUES.blue,
}
const SCOUT: RosterBot = {
	id: "bot_9a2b40",
	name: "Twig Scout",
	blot: BLOT_HUES.orange,
}
const WARDEN: RosterBot = {
	id: "bot_1c7d55",
	name: "Shell Warden",
	blot: BLOT_HUES.green,
}

const SEATED = [KEEPER, SCOUT, WARDEN]

const meta = preview.meta({
	title: "Conversation/Message/ConversationEmptyState",
	component: ConversationEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What a conversation shows in place of its transcript while nothing has been said in it. Unlike the single-bot empty state, this room is already set up, every seated bot is here and the lead is ready to answer, so the surface has nothing to configure and no error to report: it names the room, shows its subject icon (or the face of its one companion), and points down to the composer. It owns its own copy and draws no header, roster or composer: mount it as the only child of the transcript region.",
			},
		},
	},
	args: {
		title: "Ship the December release",
		bots: SEATED,
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation just created with several companions: the room is seated and waiting on its first message. Check that the heading is the conversation's name, not a companion's, that the room's 56px subject icon sits above it in place of the companions' faces, that the count in the copy matches the room, and that the arrow hint is the only guidance so nothing competes with the composer below. Pick `SingleBot` for a room seated with one companion. `apps/app/src/components/thread-screen.tsx:504` seats it with every companion present in the conversation.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: "Ship the December release" }),
		).toBeVisible()
		await expect(
			slotIn(canvasElement, "conversation-subject-icon"),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await expect(canvas.getByText(/3 companions are ready/)).toBeVisible()
	},
})

export const SingleBot = meta.story({
	args: { bots: [KEEPER] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation seated with one companion only. Check that the copy turns singular rather than reading `1 companions`, and that the lone face still sits centered above the heading instead of drifting left. Pick `Default` for a room with several companions. `apps/app/src/components/thread-screen.tsx:504` passes the one companion present.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText(/1 companion is ready/)).toBeVisible()
	},
})

export const WithPicture = meta.story({
	args: {
		bots: [{ ...KEEPER, image: UPLOADED_AVATAR_IMAGE }],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the one seated companion carries an uploaded picture. Check that the picture fills the same 56px box the drawing would. Pick `SingleBot` when the companion wears its dithered field. The picture comes from the seated companion `apps/app/src/components/thread-screen.tsx:504` passes.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(await pictureOf(avatar)).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
	},
})

const SUGGESTED: RosterBot[] = [
	KEEPER,
	SCOUT,
	WARDEN,
	{ id: "bot_7e3f18", name: "Moss Reader", blot: BLOT_HUES.purple },
	{ id: "bot_2b9a06", name: "Pebble Clerk", blot: BLOT_HUES.pink },
]

const NOBODY_SEATED_WITH_SUGGESTIONS = {
	bots: [],
	suggestedBots: SUGGESTED,
	onSuggestedBotPress: fn(),
}

const NOBODY_TITLE = "Nobody is in this conversation yet"

const NOBODY_DESCRIPTION =
	"Type @ and pick a name. Whoever you mention joins, and they can bring in anyone else they need."

const LONG_NAMED_SUGGESTION: RosterBot = {
	id: "bot_6a0c58",
	name: "Keeper of the Lighthouse at the Far End of the Northern Harbour Wall",
	blot: BLOT_HUES.purple,
}

const PRESS_HEIGHT = 32

const suggestedPresses = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "conversation-suggested-bot")

const copyMeasureOf = (canvasElement: HTMLElement) => {
	const heading = canvasElement.querySelector("h2")

	if (!heading?.parentElement) throw new Error("The surface drew no copy")

	return heading.parentElement.getBoundingClientRect().width
}

const expectHeldToCopyMeasure = async (canvasElement: HTMLElement) => {
	const surface = slotIn(canvasElement, "conversation-empty-state")
	const suggestions = slotIn(canvasElement, "conversation-suggested-bots")
	const host = surface.parentElement as HTMLElement

	await expect(suggestions.getBoundingClientRect().width).toBeLessThanOrEqual(
		copyMeasureOf(canvasElement),
	)
	await expect(surface.getBoundingClientRect().width).toBe(
		host.getBoundingClientRect().width,
	)
	await expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth)
}

const SPACE_CHIP_SIDE = 16

const hexOfComputed = (colour: string) =>
	`#${(colour.match(/\d+/g) ?? [])
		.slice(0, 3)
		.map((channel) => Number(channel).toString(16).padStart(2, "0"))
		.join("")}`

export const InSpace = meta.story({
	args: { spaceName: "Northwind", spaceTint: BLOT_HUES.green },
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"An empty thread in the green Space Northwind, light beside dark. Check that a 16 px rounded square sits before the Space name, filled with the Space bubble tone and edged in 1 px of its accent, and that it reads as the Space colour in both themes. `apps/app/src/components/thread-screen.tsx` does not pass the Space yet.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const lines = slotsIn(canvasElement, "conversation-empty-space")
		await expect(lines).toHaveLength(2)
		for (const line of lines) {
			const chip = slotIn(line, "space-tint")
			const style = getComputedStyle(chip)
			const theme = schemeOf(chip)
			const box = chip.getBoundingClientRect()
			await expect(line).toHaveTextContent("Northwind")
			await expect(line.firstElementChild).toBe(chip)
			await expect([box.width, box.height]).toEqual([
				SPACE_CHIP_SIDE,
				SPACE_CHIP_SIDE,
			])
			await expect(style.borderTopLeftRadius).not.toBe("9999px")
			await expect(style.borderTopWidth).toBe("1px")
			await expect(hexOfComputed(style.backgroundColor)).toBe(
				hueTone(BLOT_HUES.green, theme, "bubble").hex,
			)
			await expect(hexOfComputed(style.borderTopColor)).toBe(
				hueTone(BLOT_HUES.green, theme, "accent").hex,
			)
		}
	},
})

export const Empty = meta.story({
	args: { bots: [] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation nobody is seated in and with nobody to suggest. Check that the @ mark, the title and the description replace the faces, the conversation name and the ready count, that no arrow hint is drawn, and that nothing follows the description. Pick `EmptyWithSuggestions` when companions can be pressed. `apps/app/src/components/thread-screen.tsx:506` passes no suggestion while `apps/app/src/lib/conversations/use-conversation-seating.ts:110` is still reading, or when it read nobody.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByRole("heading", { name: NOBODY_TITLE }),
		).toBeVisible()
		await expect(canvas.getByText(NOBODY_DESCRIPTION)).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await expect(
			canvas.queryByText("Message a companion to start."),
		).not.toBeInTheDocument()
		await expect(canvas.queryByText("Ship the December release")).toBeNull()
		await expect(canvas.queryByRole("button")).toBeNull()
		await expect(canvas.getByText(NOBODY_DESCRIPTION).parentElement).toBe(
			slotIn(canvasElement, "conversation-empty-state").lastElementChild,
		)
	},
})

export const EmptyWithSuggestions = meta.story({
	args: NOBODY_SEATED_WITH_SUGGESTIONS,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a conversation nobody is seated in, with the companions the person talks to most offered below the copy. Check that the label sits above one outline press per companion, that each press carries a face and a name, and that pressing one hands exactly that companion back once: the press writes a mention into the draft, it never invites. Pick `Empty` when there is nobody to suggest. `apps/app/src/lib/conversations/use-conversation-seating.ts:111` hands over the five companions this story shows, and `apps/app/src/components/thread-screen.tsx:505` writes the mention the press asks for.  ",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(canvas.getByText("The ones you talk to most")).toBeVisible()
		await expect(suggestedPresses(canvasElement)).toHaveLength(5)
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(5)
		await expect(
			canvas.queryByText("Message a companion to start."),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("button", { name: "Twig Scout" }))

		await expect(args.onSuggestedBotPress).toHaveBeenCalledTimes(1)
		await expect(args.onSuggestedBotPress).toHaveBeenCalledWith(SCOUT)
		await expectHeldToCopyMeasure(canvasElement)
	},
})

export const EmptyWithLongSuggestionName = meta.story({
	args: {
		...NOBODY_SEATED_WITH_SUGGESTIONS,
		suggestedBots: [LONG_NAMED_SUGGESTION, KEEPER],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when a suggested companion carries a name wider than the copy measure. Check that its press stays inside the measure on one line, that the name is shortened with an ellipsis rather than wrapped or overflowing, and that the full name still names the press for assistive technology. Pick `EmptyWithSuggestions` for nominal names. The names come straight from the store through `apps/app/src/lib/conversations/use-conversation-seating.ts:111`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const press = canvas.getByRole("button", {
			name: LONG_NAMED_SUGGESTION.name,
		})
		const name = press.lastElementChild as HTMLElement

		await expect(press.getBoundingClientRect().width).toBeLessThanOrEqual(
			copyMeasureOf(canvasElement),
		)
		await expect(press.getBoundingClientRect().height).toBe(PRESS_HEIGHT)
		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expectHeldToCopyMeasure(canvasElement)
	},
})

export const EmptyWithSuggestionsFocused = meta.story({
	args: NOBODY_SEATED_WITH_SUGGESTIONS,
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to check a suggested companion reached from the keyboard. Check that the first press takes focus on the first tab and draws a visible ring around its pill. Pick `EmptyWithSuggestions` for the pointer path. Same five suggestions as `apps/app/src/lib/conversations/use-conversation-seating.ts:111` hands over, reached from the keyboard.",
			},
		},
	},
	play: async ({ canvas }) => {
		const press = canvas.getByRole("button", { name: "Nest Keeper" })

		await userEvent.tab()

		await expect(press).toHaveFocus()
		await expect(press.matches(":focus-visible")).toBe(true)
		await expect(getComputedStyle(press).boxShadow).not.toBe("none")
	},
})

export const EmptyWithSuggestionsNarrow = meta.story({
	args: NOBODY_SEATED_WITH_SUGGESTIONS,
	decorators: [
		(Story) => (
			<div className="w-80" data-testid="narrow-frame">
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a narrow window, 320 pixels wide, where the five suggested companions cannot share one line. Check that the presses wrap onto further centered rows and that nothing scrolls sideways. Pick `EmptyWithSuggestions` for the nominal width. Same five suggestions as `apps/app/src/lib/conversations/use-conversation-seating.ts:111` hands over, in the narrowest window the app runs in.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const frame = canvas.getByTestId("narrow-frame")
		const rows = new Set(
			suggestedPresses(canvasElement).map(
				(press) => press.getBoundingClientRect().top,
			),
		)

		await expect(rows.size).toBeGreaterThan(1)
		await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth)
	},
})

export const LongContent = meta.story({
	args: {
		title:
			"Ship the December release, then plan the January retrospective with everyone involved",
		bots: [
			...SEATED,
			{ id: "bot_7e3f18", name: "Moss Reader", blot: BLOT_HUES.purple },
			{ id: "bot_2b9a06", name: "Pebble Clerk", blot: BLOT_HUES.pink },
			{ id: "bot_8d4c73", name: "Fern Guide", blot: BLOT_HUES.cyan },
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a long-named room seated with more companions than fit one line. Check that the heading wraps inside its measure instead of stretching the surface, and that the room still draws one 56px subject icon however many companions it seats. Pick `Default` for the nominal room. The title and the seating come from `apps/app/src/components/thread-screen.tsx:507` and `apps/app/src/components/thread-screen.tsx:504`, neither of which shortens anything.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotsIn(canvasElement, "conversation-subject-icon"),
		).toHaveLength(1)
	},
})

const THEMES_MARK_SIZE = 56

export const ThemesSolo = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { bots: [KEEPER] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a one-companion room in light and dark at once. Check that the companion's own 56px face stands above the heading in both themes, with no subject icon. Pick `ThemesGroup` for a room of several companions.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSoloAvatarInBothThemes(canvasElement, THEMES_MARK_SIZE),
})

export const ThemesGroup = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions with no colour picked, in light and dark at once. Check that one 56px subject icon stands above the heading on the neutral pair of each theme, the message square centred in it. Pick `ThemesGroupRed` for a room with a picked icon.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, THEMES_MARK_SIZE),
})

export const ThemesGroupRed = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { icon: "ShieldKey" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions that picked the shield key, in light and dark at once. Check that the 56px subject icon keeps the neutral pair of each theme, whatever colour the room carries, and shows the picked pictogram. Pick `ThemesGroup` for the default icon.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, THEMES_MARK_SIZE),
})

export const FreeHue = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: {
		icon: "ShieldKey",
		spaceName: "Northwind",
		spaceTint: 210,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A room in a Space at a hue outside the eight presets, 210, light beside dark. Check that the Space chip wears 210 rather than the nearest preset while the subject icon keeps the neutral pair of each theme. Pick `InSpace` for a preset hue.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectSubjectIconInBothThemes(canvasElement, THEMES_MARK_SIZE)
		for (const line of slotsIn(canvasElement, "conversation-empty-space")) {
			const chip = slotIn(line, "space-tint")
			await expect(hexOfComputed(getComputedStyle(chip).backgroundColor)).toBe(
				hueTone(210, schemeOf(chip), "bubble").hex,
			)
		}
	},
})
