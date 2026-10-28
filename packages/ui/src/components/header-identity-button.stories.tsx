import { expect, fn, userEvent } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	companionGlyphOf,
	companionHueOf,
	listExhaustively,
} from "@workspace/storybook/story-utils"
import { AppHeader } from "@workspace/ui/components/app-header"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"
import type { ConnectionStatusState } from "@workspace/ui/components/connection-status"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"

const CONNECTION_STATES = listExhaustively<ConnectionStatusState>({
	checking: true,
	ready: true,
	unavailable: true,
	crashed: true,
})

const LONG_NAME =
	"Migration copilot for the legacy billing workspace and its archives"

const meta = preview.meta({
	title: "Navigation/HeaderIdentityButton",
	component: HeaderIdentityButton,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The header's leading control: who the reader is talking to, whether the agent answers, and the way into that companion's settings, in one ghost button. It is the only focusable thing on that row — the connection mark inside it is decorative markup, never a second target — so the header stays one tab stop. Reach for it in an app header; the sidebar's own companion rows are `AppSidebar`, not this.",
			},
		},
	},
	args: {
		name: "Nest",
		seed: "nest",
		connection: "ready",
		version: "2.1.233",
		onOpenSettings: fn(),
	},
	argTypes: {
		connection: { control: "inline-radio", options: CONNECTION_STATES },
	},
})

export const Default = meta.story({
	args: { connection: "ready", name: "Nest" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the nominal header: a short companion name, the CLI answering, the settings closed. Check that avatar, name, state and glyph read left to right on one row, that the whole thing is a single button, and that activating it asks for the settings. Pick `InLayout` to see it in the header it belongs to. The app assembles it at `apps/app/src/components/thread-screen.tsx:334`.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const button = canvas.getByRole("button", {
			name: "Nest · agent settings",
		})

		await expect(button).toHaveAttribute("aria-expanded", "false")
		await userEvent.click(button)
		await expect(args.onOpenSettings).toHaveBeenCalled()
	},
})

export const Variants = meta.story({
	tags: ["test-only"],
	args: { connection: "ready", name: "Nest" },
	parameters: {
		docs: {
			description: {
				story:
					"Every state the CLI can be in, carried by the same button. Check that the row never reflows between them — only the dot's colour and the screen-reader label change — so the name and the settings glyph hold their place while the connection comes and goes. Pick `Default` for the one state the reader should normally see.",
			},
		},
	},
	render: (args) => (
		<div className="flex flex-col items-start gap-2">
			{CONNECTION_STATES.map((connection) => (
				<HeaderIdentityButton
					{...args}
					connection={connection}
					key={connection}
				/>
			))}
		</div>
	),
})

export const Expanded = meta.story({
	args: { connection: "ready", isSettingsOpen: true, name: "Nest" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the companion's settings are open: the button is the trigger that stays lit under its own panel. Check that the ghost surface holds the expanded tint and that assistive tech reads it as expanded. Pick `Default` for the closed state. The app assembles it at `apps/app/src/components/thread-screen.tsx:334`.",
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

export const Working = meta.story({
	args: {
		blot: BLOT_HUES.blue,
		connection: "ready",
		kind: "writing",
		name: "Nest",
		working: true,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this while the companion holds the turn: the header avatar runs the same animation and carries the same pulsing activity dot as the one in the transcript, so the reader can leave the transcript and still see the companion is busy. Check that the row does not reflow while it animates and that the motion stops under `prefers-reduced-motion`. Pick `Default` for the resting companion. The app assembles it at `apps/app/src/components/thread-screen.tsx:334`.",
			},
		},
	},
})

export const PresetHue = meta.story({
	args: { blot: BLOT_HUES.blue, connection: "ready", name: "Nest" },
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(avatar))).toBe(BLOT_HUES.blue)
	},
})

export const FreeHue = meta.story({
	args: { blot: 210, connection: "ready", name: "Nest" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion given a hue outside the eight presets, 210. Check that the header avatar wears that hue rather than the nearest preset. Pick `PresetHue` for a preset.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(avatar))).toBe(210)
	},
})

export const LongContent = meta.story({
	globals: { viewport: { value: "mobile" } },
	args: { connection: "ready", name: LONG_NAME },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Reach for this when a companion is named in a sentence and the window is narrow. Check that the name clips with an ellipsis while the connection dot and the settings glyph stay fully in view on the right — the name is what gives up room, never the state. Pick `Default` for a name that fits. The app assembles it at `apps/app/src/components/thread-screen.tsx:334`.",
			},
		},
	},
	render: (args) => <AppHeader leading={<HeaderIdentityButton {...args} />} />,
	play: async ({ canvas }) => {
		const name = canvas.getByText(LONG_NAME)

		await expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
		await expect(canvas.getByRole("button")).toBeVisible()
	},
})

export const InLayout = meta.story({
	tags: ["test-only"],
	args: { connection: "ready", name: "Nest" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Reach for this to check the button in the header it ships in, with an empty trailing slot. Check that the room left of the button matches the room above and below it, that the header keeps its 48px height, and that nothing pulls to the trailing edge. Pick `Default` to inspect the button alone.",
			},
		},
	},
	render: (args) => <AppHeader leading={<HeaderIdentityButton {...args} />} />,
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner").getBoundingClientRect()
		const button = canvas.getByRole("button").getBoundingClientRect()

		await expect(header.height).toBe(48)
		await expect(button.height).toBe(36)
		await expect(button.left - header.left).toBe(6)
		await expect(Math.abs(button.top - header.top - 6)).toBeLessThan(1)
	},
})
