import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	colourTransitionsOf,
	expectStaticHeaderBar,
	isInBrowserRunner,
	realPointer,
	tokenStyleIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderButton,
	AppHeaderPathLink,
	AppHeaderPathSeparator,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { Icons } from "@workspace/ui/components/icons"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { WindowControls } from "@workspace/ui/components/window-controls"

const HEADER_HEIGHT = 56

const CAPSULE_BUTTON = 28

const CAPSULE_BUTTON_INSET = (HEADER_HEIGHT - CAPSULE_BUTTON) / 2

const TRANSPARENT = "rgba(0, 0, 0, 0)"

const CONTROL_STATES = ["rest", "hover", "pressed", "focus-visible"] as const

type ControlState = (typeof CONTROL_STATES)[number]

type ControlName = "capsule" | "close" | "path"

const controlId = (control: ControlName, state: ControlState) =>
	`app-header-${control}-${state}`

const controlsIn = (state: ControlState) =>
	(["capsule", "close", "path"] as const).map(
		(control) => `#${controlId(control, state)}`,
	)

const controlAt = (
	canvasElement: HTMLElement,
	control: ControlName,
	state: ControlState,
) => {
	const found = canvasElement.querySelector<HTMLElement>(
		`#${controlId(control, state)}`,
	)
	if (!found) throw new Error(`No ${control} control drawn at ${state}`)
	return found
}

const fillOf = (control: HTMLElement) =>
	getComputedStyle(control).backgroundColor

const inkOf = (control: HTMLElement) => getComputedStyle(control).color

const tokenFill = (control: HTMLElement, light: string, dark: string) =>
	tokenStyleIn(
		control,
		control.closest(".dark") ? dark : light,
		"backgroundColor",
	)

const tokenInk = (control: HTMLElement, ink: string) =>
	tokenStyleIn(control, ink, "color")

const expectSpaceRing = async (control: HTMLElement, offset: string) => {
	const line = getComputedStyle(control)

	await expect([
		line.outlineStyle,
		line.outlineWidth,
		line.outlineOffset,
	]).toEqual(["solid", "2px", offset])
	await expect(line.outlineColor).toBe(
		tokenStyleIn(control, "border border-ring", "borderTopColor"),
	)
}

const meta = preview.meta({
	title: "Layout/AppHeader",
	component: AppHeader,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The one static bar above a screen, in the layout flow: 56px tall on the content surface, a 1px rule under it, never a fade or a shadow. Its leading cluster grows and truncates, an avatar or a subject icon then `AppHeaderText`, a title under an optional top line; its trailing slot wraps its icon buttons in one capsule and never shrinks; `close` holds the round control that leaves the screen. `AppHeaderCapsule` is that capsule on its own, for a bar whose `close` slot groups it with presence and the round control 8 apart, as the Library bars do. `isFloating` is still accepted from the app and changes nothing.",
			},
		},
	},
})

export const Default = meta.story({
	args: { insetWindowControls: true },
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this on a screen holding no thread: both slots empty, in a desktop window whose title bar is transparent, so the OS paints its close/minimise/zoom buttons over this row. Check that the leading gutter is wide enough that nothing collides with those controls and that the bar keeps its 56px and its rule with nothing in it. Pick `TrailingInset` for the bar a thread fills. The app assembles it at `apps/app/src/components/bare-app-header.tsx:5`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner")

		await expect(header).toBeVisible()
		await expect(getComputedStyle(header).paddingLeft).toBe("88px")
		await expect(getComputedStyle(header).borderBottomWidth).toBe("1px")
		await expect(header.getBoundingClientRect().height).toBe(HEADER_HEIGHT)
	},
})

export const TrailingInset = meta.story({
	args: {
		leading: (
			<HeaderIdentityButton
				connection="ready"
				name="Nest"
				onOpenSettings={fn()}
				seed="nest"
				title="Frontend engineer"
				version="2.1.233"
			/>
		),
		trailing: <PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the bar a thread fills: the agent on the leading edge, the pinned messages control in the capsule on the trailing one. Check the corner that icon-only control lands in: the 28px circle sits 14px from the top, the bottom and the side of the bar, 2px inside its capsule, itself 12px from the bar's edges. Pick `Default` for the empty bar. The app assembles it at `apps/app/src/components/thread-screen.tsx:477`.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const header = (
			await expectStaticHeaderBar(canvasElement)
		).getBoundingClientRect()
		const control = canvas
			.getByRole("button", { name: "Pinned messages" })
			.getBoundingClientRect()

		await expect([control.width, control.height]).toEqual([
			CAPSULE_BUTTON,
			CAPSULE_BUTTON,
		])
		await expect({
			top: Math.round(control.top - header.top),
			bottom: Math.round(header.bottom - control.bottom),
			right: Math.round(header.right - control.right),
		}).toEqual({
			top: CAPSULE_BUTTON_INSET,
			bottom: CAPSULE_BUTTON_INSET,
			right: CAPSULE_BUTTON_INSET,
		})
	},
})

export const WindowsCaption = meta.story({
	args: {
		...TrailingInset.input.args,
		windowControls: (
			<WindowControls
				maximized={false}
				onClose={fn()}
				onMinimize={fn()}
				onToggleMaximize={fn()}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this in a frameless Windows window, where the app draws its own minimise, maximise and close buttons at the end of the bar. Check that the three caption buttons sit after the capsule, flush with the top and right edges of the bar with no inset, and that the capsule keeps its gap before them. Pick `TrailingInset` on macOS, where the OS paints the controls on the leading edge. No screen passes `windowControls` to this bar today: the app draws them through `apps/app/src/components/window-caption-controls.tsx` in the title bar.",
			},
		},
	},
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner").getBoundingClientRect()
		const pinned = canvas
			.getByRole("button", { name: "Pinned messages" })
			.getBoundingClientRect()
		const close = canvas
			.getByRole("button", { name: "Close" })
			.getBoundingClientRect()
		const minimize = canvas
			.getByRole("button", { name: "Minimize" })
			.getBoundingClientRect()

		await expect(Math.round(header.right - close.right)).toBe(0)
		await expect(Math.round(close.top - header.top)).toBe(0)
		await expect(minimize.left).toBeGreaterThan(pinned.right)
		await expect(header.height).toBe(HEADER_HEIGHT)
	},
})

export const ControlStates = meta.story({
	parameters: {
		pseudo: {
			hover: [...controlsIn("hover"), ...controlsIn("pressed")],
			active: controlsIn("pressed"),
			focusVisible: controlsIn("focus-visible"),
		},
		docs: {
			description: {
				story:
					"Artboard I1e, the three controls of the bar in their four states, one bar per state: the path link on the top line, the capsule button, the close control. Check at rest the soft icon on no fill in the capsule, the close control on the capsule fill and the muted link; on hover the 6 percent fill and the full foreground icon, the link in the foreground with a 1px underline; pressed the 12 percent fill, the link one step softer and still underlined; on keyboard focus a 2px ring in the surface colour then a 2px ring in the Space colour around the buttons, and a 2px Space ring on 4px corners around the link. No fill and no ink animates. The play drives the real pointer and keyboard on the rest bar, in the Vitest browser runner only.",
			},
		},
	},
	render: () => (
		<div className="flex w-120 flex-col bg-card" data-content-card="">
			{CONTROL_STATES.map((state) => (
				<section aria-label={state} key={state}>
					<AppHeader
						close={
							<AppHeaderButton
								aria-label={`Close, ${state}`}
								id={controlId("close", state)}
								kind="close"
							>
								<Icons.Close aria-hidden="true" />
							</AppHeaderButton>
						}
						leading={
							<AppHeaderText
								topLine={
									<>
										<AppHeaderPathLink id={controlId("path", state)}>
											{`Library, ${state}`}
										</AppHeaderPathLink>
										<AppHeaderPathSeparator />
									</>
								}
							>
								<span className={APP_HEADER_TITLE}>Launch checklist</span>
							</AppHeaderText>
						}
						trailing={
							<AppHeaderButton
								aria-label={`Pinned messages, ${state}`}
								id={controlId("capsule", state)}
							>
								<Icons.Pin aria-hidden="true" />
							</AppHeaderButton>
						}
					/>
				</section>
			))}
		</div>
	),
	play: async ({ canvasElement }) => {
		const capsule = controlAt(canvasElement, "capsule", "rest")
		const close = controlAt(canvasElement, "close", "rest")
		const path = controlAt(canvasElement, "path", "rest")
		const capsuleFill = tokenFill(close, "bg-foreground/5", "bg-white/6")

		await expect([fillOf(capsule), fillOf(close)]).toEqual([
			TRANSPARENT,
			capsuleFill,
		])
		await expect(fillOf(capsule.parentElement as HTMLElement)).toBe(capsuleFill)
		for (const button of [capsule, close]) {
			await expect(inkOf(button)).toBe(tokenInk(button, "text-soft-foreground"))
		}
		await expect([
			inkOf(path),
			getComputedStyle(path).textDecorationLine,
		]).toEqual([tokenInk(path, "text-muted-foreground"), "none"])

		if (!isInBrowserRunner()) return
		const pointer = await realPointer()

		for (const button of [capsule, close]) {
			await pointer.hover(button)
			await expect(fillOf(button)).toBe(
				tokenFill(button, "bg-foreground/6", "bg-white/10"),
			)
			await expect(inkOf(button)).toBe(tokenInk(button, "text-foreground"))
			await withMotionAllowed(() =>
				expect(colourTransitionsOf(button)).toEqual([]),
			)
			button.focus()
			await pointer.keyboard("{Space>}")
			await expect(fillOf(button)).toBe(
				tokenFill(button, "bg-foreground/12", "bg-white/16"),
			)
			await expect(inkOf(button)).toBe(tokenInk(button, "text-foreground"))
			await pointer.keyboard("{/Space}")
			await pointer.unhover(button)
		}

		await pointer.hover(path)
		await expect([
			inkOf(path),
			getComputedStyle(path).textDecorationLine,
			getComputedStyle(path).textDecorationThickness,
		]).toEqual([tokenInk(path, "text-foreground"), "underline", "1px"])
		await withMotionAllowed(() => expect(colourTransitionsOf(path)).toEqual([]))
		path.focus()
		await pointer.keyboard("{Space>}")
		await expect([
			inkOf(path),
			getComputedStyle(path).textDecorationLine,
		]).toEqual([tokenInk(path, "text-soft-foreground"), "underline"])
		await pointer.keyboard("{/Space}")
		await pointer.unhover(path)
		path.blur()

		await pointer.click(path)
		await expect(path).toHaveFocus()
		await expect(getComputedStyle(path).outlineStyle).toBe("none")

		await pointer.tab()
		await expect(capsule).toHaveFocus()
		await expectSpaceRing(capsule, "2px")
		await expect(getComputedStyle(capsule).boxShadow).toBe(
			tokenStyleIn(capsule, "ring-2 ring-card", "boxShadow"),
		)

		await pointer.tab()
		await expect(close).toHaveFocus()
		await expectSpaceRing(close, "2px")

		await pointer.tab({ shift: true })
		await pointer.tab({ shift: true })
		await expect(path).toHaveFocus()
		await expectSpaceRing(path, "0px")
		await expect(getComputedStyle(path).borderTopLeftRadius).toBe("4px")
	},
})

export const ControlStatesDark = meta.story({
	...ControlStates.input,
	globals: { theme: "dark" },
})
