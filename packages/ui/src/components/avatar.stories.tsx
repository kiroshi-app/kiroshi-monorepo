import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { UPLOADED_AVATAR_IMAGE } from "@workspace/storybook/story-utils"
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "@workspace/ui/components/ui/avatar"

const NAME = "Ada Martin"

const meta = preview.meta({
	title: "Primitives/Avatar",
	component: Avatar,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The avatar as the shadcn registry ships it: a root that picks a size from the closed set `sm`, `default`, `lg` - 24, 32 and 40 pixels - with `AvatarImage` and `AvatarFallback` swapping on load. Reach for `InitialsAvatar` when the size comes from the caller in pixels or the initials have to be derived from a name.",
			},
		},
	},
})

export const Default = meta.story({
	render: () => (
		<Avatar>
			<AvatarImage alt={NAME} src={UPLOADED_AVATAR_IMAGE} />
			<AvatarFallback>AM</AvatarFallback>
		</Avatar>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A loaded picture at the default 32px. Check the image fills the circle by covering rather than stretching, so a non-square upload is cropped instead of skewed.",
			},
		},
	},
	play: async ({ canvas }) => {
		const image = await canvas.findByAltText(NAME)

		await expect(getComputedStyle(image).objectFit).toBe("cover")
	},
})

export const Empty = meta.story({
	render: () => (
		<Avatar>
			<AvatarFallback>AM</AvatarFallback>
		</Avatar>
	),
	parameters: {
		docs: {
			description: {
				story:
					"No image at all, the state a reader who never uploaded one sits in. Check the fallback shows immediately instead of flashing an empty circle first.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByText("AM")).toBeVisible()
	},
})

export const WithBadge = meta.story({
	tags: ["test-only"],
	render: () => (
		<Avatar>
			<AvatarFallback>AM</AvatarFallback>
			<AvatarBadge />
		</Avatar>
	),
	parameters: {
		docs: {
			description: {
				story:
					"`AvatarBadge` pins a mark to the bottom corner and sizes it from the avatar's own size. Check it keeps the ring that lifts it off whatever is behind the avatar.",
			},
		},
	},
})

export const InGroup = meta.story({
	tags: ["test-only"],
	render: () => (
		<AvatarGroup>
			<Avatar>
				<AvatarFallback>AM</AvatarFallback>
			</Avatar>
			<Avatar>
				<AvatarFallback>LR</AvatarFallback>
			</Avatar>
			<AvatarGroupCount>+3</AvatarGroupCount>
		</AvatarGroup>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Several avatars overlapped, with `AvatarGroupCount` closing the row. Check the overlap keeps each ring visible so the faces stay countable, and pick `Navigation/ConversationSubjectIcon` for a conversation, which is a different component.",
			},
		},
	},
})
