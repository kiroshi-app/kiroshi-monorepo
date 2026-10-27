import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	botIdentityAvatars,
	companionGlyphOf,
	companionGlyphs,
	companionHueOf,
	pictureOf,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import {
	BotIdentityFields,
	type BotIdentityFieldsProps,
} from "@workspace/ui/components/bot-identity-fields"
import type { BotIdentity } from "@workspace/ui/components/bot-settings"
import { BLOT_HUES } from "@workspace/ui/components/companion-colour"

const BOT_ID = "bot-7"

const IDENTITY: BotIdentity = { blot: BLOT_HUES.blue }

const FieldsHost = (props: BotIdentityFieldsProps) => {
	const [identity, setIdentity] = useState(props.identity)
	const [hue, setHue] = useState(props.hue)

	return (
		<BotIdentityFields
			{...props}
			hue={hue}
			identity={identity}
			onHueChange={(next) => {
				setHue(next)
				props.onHueChange(next)
			}}
			onIdentityChange={(next) => {
				setIdentity(next)
				props.onIdentityChange(next)
			}}
		/>
	)
}

const chooseFile = (input: HTMLInputElement, file: File) => {
	const transfer = new DataTransfer()
	transfer.items.add(file)
	input.files = transfer.files
	input.dispatchEvent(new Event("change", { bubbles: true }))
}

const previewAvatar = (canvasElement: HTMLElement) => {
	const [preview] = botIdentityAvatars(canvasElement)
	if (!preview) throw new Error("The block is missing its preview")
	return preview
}

const pictureField = (canvasElement: HTMLElement) => {
	const [field] = slotsIn(canvasElement, "profile-picture-field")
	if (!field) throw new Error("The block is missing its picture field")
	return field
}

const meta = preview.meta({
	title: "Settings/Bot/BotIdentityFields",
	component: BotIdentityFields,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Everything a companion's face is made of, flat: what it looks like now, the eight colours that mark it, the option that takes the colour off and a hue of its own picked on a slider, and the field that takes a picture and takes it back off. The glyph itself is drawn from the companion's name, so there is no shape to pick. Nothing is behind a popover, a disclosure or a tab set: a reader sees every choice at once. The colour grid is a real radio group, so arrow keys move within it and the current choice is announced. Every swatch wears the companion's own glyph, so the row previews the actual outcome. The colour travels as a hue, 0 to 359 or null; the dialog holding the companion takes the picture off when a colour is picked, because the picture wins over it. The block never reads a file: it hands the host a `File` and waits for the picture to come back as `identity.image`. Only the preview moves, and only while `working`; the swatches always rest.",
			},
		},
	},
	args: {
		identity: IDENTITY,
		name: "Atlas",
		seed: BOT_ID,
		hue: 257,
		onHueChange: fn(),
		onIdentityChange: fn(),
		onAvatarUpload: fn(),
	},
	argTypes: {
		working: { control: "boolean" },
	},
	render: (args) => <FieldsHost {...args} />,
	decorators: [
		(Story) => (
			<div className="w-[30rem] rounded-2xl border border-border bg-background p-6">
				<Story />
			</div>
		),
	],
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The nominal case: a companion that already picked a blue colour. Check that the preview, the colour grid and the picture field stand at once with nothing to open first, that the current colour is the checked one, and that every swatch draws the companion's own glyph on its colour.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByRole("radio", { name: "Blue" })).toBeChecked()
		await expect(canvas.getAllByRole("radio")).toHaveLength(10)
		await expect(canvas.queryByRole("radio", { name: "Owl" })).toBeNull()
		await expect(
			companionGlyphs(canvasElement).every(
				(glyph) => glyph.getAttribute("aria-label") === "Atlas",
			),
		).toBe(true)
		await expect(
			canvas.getByRole("button", { name: "Add picture" }),
		).toBeVisible()
		await expect(canvas.queryByRole("dialog")).toBeNull()
		await expect(canvas.queryAllByRole("tab")).toHaveLength(0)
	},
})

export const PicksABlot = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"Picking a colour: the glyph stays and the colour behind it changes. Check that the pick reports the preset's hue and that the preview repaints onto the new colour at once.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: "Red" }))

		await expect(args.onHueChange).toHaveBeenLastCalledWith(42)
		await expect(canvas.getByRole("radio", { name: "Red" })).toBeChecked()
	},
})

export const TakesTheBlotOff = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The option that opens the row is the absence of a colour. It sits in the same radio group rather than beside it as a clear button, because wearing no colour is a choice a companion makes, not an undo. Check that it reports null and that the glyph is then drawn on no tile.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: "No colour" }))

		await expect(args.onHueChange).toHaveBeenLastCalledWith(null)
		await expect(
			companionHueOf(companionGlyphOf(previewAvatar(canvasElement))),
		).toBeUndefined()
	},
})

export const OwnHue = meta.story({
	args: { hue: 320 },
	globals: { theme_layout: "side-by-side" },
	parameters: {
		docs: {
			description: {
				story:
					"A companion wearing a hue of its own. Check in both themes that `Your hue` is the checked tile with its rainbow badge, that the header reads `Your hue · 320°`, that the hue panel stands open, and that the header avatar wears that hue.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const [ownHue] = canvas.getAllByRole("radio", { name: "Your hue" })
		await expect(ownHue).toBeChecked()
		await expect(canvas.getAllByText("Your hue · 320°")[0]).toBeVisible()
		await expect(
			companionHueOf(companionGlyphOf(previewAvatar(canvasElement))),
		).toBe(320)
	},
})

export const WithPicture = meta.story({
	args: { identity: { ...IDENTITY, image: UPLOADED_AVATAR_IMAGE } },
	parameters: {
		docs: {
			description: {
				story:
					"A companion wearing a picture. The preview shows the picture rather than the glyph, while the swatches keep showing what the companion would fall back to the moment a reader picks a colour. Check that the preview draws no glyph, and that the status line says the picture is what is on.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const preview = previewAvatar(canvasElement)

		await expect(await pictureOf(preview)).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)
		await expect(
			preview.querySelector('[data-slot="companion-field"]'),
		).toBeNull()
		await expect(canvas.getByText("Uploaded image")).toBeVisible()
	},
})

export const RemovesThePicture = meta.story({
	args: { identity: { ...IDENTITY, image: UPLOADED_AVATAR_IMAGE } },
	parameters: {
		docs: {
			description: {
				story:
					"Taking the picture off, from the picture field itself rather than by picking a colour to overwrite it. The remove button reports the identity the companion already carries, the same colour and no image, so the host clears the stored path on that one report and needs no command of its own. Check that the field falls back to the glyph the moment the identity comes back without an image, and that the button goes with the picture.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const field = pictureField(canvasElement)

		await expect(await pictureOf(field)).toHaveAttribute(
			"src",
			UPLOADED_AVATAR_IMAGE,
		)

		await userEvent.click(
			canvas.getByRole("button", { name: "Remove picture" }),
		)

		await expect(args.onIdentityChange).toHaveBeenCalledWith({
			blot: BLOT_HUES.blue,
		})
		await expect(field.querySelector("img")).toBeNull()
		await expect(companionGlyphOf(field)).toHaveAttribute("aria-label", "Atlas")
		await expect(
			canvas.queryByRole("button", { name: "Remove picture" }),
		).toBeNull()
	},
})

export const Working = meta.story({
	args: { working: true, workingKind: "writing" },
	parameters: {
		docs: {
			description: {
				story:
					"The block open on a companion mid-run. Only the preview performs the work, in the motion the host named; every swatch holds still, because a grid of working glyphs would say something about the companion that is not true. Check that exactly one glyph in here is doing anything.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [preview, ...choices] = companionGlyphs(canvasElement).map(
			(glyph) => glyph.dataset.state,
		)

		await expect(preview).toBe("writing")
		await expect(choices.every((state) => state === "idle")).toBe(true)
	},
})

export const ChoosesTheSameFileTwice = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who picks a file, crops it outside the app and picks the very same file again. The field clears its input after every choice, so the second pick is a change like any other and the host hears about it — without that, the second attempt is silence and the reader presses again harder. Check that both picks reach the host.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const input = canvas.getByLabelText<HTMLInputElement>("Avatar image file")
		const file = new File(["chosen"], "chosen.png", { type: "image/png" })

		chooseFile(input, file)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(file)
		await expect(input.value).toBe("")

		chooseFile(input, file)
		await expect(args.onAvatarUpload).toHaveBeenCalledTimes(2)
	},
})

export const DroppedAndPasted = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The two paths that never touch the file dialog: a file dropped on the zone, and a file pasted into it while it holds focus. Both hand the host the same `File`. The field is a real button, so it is a tab stop a paste can land in and Enter and Space open the dialog for a reader who has no file yet.",
			},
		},
	},
	play: async ({ args, canvas }) => {
		const dropzone = canvas.getByRole("button", { name: "Add picture" })

		const dropped = new File(["dropped"], "dropped.png", { type: "image/png" })
		const transfer = new DataTransfer()
		transfer.items.add(dropped)
		dropzone.dispatchEvent(
			new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
		)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(dropped)

		const pasted = new File(["pasted"], "pasted.png", { type: "image/png" })
		const clipboard = new DataTransfer()
		clipboard.items.add(pasted)
		dropzone.focus()
		await expect(dropzone).toHaveFocus()
		dropzone.dispatchEvent(
			new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard }),
		)
		await expect(args.onAvatarUpload).toHaveBeenCalledWith(pasted)
	},
})
