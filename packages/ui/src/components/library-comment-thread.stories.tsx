import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf, slotIn } from "@workspace/storybook/story-utils"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import {
	LibraryCommentThread,
	type LibraryCommentThreadProps,
} from "@workspace/ui/components/library-comment-thread"
import {
	AGENT_REPLY,
	ATLAS,
	COMMENT_PARTICIPANTS,
	FIRST_COMMENT,
	LONG_COMMENT,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
	MEMBER_REPLY,
	PASSAGE_ANCHOR,
	UNBREAKABLE,
} from "@workspace/ui/components/library-comments.fixtures"

const ThreadOnPage = ({
	reply: initialReply,
	onReplyChange,
	...props
}: LibraryCommentThreadProps) => {
	const [reply, setReply] = useState(initialReply)
	const isResolved = props.resolution !== undefined

	return (
		<div
			className="flex w-110 max-w-full flex-col items-start gap-3 bg-background p-10 dark:bg-card"
			data-slot="thread-page"
			{...hueScopeOf("blue")}
		>
			<LibraryCommentPin
				author={props.comments[0].author}
				isDimmed={isResolved}
				state={isResolved ? "rest" : "selected"}
			/>
			<LibraryCommentThread
				{...props}
				onReplyChange={(next) => {
					setReply(next)
					onReplyChange(next)
				}}
				reply={reply}
			/>
		</div>
	)
}

const threadIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "library-comment-thread")

const authorsIn = (canvasElement: HTMLElement) =>
	Array.from(
		canvasElement.querySelectorAll('[data-slot="library-comment"]'),
		(comment) => slotIn(comment, "library-comment-avatar").dataset.authorKind,
	)

const THREAD_ARGS: LibraryCommentThreadProps = {
	anchor: PASSAGE_ANCHOR,
	comments: [FIRST_COMMENT],
	participants: COMMENT_PARTICIPANTS,
	reply: "",
	onReplyChange: fn(),
	onReply: fn(),
	onResolve: fn(),
	onReopen: fn(),
	onMore: fn(),
	onClose: fn(),
}

const meta = preview.meta({
	title: "Navigation/LibraryCommentThread",
	component: LibraryCommentThread,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One comment thread, under its pin: the line naming what it is on, Resolve, More and Close, More drawn only when `onMore` is passed, the first comment and its replies, each with a round avatar for a person and a hexagonal one for an agent, then the reply field. `workingAgent` adds the row of a mentioned agent at work. `resolution` turns the card into its resolved form: no Resolve, the replies folded into one line in the Space colour, and a footer naming who resolved it, with Reopen. An anchor of `{ gone }` words a target that no longer exists. The card is 360 px wide and narrows with its container.",
			},
		},
	},
	args: THREAD_ARGS,
	render: (args) => <ThreadOnPage {...args} />,
})

export const FirstComment = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A thread holding its first comment, as artboard Thread 3 draws it. Check the anchor line, that Resolve, More and Close are named, report once each and change colour instantly, that the mention in the comment wears the Space colour, that the reply field shows its placeholder beside a disabled Send, and that a typed reply sends on Enter.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const thread = within(threadIn(canvasElement))
		await expect(
			slotIn(canvasElement, "library-comment-anchor"),
		).toHaveTextContent(PASSAGE_ANCHOR)

		const resolve = thread.getByRole("button", { name: "Resolve" })
		await expect(getComputedStyle(resolve).transitionProperty).toBe("none")
		await userEvent.click(resolve)
		await userEvent.click(thread.getByRole("button", { name: "More" }))
		await userEvent.click(thread.getByRole("button", { name: "Close" }))
		await expect(args.onResolve).toHaveBeenCalledOnce()
		await expect(args.onMore).toHaveBeenCalledOnce()
		await expect(args.onClose).toHaveBeenCalledOnce()

		const send = thread.getByRole("button", { name: "Send" })
		await expect(
			slotIn(canvasElement, "library-comment-mention"),
		).toHaveTextContent("@Atlas")
		await expect(send).toBeDisabled()

		const field = thread.getByRole("textbox", { name: "Reply, @ to mention" })
		await userEvent.type(field, "On it.")
		await expect(send).toBeEnabled()
		await expect(
			getComputedStyle(slotIn(canvasElement, "library-comment-mention")).color,
		).toBe(getComputedStyle(send).backgroundColor)
		await userEvent.keyboard("{Enter}")
		await expect(args.onReply).toHaveBeenCalledOnce()
	},
})

export const FirstCommentDark = meta.story({
	globals: { theme: "dark" },
	play: FirstComment.input.play,
})

export const WithoutMore = meta.story({
	args: { onMore: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A thread given no `onMore`. Check the header holds Resolve and Close alone, side by side, with no button named More and nothing left where it stood.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const thread = within(threadIn(canvasElement))
		await expect(thread.queryByRole("button", { name: "More" })).toBe(null)

		const resolve = thread.getByRole("button", { name: "Resolve" })
		const close = thread.getByRole("button", { name: "Close" })
		await expect(resolve.parentElement?.childElementCount).toBe(2)
		await expect(resolve.nextElementSibling).toBe(close)
	},
})

export const AgentAtWork = meta.story({
	args: { workingAgent: ATLAS },
	parameters: {
		docs: {
			description: {
				story:
					"The agent the first comment mentions is at work, as artboard Thread 4 draws it. Check the row names the agent as a status, under the comment and above the reply field, with its hexagonal avatar.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const working = within(canvasElement).getByRole("status")
		await expect(working).toHaveTextContent("Atlas is working on it")
		await expect(slotIn(working, "bot-identity-avatar")).toBeVisible()
		await expect(
			slotIn(canvasElement, "library-comment").compareDocumentPosition(working),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		await expect(
			working.compareDocumentPosition(
				slotIn(canvasElement, "library-comment-reply"),
			),
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
	},
})

export const AgentAtWorkDark = meta.story({
	args: AgentAtWork.input.args,
	globals: { theme: "dark" },
	play: AgentAtWork.input.play,
})

export const Replies = meta.story({
	args: { comments: [FIRST_COMMENT, MEMBER_REPLY, AGENT_REPLY] },
	parameters: {
		docs: {
			description: {
				story:
					"A member then an agent replied, as artboards Thread 5 and Edge 3 draw it. Check the three comments in order, round avatars for the two people and a hexagon for the agent, and that typing @ in the reply field opens the mention menu under the card.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await expect(authorsIn(canvasElement)).toEqual([
			"person",
			"person",
			"agent",
		])

		const field = within(canvasElement).getByRole("textbox", {
			name: "Reply, @ to mention",
		})
		await userEvent.type(field, "@jun")
		const menu = await within(canvasElement).findByRole("listbox", {
			name: "Mention",
		})
		await expect(menu.getBoundingClientRect().top).toBeGreaterThan(
			threadIn(canvasElement).getBoundingClientRect().bottom,
		)
		await userEvent.keyboard("{Enter}")
		await expect(field).toHaveValue("@Juniper ")
	},
})

export const RepliesDark = meta.story({
	args: Replies.input.args,
	globals: { theme: "dark" },
	play: Replies.input.play,
})

export const TargetGone = meta.story({
	args: {
		anchor: { gone: "text" },
		comments: [FIRST_COMMENT, MEMBER_REPLY],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The passage the thread was on was deleted, as artboard Edge 1 draws it. Check the anchor line says so and the thread stays open: Resolve and the reply field are still there.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const thread = within(threadIn(canvasElement))
		await expect(
			slotIn(canvasElement, "library-comment-anchor"),
		).toHaveTextContent("On text that’s no longer in the document")
		await expect(thread.getByRole("button", { name: "Resolve" })).toBeVisible()
		await expect(
			thread.getByRole("textbox", { name: "Reply, @ to mention" }),
		).toBeVisible()
	},
})

export const TargetGoneDark = meta.story({
	args: TargetGone.input.args,
	globals: { theme: "dark" },
	play: TargetGone.input.play,
})

export const ShapeGone = meta.story({
	args: {
		anchor: { gone: "shape" },
		comments: [MEMBER_REPLY, AGENT_REPLY],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The shape the thread was on was removed from its board, as artboards Edge 2 and Edge 4 draw it. Check the anchor line names the shape and the board.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "library-comment-anchor"),
		).toHaveTextContent("On a shape that’s no longer on the board")
	},
})

export const ShapeGoneDark = meta.story({
	args: ShapeGone.input.args,
	globals: { theme: "dark" },
	play: ShapeGone.input.play,
})

export const Resolved = meta.story({
	args: {
		comments: [
			{
				...FIRST_COMMENT,
				time: "12 min",
				body: "Can we push the boat to 17:30? The second session always runs late.",
			},
			MEMBER_REPLY,
			AGENT_REPLY,
		],
		resolution: { by: "Steve", time: "1 min" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A resolved thread, as artboards Thread 6 and Resolved 2 draw it. Check Resolve and the reply field are gone, only the first comment shows, the replies fold into one line in the Space colour naming who replied, the footer names who resolved it beside a check on the Space colour, and Reopen reports once with no colour transition.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const thread = within(threadIn(canvasElement))
		await expect(thread.queryByRole("button", { name: "Resolve" })).toBe(null)
		await expect(thread.queryByRole("textbox")).toBe(null)
		await expect(authorsIn(canvasElement)).toEqual(["person"])

		const replies = slotIn(canvasElement, "library-comment-replies")
		await expect(replies).toHaveTextContent("2 replies, Lena Ortiz and Atlas")
		await expect(
			slotIn(canvasElement, "library-comment-resolution"),
		).toHaveTextContent("Resolved by Steve · 1 min")

		const reopen = thread.getByRole("button", { name: "Reopen" })
		await expect(getComputedStyle(reopen).transitionProperty).toBe("none")
		await expect(getComputedStyle(replies).color).toBe(
			getComputedStyle(
				slotIn(canvasElement, "library-comment-resolution").querySelector(
					"[aria-hidden='true']",
				) as HTMLElement,
			).backgroundColor,
		)
		await userEvent.click(reopen)
		await expect(args.onReopen).toHaveBeenCalledOnce()
	},
})

export const ResolvedDark = meta.story({
	args: Resolved.input.args,
	globals: { theme: "dark" },
	play: Resolved.input.play,
})

export const ResolvedWithoutReplies = meta.story({
	args: {
		comments: [FIRST_COMMENT],
		resolution: { by: LONG_NAMED_PERSON.name, time: "Yesterday at 23:59" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A thread resolved before anyone replied, by someone with a long name. Check no replies line is drawn and the footer wraps the name beside Reopen instead of pushing it out of the card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const thread = threadIn(canvasElement)
		await expect(
			canvasElement.querySelector('[data-slot="library-comment-replies"]'),
		).toBe(null)
		await expect(thread.scrollWidth).toBeLessThanOrEqual(thread.clientWidth)
		await expect(
			within(thread).getByRole("button", { name: "Reopen" }),
		).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: {
		anchor: `On “${UNBREAKABLE}”`,
		comments: [LONG_COMMENT, { ...AGENT_REPLY, author: LONG_NAMED_AGENT }],
		participants: [LONG_NAMED_AGENT, LONG_NAMED_PERSON],
		workingAgent: LONG_NAMED_AGENT,
	},
	parameters: {
		docs: {
			description: {
				story:
					"Long names, an unbreakable link and several sentences, in a 320 px page. Check the anchor line, the names and the comment wrap inside the card, the three header buttons keep their 28 px, and nothing overflows sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = slotIn(canvasElement, "thread-page")
		page.style.width = "320px"
		const thread = threadIn(canvasElement)

		await expect(thread.scrollWidth).toBeLessThanOrEqual(thread.clientWidth)
		await expect(thread.getBoundingClientRect().right).toBeLessThanOrEqual(
			page.getBoundingClientRect().right,
		)
		await expect(
			within(thread).getByRole("button", { name: "Close" }).offsetWidth,
		).toBe(28)
		await expect(
			slotIn(canvasElement, "library-comment-mention"),
		).toHaveTextContent(`@${LONG_NAMED_AGENT.name}`)
	},
})

export const LongContentDark = meta.story({
	args: LongContent.input.args,
	globals: { theme: "dark" },
	play: LongContent.input.play,
})
