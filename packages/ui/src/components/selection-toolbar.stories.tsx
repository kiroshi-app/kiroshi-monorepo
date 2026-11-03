import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import {
	SELECTION_TOOLBAR_SEPARATOR,
	SelectionToolbar,
	type SelectionToolbarItem,
} from "@workspace/ui/components/selection-toolbar"

const NO_RING = "none"

const onBold = fn()
const onItalic = fn()
const onStrikethrough = fn()
const onCode = fn()
const onHeading = fn()
const onList = fn()

const FORMAT_ACTIONS: SelectionToolbarItem[] = [
	{ name: "bold", isOn: false, onPress: onBold },
	{ name: "italic", isOn: true, onPress: onItalic },
	{ name: "strikethrough", isOn: false, onPress: onStrikethrough },
	{ name: "code", isOn: false, onPress: onCode },
	SELECTION_TOOLBAR_SEPARATOR,
	{ name: "link", isOn: true },
	SELECTION_TOOLBAR_SEPARATOR,
	{ name: "heading", isOn: false, onPress: onHeading },
	{ name: "list", isOn: false, onPress: onList },
]

const meta = preview.meta({
	title: "Overlays/SelectionToolbar",
	component: SelectionToolbar,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The bar floating over a text selection. It draws the `actions` list it is given, in order, a `separator` between two groups: the Library document editor passes its formats, each with `isOn` for the formats already on the selection, and a message selection passes Reply then Copy. It only reports intent: one callback per button, the typed url for Link. It sits 8px above `anchor`, or 8px below when `roomAbove` cannot hold it.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		anchor: { centre: 320, top: 120, bottom: 144, roomAbove: 120 },
		label: "Format",
		actions: FORMAT_ACTIONS,
		link: "https://kiroshi.app/brief",
		onLink: fn(),
	},
	render: (args) => (
		<div className="relative h-60 w-160 bg-background" {...hueScopeOf("blue")}>
			<SelectionToolbar {...args} />
		</div>
	),
})

export const KeyboardAndPointer = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The bar with Italic and Link on, reached from the keyboard. Check that Tab lands on Bold with a visible focus ring and its tooltip, that the arrow keys walk the buttons, that Italic reports itself pressed, that every button calls its own callback once, and that the link field opens focused, with a focus ring and the current link filled in, and reports it when confirmed.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const toolbar = () => canvas.getByRole("toolbar", { name: "Format" })
		const button = (name: string) =>
			within(toolbar()).getByRole("button", { name })

		await userEvent.tab()
		await expect(document.activeElement).toBe(button("Bold"))
		await expect(getComputedStyle(button("Bold")).boxShadow).not.toBe(NO_RING)
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent("Bold⌘B"),
		)
		await userEvent.keyboard("{ArrowRight}")
		await expect(document.activeElement).toBe(button("Italic"))
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent("Italic⌘I"),
		)
		await userEvent.keyboard("{ArrowLeft}")
		await expect(document.activeElement).toBe(button("Bold"))
		await expect(button("Italic")).toHaveAttribute("aria-pressed", "true")
		await expect(button("Bold")).toHaveAttribute("aria-pressed", "false")

		const calls = [
			["Bold", onBold],
			["Italic", onItalic],
			["Strikethrough", onStrikethrough],
			["Code", onCode],
			["Heading", onHeading],
			["List", onList],
		] as const
		for (const [name, callback] of calls) {
			callback.mockClear()
			await userEvent.click(button(name))
			await expect(callback).toHaveBeenCalledOnce()
		}
		await expect(button("Italic")).toHaveAttribute("aria-pressed", "true")

		await userEvent.click(button("Link"))
		const field = canvas.getByRole("textbox", { name: "Link address" })
		await expect(document.activeElement).toBe(field)
		await expect(getComputedStyle(field).boxShadow).not.toBe(NO_RING)
		await expect(field).toHaveValue("https://kiroshi.app/brief")
		await userEvent.keyboard("{Escape}")
		await expect(args.onLink).not.toHaveBeenCalled()

		await userEvent.click(button("Link"))
		await userEvent.click(canvas.getByRole("button", { name: "Add link" }))
		await expect(args.onLink).toHaveBeenCalledWith("https://kiroshi.app/brief")
		await expect(toolbar()).toBeVisible()
	},
})
