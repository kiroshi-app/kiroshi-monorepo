import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn, slotsIn } from "@workspace/storybook/story-utils"
import {
	COMMENT_COUNTS,
	LONG_COMMENT,
	LONG_NAMED_PERSON,
	OPEN_THREADS,
	RESOLVED_THREADS,
	UNBREAKABLE,
} from "@workspace/ui/components/library-comments.fixtures"
import {
	LibraryCommentsList,
	type LibraryCommentsListProps,
} from "@workspace/ui/components/library-comments-list"

const MANY_THREADS = Array.from({ length: 10 }, (_, round) =>
	RESOLVED_THREADS.map((thread) => ({
		...thread,
		id: `${thread.id}-${round}`,
	})),
).flat()

const rowLinesIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-comments-row-line").map(
		(line) => line.textContent,
	)

const LIST_ARGS: LibraryCommentsListProps = {
	tab: "resolved",
	counts: COMMENT_COUNTS,
	threads: RESOLVED_THREADS,
	onTabChange: fn(),
	onOpenThread: fn(),
}

const meta = preview.meta({
	title: "Navigation/LibraryCommentsList",
	component: LibraryCommentsList,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"Every comment thread of a Library document, board or image, in the popover the bar counter opens: an Open and a Resolved tab with their counts, then one row per thread with its author, reply count, date, first comment and the line naming what it is on. A row opens its thread. The caller hands the rows of the selected tab; an empty tab says so. The list is 380 px wide, narrows with its container and scrolls past 480 px.",
			},
		},
	},
	args: LIST_ARGS,
	decorators: [
		(Story) => (
			<div
				className="w-120 max-w-full bg-background p-10 dark:bg-card"
				data-slot="list-page"
				{...hueScopeOf("blue")}
			>
				<Story />
			</div>
		),
	],
})

export const ResolvedTab = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The Resolved tab, as artboard Resolved 1 draws it. Check the two tabs carry their counts and Resolved is selected, each row reads author, replies and date, with no count for a thread nobody replied to and a singular for one reply, a person's avatar is round and an agent's hexagonal, the last row says its text is gone, a row opens its thread, and the arrow keys move between the tabs.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const canvas = within(canvasElement)
		const open = canvas.getByRole("tab", { name: "Open 3" })
		const resolved = canvas.getByRole("tab", { name: "Resolved 4" })
		await expect(resolved).toHaveAttribute("aria-selected", "true")
		await expect(getComputedStyle(resolved).transitionProperty).toBe("none")

		await expect(rowLinesIn(canvasElement)).toEqual([
			"Steve · 3 replies · Today",
			"Lena Ortiz · 1 reply · Yesterday",
			"Atlas · Nov 10",
			"Marta Silva · Nov 8",
		])
		const rows = slotsIn(canvasElement, "library-comments-row")
		await expect(slotIn(rows[0], "library-comment-person")).toBeVisible()
		await expect(slotIn(rows[2], "bot-identity-avatar")).toBeVisible()
		await expect(rows[3]).toHaveTextContent(
			"On text that’s no longer in the document",
		)

		await userEvent.click(rows[1])
		await expect(args.onOpenThread).toHaveBeenCalledWith("thread-terrace")

		await userEvent.click(open)
		await expect(args.onTabChange).toHaveBeenCalledWith(
			"open",
			expect.anything(),
		)
	},
})

export const ResolvedTabDark = meta.story({
	globals: { theme: "dark" },
	play: ResolvedTab.input.play,
})

export const OpenTab = meta.story({
	args: { tab: "open", threads: OPEN_THREADS },
	parameters: {
		docs: {
			description: {
				story:
					"The Open tab selected. Check Open is the selected tab and its three rows are listed.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("tab", { name: "Open 3" }),
		).toHaveAttribute("aria-selected", "true")
		await expect(slotsIn(canvasElement, "library-comments-row")).toHaveLength(3)
	},
})

export const OpenTabDark = meta.story({
	args: OpenTab.input.args,
	globals: { theme: "dark" },
	play: OpenTab.input.play,
})

export const EmptyTab = meta.story({
	args: { tab: "open", counts: { open: 0, resolved: 4 }, threads: [] },
	parameters: {
		docs: {
			description: {
				story:
					"A tab with no thread: every comment was resolved. Check the Open tab shows 0 and the panel says there are no open comments instead of staying blank.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			within(canvasElement).getByRole("tab", { name: "Open 0" }),
		).toHaveAttribute("aria-selected", "true")
		await expect(
			slotIn(canvasElement, "library-comments-empty"),
		).toHaveTextContent("No open comments")
	},
})

export const EmptyTabDark = meta.story({
	args: EmptyTab.input.args,
	globals: { theme: "dark" },
	play: EmptyTab.input.play,
})

export const LongContent = meta.story({
	args: {
		counts: { open: 128, resolved: 2048 },
		threads: [
			{
				id: "thread-long",
				author: LONG_NAMED_PERSON,
				replyCount: 1200,
				date: LONG_COMMENT.time,
				comment: LONG_COMMENT.body,
				anchor: `On “${UNBREAKABLE}”`,
			},
			...MANY_THREADS,
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"Forty one threads, the first with a long name, an unbreakable link and several sentences, in a 320 px page. Check nothing overflows sideways, the first comment is cut at two lines, and the rows scroll inside the list instead of growing it past 480 px.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "list-page")
		page.style.width = "320px"
		const list = slotIn(canvasElement, "library-comments-list")
		const panel = within(canvasElement).getByRole("tabpanel")

		await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
		await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth)
		await expect(panel.clientHeight).toBeLessThanOrEqual(480)
		await expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight)
	},
})
