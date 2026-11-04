import { expect, fn, screen, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
	isInBrowserRunner,
	resolvedRootColor,
	slotIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	CASA_DO_RIO_FAVICON,
	CASA_DO_RIO_TERRACE,
} from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { SourcedImage } from "@workspace/ui/components/answer-blocks/sourced-image"

const CASA_DO_RIO_PAGE = "https://casadorio.pt/terrace"

const IMAGE_SLOT_HEIGHT = 300

const expectSourceAboveTitle = async (canvasElement: HTMLElement) => {
	const source = slotIn(canvasElement, "sourced-image-source")
	const title = source.nextElementSibling
	if (!title) throw new Error("No title under the source line")

	await expect(source.closest("figcaption")).not.toBeNull()
	await expect(
		title.getBoundingClientRect().top - source.getBoundingClientRect().bottom,
	).toBe(4)
}

const meta = preview.meta({
	title: "Conversation/Markdown/SourcedImage",
	component: SourcedImage,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One picture the agent found, with a caption under it: the site it came from, the title 4 below it, then a row of chips. Reach for it when the answer is about a single place or object the reader recognises by sight; `Gallery` covers several pictures of the same thing. The save button shows only when `imageMenu` carries `onSaveToLibrary`, and hands it the picture. `isUnavailable` swaps the picture for a frame of the same slot that links to the source page.",
			},
		},
	},
	args: {
		image: { src: CASA_DO_RIO_TERRACE },
		title: "Casa do Rio, a terrace over the Tagus",
		source: {
			domain: "casadorio.pt",
			url: CASA_DO_RIO_PAGE,
			favicon: CASA_DO_RIO_FAVICON,
		},
		status: "Open now",
		chips: ["€€", "Seafood", "4.6 rating"],
		imageMenu: { onSaveToLibrary: fn() },
	},
	render: (args) => (
		<AgentAnswerFrame intro="This is the place I had in mind for Saturday dinner.">
			<SourcedImage {...args} />
		</AgentAnswerFrame>
	),
})

export const InAgentAnswer = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard 5, with the source line of the Caption line direction. The picture carries no alt text, so it takes the title as its name. Check that nothing sits over the picture but the save button, that the site and its favicon lead the caption 4 above the title, that the status chip leads in the success token and that the save button hands the picture to `imageMenu.onSaveToLibrary`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(
			canvas.getByRole("img", {
				name: "Casa do Rio, a terrace over the Tagus",
			}),
		).toBeVisible()
		await expect(
			getComputedStyle(slotIn(canvasElement, "sourced-image-status")).color,
		).toBe(resolvedRootColor("--success"))
		await expectSourceAboveTitle(canvasElement)
		await userEvent.click(
			canvas.getByRole("button", { name: "Save the image" }),
		)
		await expect(args.imageMenu?.onSaveToLibrary).toHaveBeenCalledWith(
			args.image,
		)
	},
})

export const Pending = meta.story({
	globals: { theme: "dark" },
	args: { isSaving: true },
	parameters: {
		docs: {
			description: {
				story:
					"The picture is on its way to the Library. Check the loader spins where the bookmark was, holds still under reduced motion, the button keeps focus, reads Saving the image… and ignores a second press, and that the right-click menu offers Save to Library disabled.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const save = canvas.getByRole("button", { name: "Saving the image…" })

		await expect(save).toHaveAttribute("aria-disabled", "true")
		await expect(save).toHaveAttribute("aria-busy", "true")
		const loader = slotIn(canvasElement, "sourced-image-saving")
		await expect(loader).toBeVisible()
		await userEvent.click(save)
		await expect(save).toHaveFocus()
		await expect(args.imageMenu?.onSaveToLibrary).not.toHaveBeenCalled()

		await userEvent.pointer({
			keys: "[MouseRight]",
			target: canvas.getByRole("img", {
				name: "Casa do Rio, a terrace over the Tagus",
			}),
		})
		const menu = await screen.findByRole("menu")
		await expect(
			within(menu).getByRole("menuitem", { name: "Save to Library" }),
		).toHaveAttribute("aria-disabled", "true")
		await userEvent.keyboard("{Escape}")

		if (!isInBrowserRunner()) return
		await expect(getComputedStyle(loader).animationName).toBe("none")
		await withMotionAllowed(() =>
			expect(getComputedStyle(loader).animationName).toBe("spin"),
		)
	},
})

export const InNarrowColumn = meta.story({
	args: {
		title: "CasadoRioterraceovertheTagusatsunsetwithbridgeview",
		source: {
			domain: "reservations.casadorio-lisboa-alfama-riverside.pt",
			url: CASA_DO_RIO_PAGE,
			favicon: CASA_DO_RIO_FAVICON,
		},
	},
	render: (args) => (
		<AgentAnswerFrame intro="This is the place I had in mind." width={320}>
			<SourcedImage {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column with an unbroken title and a long domain. Check the title wraps, the domain truncates in the caption line, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})

export const Unavailable = meta.story({
	args: { isUnavailable: true },
	parameters: {
		docs: {
			description: {
				story:
					"The picture could not be loaded. Check that the frame keeps the 300 slot and the radius of a loaded picture on the muted surface, centres the image-off icon, Image unavailable and Open original, offers no save button, and that the caption line, title and chips stay as they are.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const frame = slotIn(canvasElement, "sourced-image-unavailable")
		const link = canvas.getByRole("link", { name: "Open original" })

		await expect(frame.getBoundingClientRect().height).toBe(IMAGE_SLOT_HEIGHT)
		await expect(canvas.getByText("Image unavailable")).toBeVisible()
		await expect(link).toHaveAttribute("href", CASA_DO_RIO_PAGE)
		await expect(link).toHaveAttribute("target", "_blank")
		await expect(link).toHaveAttribute("rel", "noreferrer noopener")
		await expect(
			canvas.queryByRole("button", { name: "Save the image" }),
		).toBeNull()
		await expect(canvas.getByText("Open now")).toBeVisible()
		await expectSourceAboveTitle(canvasElement)
	},
})
