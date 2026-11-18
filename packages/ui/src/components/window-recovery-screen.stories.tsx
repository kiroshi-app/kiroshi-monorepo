import { expect, fn, userEvent, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectNoHorizontalScrollAt,
	resolvedRootColor,
	slotIn,
} from "@workspace/storybook/story-utils"
import {
	type WindowRecoveryReason,
	WindowRecoveryScreen,
} from "@workspace/ui/components/window-recovery-screen"

const NARROWEST_WINDOW = 320
const LIGHT_INK = "rgb(0, 0, 0)"
const DARK_INK = "rgb(255, 255, 255)"

type Handler = "onContinue" | "onReload"

type Expected = {
	title: string
	action: string
	handler: Handler
	namesTheRing: boolean
}

const EXPECTED: Record<WindowRecoveryReason, Expected> = {
	"out-of-memory": {
		title: "Kiroshi reloaded its window",
		action: "Continue",
		handler: "onContinue",
		namesTheRing: false,
	},
	crash: {
		title: "Kiroshi reloaded its window",
		action: "Continue",
		handler: "onContinue",
		namesTheRing: false,
	},
	"gave-up": {
		title: "Couldn’t reload the window",
		action: "Reload the window",
		handler: "onReload",
		namesTheRing: true,
	},
}

const describedAs = (story: string) => ({ docs: { description: { story } } })

const meta = preview.meta({
	title: "Feedback/WindowRecoveryScreen",
	component: WindowRecoveryScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The whole window a desktop window shows after its page died and the host reloaded it: the Kiroshi ring, what happened, and one way back. `reason` says why: `out-of-memory` and `crash` tell the reader the window came back and hand them `onContinue`; `gave-up` says the window stopped too often to reload on its own and hands them `onReload`. Every reason says Kiroshi and the agents kept running, because that is the reader's real worry. The whole window drags it, the button excepted. Reach for it only after a page loss the host recovered from, never for a launch failure: that one belongs to AppBootNotice.",
			},
		},
	},
	args: { onContinue: fn(), onReload: fn() },
	argTypes: {
		reason: {
			control: "inline-radio",
			options: ["out-of-memory", "crash", "gave-up"],
		},
	},
})

type PlayContext = {
	args: { reason: WindowRecoveryReason } & Record<Handler, () => void>
	canvasElement: HTMLElement
}

const provesRecovery =
	(ink: string) =>
	async ({ args, canvasElement }: PlayContext) => {
		const canvas = within(canvasElement)
		const expected = EXPECTED[args.reason]
		const screen = slotIn(canvasElement, "window-recovery-screen")
		const ring = slotIn(canvasElement, "hexagon-ring")

		await expect(
			canvas.getByRole("heading", { level: 1, name: expected.title }),
		).toBeVisible()
		await expect(screen).toHaveAttribute("data-tauri-drag-region", "deep")
		await expect(getComputedStyle(screen).backgroundColor).toBe(
			resolvedRootColor("--background"),
		)
		await expect(getComputedStyle(ring).color).toBe(ink)
		if (expected.namesTheRing) {
			await expect(canvas.getByRole("img", { name: "Kiroshi" })).toBe(ring)
		} else {
			await expect(ring).toHaveAttribute("aria-hidden", "true")
			await expect(canvas.queryByRole("img")).toBeNull()
		}

		await userEvent.tab()
		const action = canvas.getByRole("button", { name: expected.action })
		await expect(action).toHaveFocus()
		await expect(action.matches(":focus-visible")).toBe(true)
		await expect(action).toHaveAttribute("data-tauri-drag-region", "false")

		await userEvent.keyboard("{Enter}")
		const other = expected.handler === "onContinue" ? "onReload" : "onContinue"
		await expect(args[expected.handler]).toHaveBeenCalledOnce()
		await expect(args[other]).not.toHaveBeenCalled()

		await expectNoHorizontalScrollAt(
			canvasElement,
			NARROWEST_WINDOW,
			"window-recovery-screen",
		)
	}

export const OutOfMemory = meta.story({
	args: { reason: "out-of-memory" },
	parameters: describedAs(
		"The window ran out of memory and the host reloaded it. Check the title names Kiroshi, so the ring stays decorative, and that Continue hands the window back through `onContinue`. Pick `Crash` for a reload with no memory cause.",
	),
	play: provesRecovery(LIGHT_INK),
})

export const Crash = meta.story({
	args: { reason: "crash" },
	parameters: describedAs(
		"The page stopped for any other reason and the host reloaded it. Same title and Continue as `OutOfMemory`, only the cause in the body changes.",
	),
	play: provesRecovery(LIGHT_INK),
})

export const GaveUp = meta.story({
	args: { reason: "gave-up" },
	parameters: describedAs(
		"The page stopped too many times in a minute and the host stopped reloading it. The title no longer names Kiroshi, so the ring speaks as the image named Kiroshi, and the one way out is Reload the window through `onReload`.",
	),
	play: provesRecovery(LIGHT_INK),
})

export const OutOfMemoryDark = OutOfMemory.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
	parameters: describedAs(
		"`OutOfMemory` on the dark scheme: dark background, white ring.",
	),
	play: provesRecovery(DARK_INK),
})

export const CrashDark = Crash.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
	parameters: describedAs(
		"`Crash` on the dark scheme: dark background, white ring.",
	),
	play: provesRecovery(DARK_INK),
})

export const GaveUpDark = GaveUp.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
	parameters: describedAs(
		"`GaveUp` on the dark scheme: dark background, white ring.",
	),
	play: provesRecovery(DARK_INK),
})
