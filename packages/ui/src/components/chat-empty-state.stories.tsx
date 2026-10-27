import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	companionGlyphOf,
	companionHueOf,
	pictureOf,
} from "@workspace/storybook/story-utils"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"

const UPLOADED_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

const BOT = {
	name: "Nest Keeper",
	blot: BLOT_HUES.blue,
	seed: "bot_4f8c21",
} as const

const meta = preview.meta({
	title: "Conversation/Message/ChatEmptyState",
	component: ChatEmptyState,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The single surface Kiroshi shows before a conversation holds any message. It carries the whole first-run decision: either the agent answers and the reader is sent to the composer, or it does not and the reader is sent to setup. When it answers, the screen belongs to the companion — its face is the mark and its name is the title — so opening an empty conversation says which companion is about to be talked to. It owns its own copy and holds no sidebar, roster, suggestion or navigation — compose it above a composer, never inside a chat screen shell.",
			},
		},
	},
	args: {
		onSetup: fn(),
		onSignIn: fn(),
		...BOT,
	},
	argTypes: {
		status: {
			control: "inline-radio",
			options: ["ready", "unavailable", "notConnected"],
		},
	},
})

export const WithSettings = meta.story({
	args: { status: "ready", onOpenSettings: fn() },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on the empty conversation of a host that can open the companion's settings: nothing has been said yet, so describing the companion is still worth offering beside the first message. Check that the action sits under the copy and above the arrow hint, that it reads as secondary — the first message is still the point of the screen — and that it names the settings exactly as the bar above and the roster row's menu do, so the same door is not called three things. Pick `Unavailable` instead when the CLI is unreachable and typing would fail. `apps/app/src/components/thread-screen.tsx:553` mounts it with the door to the companion's settings on every empty bot thread.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const settings = canvas.getByRole("button", {
			name: "Open companion settings",
		})

		await expect(
			canvas.getByText(/Message a companion to start\./),
		).toBeVisible()
		await userEvent.click(settings)
		await expect(args.onOpenSettings).toHaveBeenCalled()
	},
})

export const PresetHue = meta.story({
	args: { status: "ready" },
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(avatar))).toBe(BLOT_HUES.blue)
	},
})

export const FreeHue = meta.story({
	args: { status: "ready", blot: 210 },
	parameters: {
		docs: {
			description: {
				story:
					"A companion given a hue outside the eight presets, 210. Check that its face is painted in that hue rather than the nearest preset. Pick `PresetHue` for a preset.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(companionHueOf(companionGlyphOf(avatar))).toBe(210)
	},
})

export const WithoutBlot = meta.story({
	args: { status: "ready", blot: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a companion that was never marked with a tint: its field is drawn in Kiroshi blue. Check that the mark still holds the same box as `WithSettings` — the heading must not shift up when the tint is gone. Pick `WithSettings` for a companion that carries one. `apps/app/src/components/thread-screen.tsx:549` passes no tint for a companion whose `avatarBlot` is null.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(
			avatar.querySelector('[data-slot="bot-avatar-blot"]'),
		).toBeNull()
	},
})

export const WithPicture = meta.story({
	args: { status: "ready", image: UPLOADED_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for a companion whose reader uploaded a picture: it wins over the dithered field here exactly as it does on the roster row. Check that the picture fills the same round box the drawing would have, so the title lands on the same baseline. Pick `WithSettings` for a companion wearing its dithered field. `apps/app/src/components/thread-screen.tsx:551` passes the uploaded picture of the companion the thread belongs to.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = botIdentityAvatars(canvasElement)

		await expect(await pictureOf(avatar)).toHaveAttribute("src", UPLOADED_IMAGE)
	},
})

export const Unnamed = meta.story({
	args: { status: "ready", name: "" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the companion carries no name — which a rename reaches and a creation does not. `apps/app/src-tauri/src/conversations/commands.rs:244` refuses a nameless draft with `NamelessBot`, but `conversation_update_bot` at `apps/app/src-tauri/src/conversations/commands.rs:462` guards nothing, and `packages/ui/src/components/bot-settings-dialog/index.tsx:165` substitutes a placeholder in its own title rather than blocking the save, so an emptied name is written and `apps/app/src/components/thread-screen.tsx:551` passes it here. Check that the title falls back to naming the product instead of showing an empty heading, and that the mark is still drawn. Pick `WithSettings` once the companion carries a name.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "Start with the agent" }),
		).toBeVisible()
	},
})

export const Unavailable = meta.story({
	args: { status: "unavailable" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when Kiroshi launched but its built-in agent is unreachable: the composer is disabled, so the empty state has to carry the only action left. This screen is about the agent, not about the companion — check that the companion's face and name give way to the alert mark and the agent copy, that the retry button is the single focusable target, and that the copy blames the unreachable agent rather than the prompt. Pick `WithSettings` when the agent answers and the composer is live. `apps/app/src/lib/chat/screen-model.ts:283` returns this status when the connection is neither ready nor checking.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const setup = canvas.getByRole("button", { name: "Try again" })

		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await expect(canvas.queryByText(BOT.name)).toBeNull()
		await userEvent.click(setup)
		await expect(args.onSetup).toHaveBeenCalled()
	},
})

export const NotConnected = meta.story({
	args: { status: "notConnected" },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the agent answers but no Claude account is connected: talking to the companion cannot work until the reader signs in, so the empty state carries the sign-in action. Check that the alert mark replaces the companion's face, that the title says the reader is not signed in rather than blaming the agent, and that the sign-in button is the single focusable target. Pick `Unavailable` when the agent itself does not answer. `apps/app/src/lib/chat/screen-model.ts:281` returns this status when the latest transport error is `notAuthenticated`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const signIn = canvas.getByRole("button", { name: "Sign in" })

		await expect(
			canvas.getByRole("heading", { name: "You’re not signed in" }),
		).toBeVisible()
		await expect(botIdentityAvatars(canvasElement)).toHaveLength(0)
		await userEvent.click(signIn)
		await expect(args.onSignIn).toHaveBeenCalled()
		await expect(args.onSetup).not.toHaveBeenCalled()
	},
})

const CENTRE_TOLERANCE = 1

const gapsAround = (inner: Element, outer: Element) => {
	const innerBox = inner.getBoundingClientRect()
	const outerBox = outer.getBoundingClientRect()
	return {
		above: innerBox.top - outerBox.top,
		below: outerBox.bottom - innerBox.bottom,
		before: innerBox.left - outerBox.left,
		after: outerBox.right - innerBox.right,
	}
}

export const CentredInItsFrame = meta.story({
	args: { status: "ready" },
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				story:
					"Reach for this to check the placement the transcript gets for free: dropped into a flex region taller and wider than itself, with no class from its caller, the empty state sits in the middle on both axes. Check that the column does not hug the top or the start edge. `apps/app/src/components/thread-screen.tsx` mounts it with no class at all.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[32rem] w-full" data-testid="frame">
				<Story />
			</div>
		),
	],
	play: async ({ canvas, canvasElement }) => {
		const gaps = gapsAround(
			canvasElement.querySelector('[data-slot="chat-empty-state"]') as Element,
			canvas.getByTestId("frame"),
		)

		await expect(gaps.above).toBeGreaterThan(0)
		await expect(Math.abs(gaps.above - gaps.below)).toBeLessThanOrEqual(
			CENTRE_TOLERANCE,
		)
		await expect(Math.abs(gaps.before - gaps.after)).toBeLessThanOrEqual(
			CENTRE_TOLERANCE,
		)
	},
})
