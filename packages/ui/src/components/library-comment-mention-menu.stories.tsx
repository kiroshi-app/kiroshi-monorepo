import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import { LibraryCommentMentionMenu } from "@workspace/ui/components/library-comment-mention-menu"
import {
	ATLAS,
	COMMENT_PARTICIPANTS,
	LENA,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
} from "@workspace/ui/components/library-comments.fixtures"

const namesIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-comment-mention-name").map(
		(name) => name.textContent,
	)

const meta = preview.meta({
	title: "Navigation/LibraryCommentMentionMenu",
	component: LibraryCommentMentionMenu,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"The menu a comment field opens on @, hung 12 px under whatever it wraps and as wide: the agents of the Space, each with its hexagonal avatar and its role, then the people, each with a round avatar. `query` narrows both groups by name; a group with no match is not drawn, and the menu closes when nobody matches. Down and Up move the active row, Enter or Tab picks it, Escape and a click outside dismiss.",
			},
		},
	},
	args: {
		participants: COMMENT_PARTICIPANTS,
		open: true,
		query: "",
		onSelect: fn(),
		onDismiss: fn(),
		children: null,
	},
	render: (args) => (
		<div
			className="w-110 max-w-full bg-background p-10 pb-72 dark:bg-card"
			data-slot="menu-page"
			{...hueScopeOf("blue")}
		>
			<LibraryCommentMentionMenu {...args}>
				<div className="h-10 rounded-control bg-comment-card shadow-comment-card" />
			</LibraryCommentMentionMenu>
		</div>
	),
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The menu open on an empty query, as artboard Thread 2 draws it. Check Agents come before People, the first row is active, Down then Enter picks Juniper, a click picks a person, and Escape dismisses.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const menu = within(canvasElement).getByRole("listbox", {
			name: "Mention",
		})
		await expect(namesIn(canvasElement)).toEqual([
			"Atlas",
			"Juniper",
			"Lena Ortiz",
			"Marta Silva",
		])
		await expect(
			within(menu)
				.getAllByRole("group")
				.map((group) => group.getAttribute("aria-labelledby"))
				.map((id) => canvasElement.ownerDocument.getElementById(id ?? ""))
				.map((label) => label?.textContent),
		).toEqual(["Agents", "People"])

		const [atlas, juniper] = within(menu).getAllByRole("option")
		await expect(atlas).toHaveAttribute("aria-selected", "true")
		await expect(getComputedStyle(atlas).transitionProperty).toBe("none")

		await userEvent.keyboard("{ArrowDown}")
		await expect(juniper).toHaveAttribute("aria-selected", "true")
		await userEvent.keyboard("{Enter}")
		await expect(args.onSelect).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: "juniper" }),
		)

		await userEvent.click(
			within(menu).getByRole("option", { name: "Lena Ortiz" }),
		)
		await expect(args.onSelect).toHaveBeenLastCalledWith(LENA)

		await userEvent.keyboard("{Escape}")
		await expect(args.onDismiss).toHaveBeenCalled()
	},
})

export const DefaultDark = meta.story({
	globals: { theme: "dark" },
	play: Default.input.play,
})

export const Narrowed = meta.story({
	args: { query: "at" },
	parameters: {
		docs: {
			description: {
				story:
					"The query narrowed to one agent. Check only Atlas is listed, under Agents, and the People group is not drawn.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(namesIn(canvasElement)).toEqual([ATLAS.name])
		await expect(within(canvasElement).getAllByRole("group")).toHaveLength(1)
	},
})

export const NobodyMatches = meta.story({
	args: { query: "zzz" },
	parameters: {
		docs: {
			description: {
				story:
					"A query nobody matches. Check the menu is not drawn at all rather than left empty.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).queryByRole("listbox")).toBe(null)
	},
})

export const LongNames = meta.story({
	args: { participants: [LONG_NAMED_AGENT, LONG_NAMED_PERSON] },
	parameters: {
		docs: {
			description: {
				story:
					"Two long names and a long role in a 320 px page. Check the names and the role wrap inside their row and nothing overflows the menu sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "menu-page")
		page.style.width = "320px"
		const menu = within(canvasElement).getByRole("listbox")

		await expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth)
		await expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(
			page.getBoundingClientRect().right,
		)
	},
})

export const LongNamesDark = meta.story({
	args: LongNames.input.args,
	globals: { theme: "dark" },
	play: LongNames.input.play,
})
