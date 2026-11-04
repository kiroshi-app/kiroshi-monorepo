import {
	userEvent as directUserEvent,
	expect,
	fn,
	screen,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import { ImageMenu } from "@workspace/ui/components/image-menu"
import { LIBRARY_LIGHTBOX_IMAGES } from "@workspace/ui/components/library.fixtures"

const [IMAGE] = LIBRARY_LIGHTBOX_IMAGES

const VIEWER_ACTION_ORDER = [
	"Download",
	"Copy",
	"Open",
	"Open in new tab",
	"Rename",
	"Show in folder",
	"Delete",
]

const IMAGE_ACTION_ORDER = ["Save to Library", "Copy image", "Open in viewer"]

const openMenu = async (
	canvasElement: HTMLElement,
	userEvent: UserEventObject,
) => {
	await userEvent.pointer({
		keys: "[MouseRight]",
		target: within(canvasElement).getByRole("img", { name: IMAGE.name }),
	})
	return screen.findByRole("menu", { name: `Actions for ${IMAGE.name}` })
}

const entryNamesIn = (menu: HTMLElement) =>
	within(menu)
		.getAllByRole("menuitem")
		.map((entry) => entry.textContent)

const meta = preview.meta({
	title: "Overlays/ImageMenu",
	component: ImageMenu<string>,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The right-click menu of any image, opened at the pointer on its `trigger`. It takes callbacks only and saves, copies or opens nothing itself. It lists the viewer actions first, in the order the lightbox draws them, buttons then its More menu, rendered and confirmed like the Library item menu, then Save to Library, Copy image and Open in viewer. An entry shows only when its callback is given, and with none the trigger keeps the platform's right-click. On the `viewer` surface it draws dark like the lightbox and never offers Open in viewer.",
			},
		},
	},
	args: {
		item: IMAGE.id,
		name: IMAGE.name,
		trigger: (
			<img alt={IMAGE.name} className="block w-80 rounded-md" src={IMAGE.src} />
		),
		onDownload: fn(),
		onCopy: fn(),
		onOpen: fn(),
		onOpenInNewTab: fn(),
		onRename: fn(),
		onShowInFolder: fn(),
		onDelete: fn(),
		onSaveToLibrary: fn(),
		onCopyImage: fn(),
		onOpenInViewer: fn(),
	},
})

export const EveryAction = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Every callback given, on the thread surface. Check the viewer actions come first in the lightbox's order, Delete set apart and confirmed before it runs, then Save to Library, Copy image and Open in viewer, and that an entry hands the image back to its callback.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		let menu = await openMenu(canvasElement, userEvent)
		await expect(entryNamesIn(menu)).toEqual([
			...VIEWER_ACTION_ORDER,
			...IMAGE_ACTION_ORDER,
		])
		await expect(
			within(menu).getByRole("menuitem", { name: "Open in viewer" }),
		).toBeVisible()

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Open in viewer" }),
		)
		await expect(args.onOpenInViewer).toHaveBeenCalledWith(IMAGE.id)

		menu = await openMenu(canvasElement, userEvent)
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Delete" }),
		)
		const confirmation = await screen.findByRole("alertdialog", {
			name: `Delete ${IMAGE.name}?`,
		})
		await expect(args.onDelete).not.toHaveBeenCalled()
		await userEvent.click(
			within(confirmation).getByRole("button", { name: "Delete" }),
		)
		await waitFor(() => expect(args.onDelete).toHaveBeenCalledWith(IMAGE.id))
	},
})

export const InViewer = meta.story({
	args: { surface: "viewer" },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The viewer surface with every callback given, Open in viewer included. Check Open in viewer is left out, since the image is already in the viewer, while Save to Library stays offered for an image that is already in the Library.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const menu = await openMenu(canvasElement, userEvent)
		await expect(entryNamesIn(menu)).toEqual([
			...VIEWER_ACTION_ORDER,
			"Save to Library",
			"Copy image",
		])
		await expect(
			within(menu).queryByRole("menuitem", { name: "Open in viewer" }),
		).toBe(null)
	},
})

export const ImageActionsOnly = meta.story({
	args: {
		onDownload: undefined,
		onCopy: undefined,
		onOpen: undefined,
		onOpenInNewTab: undefined,
		onRename: undefined,
		onShowInFolder: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Only the three image callbacks, what a picture in the thread gets. Check no viewer action and no separator is drawn ahead of Save to Library.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const menu = await openMenu(canvasElement, userEvent)
		await expect(entryNamesIn(menu)).toEqual(IMAGE_ACTION_ORDER)
		await expect(within(menu).queryByRole("separator")).toBe(null)
		await expect(
			within(menu).getByRole("menuitem", { name: "Save to Library" }),
		).not.toHaveAttribute("aria-disabled")
	},
})

export const SavingToLibrary = meta.story({
	args: {
		isSavingToLibrary: true,
		onDownload: undefined,
		onCopy: undefined,
		onOpen: undefined,
		onOpenInNewTab: undefined,
		onRename: undefined,
		onShowInFolder: undefined,
		onDelete: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The image is on its way to the Library. Check Save to Library keeps its place, label and icon, draws in the menu's disabled style and ignores a press, while Copy image and Open in viewer still answer.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		let menu = await openMenu(canvasElement, userEvent)
		await expect(entryNamesIn(menu)).toEqual(IMAGE_ACTION_ORDER)
		const save = within(menu).getByRole("menuitem", { name: "Save to Library" })
		await expect(save).toHaveAttribute("aria-disabled", "true")
		await expect(
			within(menu).getByRole("menuitem", { name: "Copy image" }),
		).not.toHaveAttribute("aria-disabled")
		await expect(
			within(menu).getByRole("menuitem", { name: "Open in viewer" }),
		).not.toHaveAttribute("aria-disabled")

		await directUserEvent.click(save, { pointerEventsCheck: 0 })
		save.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onSaveToLibrary).not.toHaveBeenCalled()

		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Copy image" }),
		)
		await expect(args.onCopyImage).toHaveBeenCalledWith(IMAGE.id)

		menu = await openMenu(canvasElement, userEvent)
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Open in viewer" }),
		)
		await expect(args.onOpenInViewer).toHaveBeenCalledWith(IMAGE.id)
	},
})

export const WithoutCallbacks = meta.story({
	tags: ["test-only"],
	args: {
		onDownload: undefined,
		onCopy: undefined,
		onOpen: undefined,
		onOpenInNewTab: undefined,
		onRename: undefined,
		onShowInFolder: undefined,
		onDelete: undefined,
		onSaveToLibrary: undefined,
		onCopyImage: undefined,
		onOpenInViewer: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"No callback at all. Check a right-click opens no menu and leaves the platform's own.",
			},
		},
	},
	play: async ({ canvas }) => {
		const contextMenu = new MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
		})
		canvas.getByRole("img", { name: IMAGE.name }).dispatchEvent(contextMenu)
		await expect(contextMenu.defaultPrevented).toBe(false)
		await expect(screen.queryByRole("menu")).toBe(null)
	},
})
