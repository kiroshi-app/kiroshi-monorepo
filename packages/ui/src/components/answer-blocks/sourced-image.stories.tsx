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

const meta = preview.meta({
	title: "Conversation/Markdown/SourcedImage",
	component: SourcedImage,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"One picture the agent found, with the site it came from over its corner, a title and a row of chips under it. Reach for it when the answer is about a single place or object the reader recognises by sight; `Gallery` covers several pictures of the same thing. The save button shows only when `imageMenu` carries `onSaveToLibrary`, and hands it the picture.",
			},
		},
	},
	args: {
		image: { src: CASA_DO_RIO_TERRACE },
		title: "Casa do Rio, a terrace over the Tagus",
		source: { domain: "casadorio.pt", favicon: CASA_DO_RIO_FAVICON },
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
					"Artboard 5. The picture carries no alt text, so it takes the title as its name. Check the status chip leads in the success token and the save button hands the picture to `imageMenu.onSaveToLibrary`.",
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
					"A 320 wide column with an unbroken title and a long domain. Check the title wraps, the domain truncates inside its pill, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
