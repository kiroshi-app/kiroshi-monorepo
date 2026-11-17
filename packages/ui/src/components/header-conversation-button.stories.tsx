import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectSubjectIconInBothThemes,
	expectTitleSwappedIn,
	slotIn,
	slotsIn,
	TitleArrival,
	tokenStyleIn,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { Button } from "@workspace/ui/components/ui/button"

const CELL_SIDE = 24

const LONG_NAME =
	"Migration of the legacy billing workspace and every archive it still answers for"

const FREE_HUE = 210

const DARK = { theme: "dark", theme_layout: "single" }

const PENDING_LABEL = "New conversation"

const UNTITLED_LABEL = "Untitled conversation"

const labelOf = (button: HTMLElement) => slotIn(button, "text-swap")

const iconOf = (button: HTMLElement) =>
	slotIn(button, "conversation-subject-icon")

const meta = preview.meta({
	title: "Navigation/HeaderConversationButton",
	component: HeaderConversationButton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The leading control of a conversation header: the room's subject icon whatever the number of agents seated, the name of the conversation, and the way into its settings, in one ghost button. It wears the same height and padding as `HeaderIdentityButton`, so a room and a one-to-one chat sit their identity at exactly the same place. Reach for it in an app header; a one-to-one conversation takes `HeaderIdentityButton` instead.",
			},
		},
	},
	args: {
		name: "Billing migration",
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

export const SingleBot = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a room where one agent is left seated. Check that it still reads as a conversation: the 24px subject icon leads, never the agent's face, the name is the room's, and the settings glyph opens the room. Pick `HeaderIdentityButton` for a true one-to-one conversation, which also carries the connection mark.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const button = canvas.getByRole("button", {
			name: "Billing migration · conversation settings",
		})

		await expect(
			slotIn(button, "conversation-subject-icon").getBoundingClientRect().width,
		).toBe(CELL_SIDE)
		await expect(slotsIn(canvasElement, "bot-identity-avatar")).toHaveLength(0)
		await expect(button).toHaveAttribute("aria-expanded", "false")
	},
})

export const ThemesGroup = meta.story({
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions with no colour picked, in light and dark at once. Check that a 24px subject icon on the neutral pair of each theme leads the button, the message square centred in it. Pick `ThemesGroupPickedIcon` for a preset hue, `ThemesGroupFreeHue` for a free hue.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, undefined, CELL_SIDE),
})

export const ThemesGroupPickedIcon = meta.story({
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

export const ThemesGroupFreeHue = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { color: FREE_HUE },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to read a room of several companions coloured at a hue outside the eight presets, 210, in light and dark at once. Check that the 24px subject icon wears the recipe tones of 210 in each theme rather than the nearest preset. Pick `ThemesGroupPickedIcon` for a preset hue.",
			},
		},
	},
	play: async ({ canvasElement }) =>
		expectSubjectIconInBothThemes(canvasElement, FREE_HUE, CELL_SIDE),
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

export const NamingPending = meta.story({
	globals: DARK,
	args: { naming: "pending", color: BLOT_HUES.red, icon: "Rocket" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while a new conversation waits for its generated title, as artboard B2 draws it. Check that the label reads New conversation in a shimmer, that the 24px hexagon is the untinted one with a muted message square whatever hue and icon the room carries, and that the accessible name says New conversation too. Pick `NamingPendingSwapsToATitle` for the moment the title lands.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button", {
			name: `${PENDING_LABEL} · conversation settings`,
		})
		const shimmer = slotIn(labelOf(button), "shimmer-text")

		await expect(labelOf(button)).toHaveTextContent(PENDING_LABEL)
		await expect(iconOf(button)).toHaveAttribute("data-hue", "")
		await expect(iconOf(button).style.color).toBe("var(--muted-foreground)")
		await expect(getComputedStyle(shimmer).animationName).toBe("none")
	},
})

export const NamingArrived = meta.story({
	globals: DARK,
	args: { naming: "arrived", color: BLOT_HUES.red, icon: "Rocket" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this once the generated title has landed, as artboard B3 draws it. Check that the label is the title in `--foreground` at the pending weight, with no shimmer left, and that the subject icon is the room's own. Pick `NamingFailed` when no title came back.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button", {
			name: "Billing migration · conversation settings",
		})

		await expect(slotsIn(button, "shimmer-text")).toHaveLength(0)
		await expect(getComputedStyle(labelOf(button)).color).toBe(
			tokenStyleIn(labelOf(button), "text-foreground", "color"),
		)
		await expect(iconOf(button)).toHaveAttribute(
			"data-hue",
			String(BLOT_HUES.red),
		)
	},
})

export const NamingFailed = meta.story({
	globals: DARK,
	args: { naming: "failed", color: BLOT_HUES.red, icon: "Rocket" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the title generator gave nothing back, as artboard B4 draws it. Check that the label reads Untitled conversation in `--foreground`, that the icon is the default untinted message square, and that nothing shimmers. Pick `NamingArrived` for a title that landed.",
			},
		},
	},
	play: async ({ canvas }) => {
		const button = canvas.getByRole("button", {
			name: `${UNTITLED_LABEL} · conversation settings`,
		})

		await expect(slotsIn(button, "shimmer-text")).toHaveLength(0)
		await expect(iconOf(button)).toHaveAttribute("data-hue", "")
		await expect(iconOf(button).style.color).toBe(
			"var(--conversation-icon-foreground)",
		)
	},
})

export const NamingPendingSwapsToATitle = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this to watch a pending label give way to the generated title: press Title arrives. Check that New conversation leaves upward with a blur and the title rises in from below, that only opacity, blur and transform move, and that the button keeps its height. Pick `NamingPending` for the waiting state alone.",
			},
		},
	},
	render: (args) => (
		<TitleArrival>
			{(naming, arrive) => (
				<div className="flex flex-col items-start gap-4">
					<HeaderConversationButton {...args} naming={naming} />
					<Button onClick={arrive} variant="outline">
						Title arrives
					</Button>
				</div>
			)}
		</TitleArrival>
	),
	play: async ({ canvas, canvasElement }) =>
		expectTitleSwappedIn({
			host: slotIn(canvasElement, "header-conversation-button"),
			arrive: canvas.getByRole("button", { name: "Title arrives" }),
			title: "Billing migration",
		}),
})
