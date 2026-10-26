import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { AppTitleBar } from "@workspace/ui/components/app-title-bar"
import {
	STUDIO,
	TITLE_BAR,
} from "@workspace/ui/components/app-title-bar.fixtures"
import { WindowControls } from "@workspace/ui/components/window-controls"
import { SHELL_TITLE_BAR_HEIGHT } from "@workspace/ui/components/workspace-shell"

const MACOS_WINDOW_CONTROLS_RESERVE = 78

const meta = preview.meta({
	title: "Navigation/AppTitleBar",
	component: AppTitleBar,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The 34px strip across the top of the window shell: the Space switcher, then the window controls a host draws. The conversations screen and every focused settings screen mount this one bar, so the switcher sits at the same place whichever screen is open.",
			},
		},
	},
	args: { ...TITLE_BAR, onSelectSpace: fn(), onCreateSpace: fn() },
	render: (args) => (
		<div className="surface-shell relative h-8.5">
			<AppTitleBar {...args} />
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"macOS, where the system draws the traffic lights over a transparent title bar. Check that the bar is 34px high, that the switcher clears the 78px the traffic lights take and names the selected Space, and that the bar stays a drag region. Pick `WithWindowControls` for a host that draws its own caption buttons.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const titleBar = slotIn(canvasElement, "app-title-bar")
		const bar = titleBar.getBoundingClientRect()
		const switcher = slotIn(titleBar, "space-switcher")
		await expect(bar.height).toBe(SHELL_TITLE_BAR_HEIGHT)
		await expect(switcher).toHaveTextContent(STUDIO.name)
		await expect(switcher.getBoundingClientRect().left).toBeGreaterThanOrEqual(
			bar.left + MACOS_WINDOW_CONTROLS_RESERVE,
		)
		await expect(titleBar).toHaveAttribute("data-tauri-drag-region", "deep")
	},
})

export const WithWindowControls = meta.story({
	args: {
		insetWindowControls: false,
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
					"Windows, where the app draws its own caption buttons. Check that they sit flush with the trailing end of the bar and as tall as it, and that the switcher takes the leading 10px gutter instead of the traffic lights reserve.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const titleBar = slotIn(canvasElement, "app-title-bar")
		const bar = titleBar.getBoundingClientRect()
		const controls = slotIn(
			titleBar,
			"app-title-bar-window-controls",
		).getBoundingClientRect()
		await expect(controls.right).toBe(bar.right)
		await expect(controls.height).toBe(SHELL_TITLE_BAR_HEIGHT)
		await expect(
			slotIn(titleBar, "space-switcher").getBoundingClientRect().left,
		).toBeLessThan(bar.left + MACOS_WINDOW_CONTROLS_RESERVE)
	},
})
