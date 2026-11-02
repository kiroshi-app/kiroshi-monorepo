import { expect, fn, screen, waitFor, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import { LibraryNewDocumentDialog } from "@workspace/ui/components/library-new-document-dialog"

const TILES = ["Blank document", "Brief", "Meeting notes", "Checklist"]

const SPACE = hueScopeOf("blue")

const findDialog = () => screen.findByRole("dialog", { name: "New document" })

const previewOf = (tile: HTMLElement) =>
	tile.querySelector('[data-slot="library-template-preview"]') as HTMLElement

const NARROW_VIEWPORT = {
	narrow: { name: "Narrow", styles: { width: "480px", height: "832px" } },
}

const isInside = (inner: DOMRect, outer: DOMRect) =>
	inner.left >= outer.left &&
	inner.right <= outer.right &&
	inner.top >= outer.top &&
	inner.bottom <= outer.bottom

const meta = preview.meta({
	title: "Navigation/LibraryNewDocumentDialog",
	component: LibraryNewDocumentDialog,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The picker New document opens on, as artboard 3 draws it: a blank page and the three templates of the Library as a single-choice group, the chosen one's description in the footer. Create document reports the chosen template id, blank included; Cancel, the close button and Escape report a dismissal and no id. The plus, the selection ring and Create document wear the Space colour.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		open: true,
		spaceTint: SPACE["data-hue"],
		onCreate: fn(),
		onDismiss: fn(),
	},
	render: (args) => (
		<div className="h-[832px] w-[1280px] bg-background" {...SPACE}>
			<LibraryNewDocumentDialog {...args} />
		</div>
	),
})

export const MeetingNotesSelected = meta.story({
	args: { defaultTemplate: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"Meeting notes chosen, as artboard 3 draws it. Check that Tab reaches the chosen tile, that the arrows move the choice with its ring and its description, and that Create document reports the chosen id.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await findDialog()
		const tiles = within(dialog).getAllByRole("radio")
		await expect(
			TILES.map((name) => within(dialog).getByRole("radio", { name })),
		).toEqual(tiles)

		const meetingNotes = within(dialog).getByRole("radio", {
			name: "Meeting notes",
		})
		const checklist = within(dialog).getByRole("radio", { name: "Checklist" })
		await expect(meetingNotes).toBeChecked()
		await expect(dialog).toHaveTextContent(
			"Decisions and next steps, dated today.",
		)

		const create = within(dialog).getByRole("button", {
			name: "Create document",
		})
		const plus = previewOf(tiles[0] as HTMLElement).querySelector(
			"svg",
		) as SVGElement
		const spaceColour = getComputedStyle(create).backgroundColor
		await expect(getComputedStyle(plus).color).toBe(spaceColour)
		await expect(getComputedStyle(previewOf(meetingNotes)).boxShadow).toContain(
			spaceColour,
		)
		await expect(getComputedStyle(previewOf(checklist)).boxShadow).toBe("none")
		await expect(getComputedStyle(create).transitionProperty).toBe("none")
		await expect(getComputedStyle(meetingNotes).transitionDuration).toBe("0s")

		while (!tiles.includes(document.activeElement as HTMLElement)) {
			await userEvent.tab()
		}
		await expect(meetingNotes).toHaveFocus()

		await userEvent.keyboard("{ArrowRight}")
		await expect(checklist).toBeChecked()
		await expect(checklist).toHaveFocus()
		await expect(dialog).toHaveTextContent("Things to tick off, one per line.")
		await expect(getComputedStyle(previewOf(checklist)).boxShadow).toContain(
			spaceColour,
		)

		await userEvent.keyboard("{ArrowLeft}")
		await expect(meetingNotes).toBeChecked()

		await userEvent.click(create)
		await expect(args.onCreate).toHaveBeenCalledOnce()
		await expect(args.onCreate).toHaveBeenCalledWith("meetingNotes")
		await expect(args.onDismiss).not.toHaveBeenCalled()
	},
})

export const BlankSelected = meta.story({
	args: { defaultTemplate: "blank" },
	parameters: {
		docs: {
			description: {
				story:
					"A blank page chosen. Check that Escape, Cancel and the close button each report a dismissal and no id, and that Create document reports blank.",
			},
		},
	},
	play: async ({ args, userEvent }) => {
		const dialog = await findDialog()
		await expect(
			within(dialog).getByRole("radio", { name: "Blank document" }),
		).toBeChecked()
		await expect(dialog).toHaveTextContent(
			"An empty page, with nothing to fill in.",
		)

		await userEvent.keyboard("{Escape}")
		await userEvent.click(
			within(dialog).getByRole("button", { name: "Cancel" }),
		)
		await userEvent.click(within(dialog).getByRole("button", { name: "Close" }))
		await expect(args.onDismiss).toHaveBeenCalledTimes(3)
		await expect(args.onCreate).not.toHaveBeenCalled()

		await userEvent.click(
			within(dialog).getByRole("button", { name: "Create document" }),
		)
		await expect(args.onCreate).toHaveBeenCalledOnce()
		await expect(args.onCreate).toHaveBeenCalledWith("blank")
	},
})

export const NarrowWindow = meta.story({
	args: { defaultTemplate: "meetingNotes" },
	globals: { viewport: { value: "narrow" } },
	parameters: {
		viewport: { options: NARROW_VIEWPORT },
		docs: {
			description: {
				story:
					"The picker in a 480 wide window, narrower than its four tiles. Check that the tiles wrap rather than clip, that every one stays reachable, and that Cancel and Create document stay whole.",
			},
		},
	},
	play: async ({ userEvent }) => {
		const dialog = await findDialog()
		const frame = dialog.getBoundingClientRect()
		await expect(frame.width).toBeLessThan(672)
		await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth)

		const tiles = within(dialog).getAllByRole("radio")
		await expect(tiles).toHaveLength(4)
		for (const tile of tiles) {
			await expect(isInside(tile.getBoundingClientRect(), frame)).toBe(true)
		}

		const create = within(dialog).getByRole("button", {
			name: "Create document",
		})
		const cancel = within(dialog).getByRole("button", { name: "Cancel" })
		await waitFor(() => expect(create).toBeVisible())
		await expect(isInside(create.getBoundingClientRect(), frame)).toBe(true)
		await expect(isInside(cancel.getBoundingClientRect(), frame)).toBe(true)

		while (!tiles.includes(document.activeElement as HTMLElement)) {
			await userEvent.tab()
		}
		await userEvent.keyboard("{ArrowRight}")
		await expect(
			within(dialog).getByRole("radio", { name: "Checklist" }),
		).toBeChecked()
	},
})
