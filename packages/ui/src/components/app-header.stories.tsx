import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { AppHeader } from "@workspace/ui/components/app-header"
import { ConnectionStatus } from "@workspace/ui/components/connection-status"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { Icons } from "@workspace/ui/components/icons"
import { PinnedMessages } from "@workspace/ui/components/pinned-messages"
import { Button } from "@workspace/ui/components/ui/button"
import { WindowControls } from "@workspace/ui/components/window-controls"

const HEADER_HEIGHT = 48

const TRAILING_CONTROL_SIZE = 28

const TRAILING_INSET = (HEADER_HEIGHT - TRAILING_CONTROL_SIZE) / 2

const meta = preview.meta({
	title: "Layout/AppHeader",
	component: AppHeader,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The one fixed bar above a screen: a leading identity slot and a trailing slot pinned to the opposite edge. It is a shell, not a navigation bar — it holds no routes, tabs or menu, so a single-screen app can use it without growing one. Both slots are optional and the trailing slot stays right whether or not the leading one is filled.",
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
					"Reach for this on a screen holding no thread: both slots empty, in a desktop window whose title bar is transparent, so the OS paints its close/minimise/zoom buttons over this row. Check that the leading gutter is wide enough that nothing collides with those controls and that the bar keeps its height with nothing in it. Pick `TrailingInset` for the bar a thread fills. The app assembles it at `apps/app/src/components/workspace-body.tsx:127`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner")

		await expect(header).toBeVisible()
		await expect(getComputedStyle(header).paddingLeft).toBe("88px")
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
				version="2.1.233"
			/>
		),
		trailing: <PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this for the bar a thread fills: the companion on the leading edge, the pinned messages control on the trailing one. Check the corner that icon-only control lands in — the bar owes it the same air above, below and to its right, so it reads as placed rather than pushed into the angle — and that the three gaps measure the same pixel, the bottom rule leaning the row a pixel down to pay for itself. Pick `Default` for the empty bar. The app assembles it at `apps/app/src/components/thread-screen.tsx:330`.",
			},
		},
	},
	play: async ({ canvas }) => {
		const header = canvas.getByRole("banner").getBoundingClientRect()
		const control = canvas
			.getByRole("button", { name: "Pinned messages" })
			.getBoundingClientRect()

		await expect(control.height).toBe(TRAILING_CONTROL_SIZE)
		await expect(header.height).toBe(HEADER_HEIGHT)
		await expect({
			top: Math.round(control.top - header.top),
			bottom: Math.round(header.bottom - control.bottom),
			right: Math.round(header.right - control.right),
		}).toEqual({
			top: TRAILING_INSET,
			bottom: TRAILING_INSET,
			right: TRAILING_INSET,
		})
	},
})

export const WindowsCaption = meta.story({
	args: {
		leading: (
			<HeaderIdentityButton
				connection="ready"
				name="Nest"
				onOpenSettings={fn()}
				seed="nest"
				version="2.1.233"
			/>
		),
		trailing: <PinnedMessages messages={[]} onJump={fn()} onUnpin={fn()} />,
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
					"Reach for this in a frameless Windows window, where the app draws its own minimise, maximise and close buttons at the end of the bar. Check that the three caption buttons sit after the trailing slot, flush with the top and right edges of the bar with no inset, and that the trailing control keeps its gap before them. Pick `TrailingInset` on macOS, where the OS paints the controls on the leading edge. The app assembles it through `apps/app/src/components/window-caption-controls.tsx`.",
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

export const WithAction = meta.story({
	tags: ["test-only"],
	args: {
		leading: <>Kiroshi</>,
		trailing: (
			<>
				<ConnectionStatus name="Nest Keeper" state="crashed" />
				<Button size="xs" variant="outline">
					<Icons.Retry data-icon="inline-start" />
					Restart
				</Button>
			</>
		),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Reach for this when the trailing slot has to carry more than a status — here a dead session and the control that revives it. Check that status and button stay grouped on the trailing edge with the gap between them, rather than spreading across the bar. No screen assembles this bar: the app puts the connection state inside the identity button and never hangs a control beside it, so this one stays out of the catalogue and proves the grouping for the suite alone.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("button", { name: "Restart" })).toBeVisible()
	},
})
