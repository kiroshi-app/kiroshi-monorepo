import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	centredInWindowOf,
	expectCellsIn,
	slotIn,
} from "@workspace/storybook/story-utils"
import { AppBootScreen } from "@workspace/ui/components/app-boot-screen"
import { BRAND_NAME } from "@workspace/ui/components/app-icon-mark"

const schemeBeforeMount = (scheme: string) => () => {
	document.documentElement.classList.add(scheme)
	return () => document.documentElement.classList.remove(scheme)
}

const cellsOf = (avatar: HTMLElement) => {
	const canvas = avatar.querySelector("canvas")
	if (!canvas) throw new Error("This avatar draws no cells")
	return canvas
}

const expectBootAvatar = async (screen: HTMLElement) => {
	const avatar = slotIn(screen, "companion-field")

	await expect(avatar.dataset.state).toBe("thinking")
	await expect(avatar.style.backgroundColor).toBe("")
	await expect(avatar.style.borderRadius).toBe("")
	await expectCellsIn(cellsOf(avatar), "var(--foreground)")
}

const meta = preview.meta({
	title: "Feedback/AppBootScreen",
	component: AppBootScreen,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The surface a desktop window opens on while it reads the record: the whole window in the background of the scheme in force, with one companion avatar thinking on it, its cells straight on the window background with no tile behind them. It says the app is starting and nothing more — no spinner, no progress bar, no product name, no way out — so a host mounts it for exactly as long as its first read is in flight and swaps it for the shell the answer calls for. The avatar alone carries the message, so when the reader asks for reduced motion and the avatar stops moving, the status string is drawn under it instead of being left to screen readers. Reach for it on launch, never for a read a reader triggered: a refresh inside the app belongs to a skeleton where the data will land, not to a screen that takes the window back.",
			},
		},
	},
})

export const Default = meta.story({
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"The launch moment. Check that the avatar sits dead centre of the window rather than of its content, that the background is the scheme's own — flip `theme_layout` to side-by-side, a white flash in dark mode is the bug this screen exists to kill — and that the avatar is thinking with nothing drawn beside it and no tile behind its cells. Turn reduced motion on at the system level and the status string appears under the still avatar; the test context runs reduced, so this play covers the string in both forms.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const screen = slotIn(canvasElement, "app-boot-screen")

		await expect(screen.clientHeight).toBe(window.innerHeight)
		await expect(canvas.getByRole("img", { name: BRAND_NAME })).toBeVisible()
		await expect(canvas.getByRole("status")).toHaveTextContent(
			"Starting Kiroshi",
		)
		await expect(slotIn(screen, "full-window-content").children).toHaveLength(2)
		await expectBootAvatar(screen)
	},
})

export const WindowSurface = meta.story({
	globals: { theme: "light" },
	render: () => <AppBootScreen data-tauri-drag-region="deep" />,
	parameters: {
		docs: {
			description: {
				story:
					"How the app mounts it: the whole window, with the drag region a frameless desktop window needs so a launch is still movable. There is no shell yet — no sidebar, no header, no content card — and the shell replaces it whole once the record answers. The avatar is the Kiroshi companion, thinking with no ground, its cells in the theme's foreground: black on light, white on dark. Pick `WindowSurfaceDark` for the dark scheme.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const screen = slotIn(canvasElement, "app-boot-screen")

		await expect(screen).toHaveAttribute("data-tauri-drag-region", "deep")
		await expectBootAvatar(screen)
	},
})

export const WindowSurfaceDark = meta.story({
	globals: { theme: "dark" },
	beforeEach: schemeBeforeMount("dark"),
	render: () => <AppBootScreen data-tauri-drag-region="deep" />,
	parameters: {
		docs: {
			description: {
				story:
					"The window surface on the dark scheme: the same groundless thinking avatar, its cells turned white by the foreground token. Check that the cells read on the dark background and that nothing frames them.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const screen = slotIn(canvasElement, "app-boot-screen")

		await expect(screen).toHaveAttribute("data-tauri-drag-region", "deep")
		await expectBootAvatar(screen)
	},
})

export const CentredIn700pxWindow = meta.story({
	tags: ["test-only"],
	...centredInWindowOf(700),
})

export const CentredIn1100pxWindow = meta.story({
	tags: ["test-only"],
	...centredInWindowOf(1100),
})
