import { expect, fn, type UserEventObject, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import {
	LibraryCommentPin,
	type LibraryCommentPinProps,
	type LibraryCommentPinSurface,
} from "@workspace/ui/components/library-comment-pin"
import {
	ATLAS,
	STEVE,
} from "@workspace/ui/components/library-comments.fixtures"

const AUTHORS = [STEVE, ATLAS]

type PinMatrixProps = {
	surface: LibraryCommentPinSurface
	onClick: LibraryCommentPinProps["onClick"]
}

const PinMatrix = ({ surface, onClick }: PinMatrixProps) => (
	<div className="grid grid-cols-4 gap-6">
		{AUTHORS.map((author) => (
			<div className="contents" data-author={author.id} key={author.id}>
				<LibraryCommentPin
					author={author}
					id={`pin-focus-${author.id}`}
					onClick={onClick}
					surface={surface}
				/>
				<LibraryCommentPin
					author={author}
					onClick={onClick}
					state="selected"
					surface={surface}
				/>
				<LibraryCommentPin
					author={author}
					onClick={onClick}
					state="resolved"
					surface={surface}
				/>
				<LibraryCommentPin
					author={author}
					isDimmed
					onClick={onClick}
					surface={surface}
				/>
			</div>
		))}
	</div>
)

const expectPinStates = async (canvasElement: HTMLElement) => {
	const canvas = within(canvasElement)
	const [rest, selected, dimmed] = canvas.getAllByRole("button", {
		name: "Comment by Steve",
	})
	const resolved = canvas.getByRole("button", {
		name: "Resolved comment by Steve",
	})

	await expect(rest).toHaveAttribute("aria-expanded", "false")
	await expect(selected).toHaveAttribute("aria-expanded", "true")
	await expect(getComputedStyle(selected).backgroundColor).not.toBe(
		getComputedStyle(rest).backgroundColor,
	)
	await expect(getComputedStyle(dimmed).opacity).toBe("0.45")
	await expect(getComputedStyle(rest).transitionProperty).toBe("none")
	await expect(getComputedStyle(rest).borderBottomLeftRadius).toBe("4px")

	await expect(slotIn(rest, "library-comment-avatar")).toHaveAttribute(
		"data-author-kind",
		"person",
	)
	await expect(slotIn(rest, "library-comment-person")).toBeVisible()
	await expect(slotIn(resolved, "library-comment-pin-check")).toBeVisible()
	await expect(
		resolved.querySelector('[data-slot="library-comment-avatar"]'),
	).toBe(null)

	const [agentRest] = canvas.getAllByRole("button", {
		name: "Comment by Atlas",
	})
	await expect(slotIn(agentRest, "bot-identity-avatar")).toBeVisible()
}

const expectFocusRing = async (
	canvasElement: HTMLElement,
	userEvent: UserEventObject,
) => {
	await userEvent.tab()
	const [rest] = within(canvasElement).getAllByRole("button", {
		name: "Comment by Steve",
	})
	await expect(rest).toHaveFocus()
	await expect(getComputedStyle(rest).outlineStyle).toBe("solid")
	await expect(getComputedStyle(rest).outlineWidth).toBe("2px")
}

const meta = preview.meta({
	title: "Navigation/LibraryCommentPin",
	component: LibraryCommentPin,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The mark a comment thread leaves on a Library document, board or image: a 32 px drop pointing at its anchor from the bottom left corner, holding the author, round for a person and hexagonal for an agent. It is a button that opens its thread; `state` draws it at rest, selected while its thread or a new comment is open, or resolved; `isDimmed` fades it above a resolved thread; `surface` is `stage` on the image viewer.",
			},
		},
		pseudo: { focusVisible: "#pin-focus-atlas" },
	},
	args: { author: STEVE, onClick: fn() },
})

export const States = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A person then an agent, each at rest, selected, resolved and dimmed, on a document. Check the selected pin wears the Space colour, the resolved pin swaps the author for a check on the Space colour, the dimmed pin sits at 45 percent, the corner at the bottom left is 4 px, the person is round and the agent hexagonal, no colour changes over time, and the first agent pin shows the keyboard focus ring.",
			},
		},
	},
	render: (args) => (
		<div className="bg-card p-10" {...hueScopeOf("blue")}>
			<PinMatrix onClick={args.onClick} surface="page" />
		</div>
	),
	play: async ({ canvasElement, userEvent }) => {
		await expectPinStates(canvasElement)
		await expectFocusRing(canvasElement, userEvent)
	},
})

export const StatesDark = meta.story({
	globals: { theme: "dark" },
	render: States.input.render,
	play: States.input.play,
})

export const OnImageStage = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The same eight pins on the image viewer's stage, which is dark in both themes. Check the pin stays light over the image, with a deeper shadow and no ring.",
			},
		},
	},
	render: (args) => (
		<div
			className="dark bg-[#6f8aa0] p-10 text-foreground"
			{...hueScopeOf("blue")}
		>
			<PinMatrix onClick={args.onClick} surface="stage" />
		</div>
	),
	play: async ({ canvasElement }) => {
		await expectPinStates(canvasElement)
		const [rest] = within(canvasElement).getAllByRole("button", {
			name: "Comment by Steve",
		})
		await expect(getComputedStyle(rest).backgroundColor).toBe(
			"rgb(255, 255, 255)",
		)
	},
})

export const Pressed = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One pin at rest. Check a press reports once, by pointer and by keyboard.",
			},
		},
	},
	render: (args) => (
		<div className="bg-card p-10" {...hueScopeOf("blue")}>
			<LibraryCommentPin {...args} />
		</div>
	),
	play: async ({ args, canvas, userEvent }) => {
		const pin = canvas.getByRole("button", { name: "Comment by Steve" })
		await userEvent.click(pin)
		await userEvent.keyboard("{Enter}")
		await expect(args.onClick).toHaveBeenCalledTimes(2)
	},
})
