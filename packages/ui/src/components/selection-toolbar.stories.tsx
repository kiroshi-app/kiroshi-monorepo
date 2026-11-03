import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import { SelectionToolbar } from "@workspace/ui/components/selection-toolbar"

const NO_RING = "none"

const meta = preview.meta({
	title: "Overlays/SelectionToolbar",
	component: SelectionToolbar,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The bar floating over a text selection in the Library document editor. It only reports intent: one callback per button, the typed url for Link, and the formats already on the selection come back in through `activeFormats`. It sits 8px above `anchor`, or 8px below when `roomAbove` cannot hold it.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		anchor: { centre: 320, top: 120, bottom: 144, roomAbove: 120 },
		activeFormats: ["italic", "link"] as const,
		link: "https://kiroshi.app/brief",
		onBold: fn(),
		onItalic: fn(),
		onStrikethrough: fn(),
		onCode: fn(),
		onLink: fn(),
		onHeading: fn(),
		onList: fn(),
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
			["Bold", args.onBold],
			["Italic", args.onItalic],
			["Strikethrough", args.onStrikethrough],
			["Code", args.onCode],
			["Heading", args.onHeading],
			["List", args.onList],
		] as const
		for (const [name, callback] of calls) {
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
