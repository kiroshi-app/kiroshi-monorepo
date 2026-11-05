import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	boxOf,
	expectRoundAvatar,
	pictureOf,
	slotsIn,
	UPLOADED_AVATAR_IMAGE,
} from "@workspace/storybook/story-utils"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"

const NAME = "Ada Martin"

const meta = preview.meta({
	title: "Primitives/InitialsAvatar",
	component: InitialsAvatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The reader's own face, wherever the app shows it: the sidebar chip and the breadcrumb of their settings. One rendering for both, so a picture uploaded in the dialog is the picture the chip wears, and a reader with no picture wears the same initials in both. It draws and nothing else — no name beside it, no press target, no layout around it. `size` is the only thing a call site changes; the initials scale with it.",
			},
		},
	},
	args: { name: NAME },
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A reader who has filled in a name but uploaded no picture. Check that the initials are the first letter of the first two words, upper case whatever the name's own casing, and that they sit inside a circle: only a companion is hexagonal. Pick `WithPicture` for the uploaded one.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const initials = canvas.getByText("AM")

		await expect(initials).toBeVisible()
		await expectRoundAvatar(slotsIn(canvasElement, "user-avatar")[0])
	},
})

export const WithPicture = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who uploaded a picture. Check that it wins over the initials, that it fills the circle by covering rather than stretching, and that it stays out of the accessible tree — the row around it already carries the name, and an avatar announcing it again would say it twice. Pick `Default` for the initials.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const [avatar] = slotsIn(canvasElement, "user-avatar")
		const image = await pictureOf(avatar)

		await expect(image).toHaveAttribute("aria-hidden", "true")
		await expect(getComputedStyle(image).objectFit).toBe("cover")
	},
})

const expectBarePicture = async (canvasElement: HTMLElement) => {
	const [avatar] = slotsIn(canvasElement, "user-avatar")
	const picture = await pictureOf(avatar)

	for (const layer of [avatar, picture]) {
		const style = getComputedStyle(layer)
		await expect(style.outlineStyle).toBe("none")
		await expect(style.borderTopWidth).toBe("0px")
	}
	await expectRoundAvatar(avatar)
}

export const PictureLight = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE },
	globals: { theme: "light" },
	parameters: {
		docs: {
			description: {
				story:
					"An uploaded picture in the light theme, cut to a circle with nothing drawn around it: no hairline, no border. Only a companion is hexagonal. Pick `PictureDark` for the dark theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectBarePicture(canvasElement),
})

export const PictureDark = meta.story({
	args: { image: UPLOADED_AVATAR_IMAGE },
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The same picture in the dark theme: the circle alone, with no edge left around it on the dark surface. Pick `PictureLight` for the light theme.",
			},
		},
	},
	play: ({ canvasElement }) => expectBarePicture(canvasElement),
})

export const Empty = meta.story({
	args: { name: "" },
	parameters: {
		docs: {
			description: {
				story:
					"A reader who never filled a name in. Check that the circle reads `Y` for `You` rather than sitting blank — an avatar with nothing in it is indistinguishable from one that failed to load. Pick `Default` for the named reader.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("Y")).toBeVisible()
	},
})

export const Sizes = meta.story({
	tags: ["test-only"],
	render: () => (
		<div className="flex items-center gap-4">
			<InitialsAvatar name={NAME} size={28} />
			<InitialsAvatar name={NAME} size={32} />
			<InitialsAvatar image={UPLOADED_AVATAR_IMAGE} name={NAME} size={64} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The two sizes in use — 28 in the sidebar chip, 32 in the settings breadcrumb — and a large one to show the rule holds. Check that the initials grow with the circle instead of staying pinned at one size and floating in a large one.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const heights = slotsIn(canvasElement, "user-avatar").map(
			(avatar) => avatar.getBoundingClientRect().height,
		)

		await expect(heights).toEqual([28, 32, 64])
	},
})

const IN_MESSAGE_SIZES = [16, 20, 28, 40, 64]

export const PictureInMessageAtEverySize = meta.story({
	tags: ["test-only"],
	render: () => (
		<MessageBubble>
			<MessageBubbleContent>
				{IN_MESSAGE_SIZES.map((size) => (
					<InitialsAvatar
						image={UPLOADED_AVATAR_IMAGE}
						key={size}
						name={NAME}
						size={size}
					/>
				))}
			</MessageBubbleContent>
		</MessageBubble>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An uploaded picture at five sizes inside a message bubble, whose typeset spaces only the message's own images. Check that each picture fills its circle exactly at every size, with no gap above it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const avatars = slotsIn(canvasElement, "user-avatar")

		await expect(
			avatars.map((avatar) => avatar.getBoundingClientRect().width),
		).toEqual(IN_MESSAGE_SIZES)
		for (const avatar of avatars)
			await expect(boxOf(await pictureOf(avatar))).toEqual(boxOf(avatar))
	},
})
