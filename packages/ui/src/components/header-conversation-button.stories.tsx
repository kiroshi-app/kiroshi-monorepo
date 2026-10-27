import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSoloAvatarInBothThemes,
	expectSubjectIconInBothThemes,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import type { RosterBot } from "@workspace/ui/components/roster"

const NEST: RosterBot = { id: "nest", name: "Nest", blot: BLOT_HUES.blue }

const BOTS: RosterBot[] = [
	NEST,
	{ id: "atlas", name: "Atlas", blot: BLOT_HUES.green },
]

const CROWD: RosterBot[] = [
	...BOTS,
	{ id: "pike", name: "Pike", blot: BLOT_HUES.orange },
	{ id: "wren", name: "Wren", blot: BLOT_HUES.purple },
	{ id: "otto", name: "Otto", blot: BLOT_HUES.pink },
]

const CELL_SIDE = 24

const LONG_NAME =
	"Migration of the legacy billing workspace and every archive it still answers for"

const meta = preview.meta({
	title: "Navigation/HeaderConversationButton",
	component: HeaderConversationButton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The leading control of a conversation header: the room's subject icon (or the face of its one companion), the name of the conversation, and the way into its settings, in one ghost button. It wears the same height and padding as `HeaderIdentityButton`, so a room and a one-to-one chat sit their identity at exactly the same place. Reach for it in an app header; a single companion's chat takes `HeaderIdentityButton` instead.",
			},
		},
	},
	args: {
		name: "Billing migration",
		bots: BOTS,
		onOpenSettings: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal room header: two companions seated, a short name, the settings closed. Check that the 24px subject icon, name and settings glyph read left to right on one row, that the whole thing is a single tab stop, and that activating it asks for the conversation settings. Pick `InLayout` to see it in the header it belongs to. The app assembles it at `apps/app/src/components/thread-screen.tsx:348`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		const button = canvas.getByRole("button", {
			name: "Billing migration · conversation settings",
		})
		const icon = slotIn(button, "conversation-subject-icon")

		await expect(icon.getBoundingClientRect().width).toBe(CELL_SIDE)
		await expect(slotsIn(canvasElement, "bot-identity-avatar")).toHaveLength(0)

		await expect(button).toHaveAttribute("aria-expanded", "false")
		await userEvent.click(button)
		await expect(args.onOpenSettings).toHaveBeenCalled()
	},
})

export const Expanded = meta.story({
	args: { isSettingsOpen: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the conversation settings are open: the button is the trigger that stays lit under its own panel. Check that the ghost surface holds the expanded tint and that assistive tech reads it as expanded. Pick `Default` for the closed state. The app assembles it at `apps/app/src/components/thread-screen.tsx:348`.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button")).toHaveAttribute(
			"aria-expanded",
			"true",
		)
	},
})

export const Crowded = meta.story({
	args: { bots: CROWD },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the room is full. Check that the room still draws one 24px subject icon, so the leading slot never widens with the room and it is the name that gives up room as the row fills. Pick `Default` for the usual pair. The app assembles it at `apps/app/src/components/thread-screen.tsx:348`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button")

		await expect(slotsIn(button, "conversation-subject-icon")).toHaveLength(1)
		await expect(
			slotIn(button, "conversation-subject-icon").getBoundingClientRect().width,
		).toBe(CELL_SIDE)
	},
})

export const SingleBot = meta.story({
	args: { bots: [NEST] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a room where one companion is left seated. Check that it still reads as a conversation — the name is the room's, not the companion's, and the settings glyph opens the room. Pick `HeaderIdentityButton` for a true one-to-one chat, which also carries the connection mark. The app assembles it at `apps/app/src/components/thread-screen.tsx:348`.",
			},
		},
	},
})

export const ThemesSolo = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { bots: [NEST] },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a one-companion room in light and dark at once. Check that the companion's own 24px face leads the button in both themes, with no subject icon. Pick `ThemesGroup` for a room of several companions.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSoloAvatarInBothThemes(canvasElement, CELL_SIDE),
})

export const ThemesGroup = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions with no colour picked, in light and dark at once. Check that a 24px subject icon on the neutral pair of each theme leads the button, the message square centred in it. Pick `ThemesGroupRed` for a coloured room.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, undefined, CELL_SIDE),
})

export const ThemesGroupRed = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { color: BLOT_HUES.red, icon: "ShieldKey" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions coloured red, in light and dark at once. Check that the 24px subject icon wears the red pair of each theme and the picked pictogram. Pick `ThemesGroup` for a room with no colour.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, BLOT_HUES.red, CELL_SIDE),
})

export const LongContent = meta.story({
	globals: { viewport: { value: "mobile" } },
	args: { name: LONG_NAME },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Reach for this when a conversation is named in a sentence and the window is narrow. Check that the name clips with an ellipsis while the subject icon and the settings glyph stay fully in view: the name is what gives up room, never the header's width. Pick `Default` for a name that fits. The app assembles it at `apps/app/src/components/thread-screen.tsx:348`.",
			},
		},
	},
	render: (args) => (
		<AppHeader leading={<HeaderConversationButton {...args} />} />
	),
	play: async ({ canvas }) => {
		const name = canvas.getByText(LONG_NAME)

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(canvas.getByRole("button")).toBeVisible()
	},
})

export const InLayout = meta.story({
	tags: ["test-only"],
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Reach for this to check the button in the header it ships in, with an empty trailing slot. Check that it lands at the very same height, offset and padding as `HeaderIdentityButton` does in the companion chat: a 48px header, a 36px button, six pixels in from the leading edge. Pick `Default` to inspect the button alone.",
			},
		},
	},
	render: (args) => (
		<AppHeader leading={<HeaderConversationButton {...args} />} />
	),
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner").getBoundingClientRect()
		const button = canvas.getByRole("button").getBoundingClientRect()

		await expect(header.height).toBe(48)
		await expect(button.height).toBe(36)
		await expect(button.left - header.left).toBe(6)
		await expect(Math.abs(button.top - header.top - 6)).toBeLessThan(1)
	},
})
