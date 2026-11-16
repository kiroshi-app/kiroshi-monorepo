import { useState } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	commentScrollerIn,
	expectCommentThreadCapped,
	hueScopeOf,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { LibraryCommentPin } from "@workspace/ui/components/library-comment-pin"
import {
	type LibraryComment,
	LibraryCommentThread,
	type LibraryCommentThreadProps,
	type ThreadWorkLineAgent,
} from "@workspace/ui/components/library-comment-thread"
import {
	AGENT_REPLY,
	ATLAS,
	COMMENT_PARTICIPANTS,
	FIRST_COMMENT,
	JUNIPER,
	LONG_COMMENT,
	LONG_NAMED_AGENT,
	LONG_NAMED_PERSON,
	LONG_THREAD_COMMENTS,
	MEMBER_REPLY,
	PASSAGE_ANCHOR,
	SESSION_PARAGRAPH,
	UNBREAKABLE,
} from "@workspace/ui/components/library-comments.fixtures"
import { Button } from "@workspace/ui/components/ui/button"

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

const ATLAS_AT_WORK: ThreadWorkLineAgent = { ...ATLAS, state: "thinking" }

const SEVERAL_AGENTS_AT_WORK: ThreadWorkLineAgent[] = [
	ATLAS_AT_WORK,
	{ ...JUNIPER, state: "thinking" },
	{ ...LONG_NAMED_AGENT, state: "thinking" },
]

const HandoverThread = (props: LibraryCommentThreadProps) => {
	const [hasReplied, setHasReplied] = useState(false)

	return (
		<div className="flex flex-col items-start gap-3">
			<ThreadOnPage
				{...props}
				comments={hasReplied ? [FIRST_COMMENT, AGENT_REPLY] : [FIRST_COMMENT]}
				workingAgents={hasReplied ? [] : [ATLAS_AT_WORK]}
			/>
			<Button onClick={() => setHasReplied(true)} size="sm" variant="outline">
				Atlas replies
			</Button>
		</div>
	)
}

const ReturningAgentsThread = (props: LibraryCommentThreadProps) => {
	const [isAtWork, setIsAtWork] = useState(true)

	return (
		<div className="flex flex-col items-start gap-3">
			<ThreadOnPage
				{...props}
				workingAgents={isAtWork ? SEVERAL_AGENTS_AT_WORK : []}
			/>
			<Button
				onClick={() => setIsAtWork((wasAtWork) => !wasAtWork)}
				size="sm"
				variant="outline"
			>
				{isAtWork ? "Agents stop" : "Agents start again"}
			</Button>
		</div>
	)
}

const ARRIVING_REPLY: LibraryComment = {
	...MEMBER_REPLY,
	id: "comment-arriving",
	time: "Now",
}

const GrowingThread = (props: LibraryCommentThreadProps) => {
	const [hasArrived, setHasArrived] = useState(false)

	return (
		<div className="flex flex-col items-start gap-3">
			<ThreadOnPage
				{...props}
				comments={
					hasArrived ? [...props.comments, ARRIVING_REPLY] : props.comments
				}
			/>
			<Button onClick={() => setHasArrived(true)} size="sm" variant="outline">
				Lena replies
			</Button>
		</div>
	)
}

const SEVERAL_SCREENS_COMMENT: LibraryComment = {
	...FIRST_COMMENT,
	body: Array.from({ length: 30 }, () => SESSION_PARAGRAPH).join("\n\n"),
}

const threadIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "library-comment-thread")

const WORK_ROW_SLOT = "library-comment-working"

const workRowIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, WORK_ROW_SLOT)

const workToggleIn = (canvasElement: HTMLElement) =>
	within(workRowIn(canvasElement)).getByRole("button", {
		name: "Each agent’s work",
	})

const expectHiddenStatus = async (canvasElement: HTMLElement, text: string) => {
	const working = workRowIn(canvasElement)
	const status = within(working).getByRole("status")

	await expect(status.textContent).toBe(text)
	await expect(status.offsetWidth).toBe(1)
	await expect(status.parentElement).toBe(working)
	await expect(status.querySelector("*")).toBe(null)
	await expect(
		slotIn(working, "thread-work-line").closest("[role='status'], [aria-live]"),
	).toBe(null)
}

const expectAlignedWithComments = async (canvasElement: HTMLElement) => {
	const working = workRowIn(canvasElement)
	const comment = slotIn(canvasElement, "library-comment")

	await expect(getComputedStyle(working).padding).toBe(
		getComputedStyle(comment).padding,
	)
	await expect(
		slotIn(working, "thread-work-line-line").getBoundingClientRect().left,
	).toBe(slotIn(comment, "library-comment-avatar").getBoundingClientRect().left)
}

const expectInViewOf = async (scroller: HTMLElement, part: HTMLElement) => {
	const view = scroller.getBoundingClientRect()
	const box = part.getBoundingClientRect()
	await expect(scroller).toContainElement(part)
	await expect(box.top).toBeGreaterThanOrEqual(Math.floor(view.top))
	await expect(box.bottom).toBeLessThanOrEqual(Math.ceil(view.bottom))
}

const expectCardAtContentHeight = async (card: HTMLElement) => {
	const scroller = commentScrollerIn(card)
	const header = card.firstElementChild as HTMLElement
	const footer = card.lastElementChild as HTMLElement
	const body = slotIn(card, "library-comment").querySelector("p:last-child")
	const renderedLine = Number.parseFloat(
		getComputedStyle(body as HTMLElement).lineHeight,
	)

	await expect(scroller.scrollHeight).toBeLessThanOrEqual(scroller.clientHeight)
	await expect(
		Math.abs(
			card.offsetHeight -
				(header.offsetHeight + scroller.scrollHeight + footer.offsetHeight),
		),
	).toBeLessThanOrEqual(renderedLine)
}

const CLASSIC_SCROLLBAR =
	"contents [&_[data-slot=library-comment-scroller]::-webkit-scrollbar-thumb]:bg-(--scrollbar) [&_[data-slot=library-comment-scroller]::-webkit-scrollbar-track]:bg-muted"

const CLASSIC_SCROLLBAR_TAKING_WIDTH = `${CLASSIC_SCROLLBAR} [&_[data-slot=library-comment-scroller]]:[scrollbar-gutter:stable]`

const ROW_INLINE_PADDING = 12

const rowsCutIn = (scroller: HTMLElement) => {
	const visibleEnd = Math.ceil(
		scroller.getBoundingClientRect().left +
			scroller.clientLeft +
			scroller.clientWidth,
	)

	return slotsIn(scroller, "library-comment").filter(
		(row) =>
			Math.floor(row.getBoundingClientRect().right) > visibleEnd ||
			Array.from(row.querySelectorAll("p")).some(
				(line) => line.scrollWidth > line.clientWidth,
			),
	)
}

const rowsOffTheirInlinePadding = (scroller: HTMLElement) =>
	slotsIn(scroller, "library-comment").filter((row) => {
		const box = row.getBoundingClientRect()
		const avatar = slotIn(row, "library-comment-avatar").getBoundingClientRect()
		const text = (row.lastElementChild as HTMLElement).getBoundingClientRect()

		return (
			Math.round(avatar.left - box.left) !== ROW_INLINE_PADDING ||
			Math.round(box.right - text.right) < ROW_INLINE_PADDING
		)
	})

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
					"One comment thread, under its pin: the line naming what it is on, Resolve, More and Close, More drawn only when `onMore` is passed, the first comment and its replies, each with a round avatar for a person and a hexagonal one for an agent, then the reply field. `workingAgents` draws the agents at work with the work line of a conversation, one line for one agent, the pile and its toggle for several; `workingAgent` alone still draws that agent thinking. `resolution` turns the card into its resolved form: no Resolve, the replies folded into one line in the Space colour, and a footer naming who resolved it, with Reopen. An anchor of `{ gone }` words a target that no longer exists. The card is 360 px wide and narrows with its container. It is as tall as its content up to 60 percent of the window height: past it the comments scroll alone, the latest one in view, between the header and the reply field or the resolution footer.",
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
		await expect(resolve.nextElementSibling).toBe(
			thread.getByRole("button", { name: "Close" }),
		)
	},
})

export const AgentAtWork = meta.story({
	args: { workingAgent: ATLAS },
	parameters: {
		docs: {
			description: {
				story:
					"The agent the first comment mentions has a turn on the thread, passed through `workingAgent` alone. Check the row is the one-agent work line of a conversation, Atlas thinking with no toggle, under the comment and above the reply field, starting where the comment avatars start, inside the same padding, and that a status the screen does not show names Atlas beside the line, never around it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const working = workRowIn(canvasElement)
		await expect(within(working).getByText("Atlas")).toBeVisible()
		await expect(within(working).getByText("is thinking…")).toBeVisible()
		await expect(slotIn(working, "bot-identity-avatar")).toBeVisible()
		await expect(within(working).queryByRole("button")).toBe(null)
		await expectHiddenStatus(canvasElement, "Atlas is working on it")
		await expectAlignedWithComments(canvasElement)
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

export const SeveralAgentsAtWork = meta.story({
	args: { workingAgent: ATLAS, workingAgents: SEVERAL_AGENTS_AT_WORK },
	parameters: {
		docs: {
			description: {
				story:
					"A comment mentioned three agents and each has a turn on the thread, `workingAgent` still passed beside `workingAgents`. Check the row draws the group line for the three listed agents alone, the pile, the headline and the toggle, that the toggle opens one row per agent, that every row stays inside the 360 px card, the long name giving way, and that a status the screen does not show names the three agents beside the line, the same once the detail is open.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const working = workRowIn(canvasElement)
		const status =
			"Atlas, Juniper, and Supercalifragilisticexpialidocious are working on it"
		await expect(slotIn(working, "conversation-bot-pile")).toBeVisible()
		await expect(within(working).getByText("3 agents")).toBeVisible()
		await expectHiddenStatus(canvasElement, status)
		await expectAlignedWithComments(canvasElement)

		const toggle = workToggleIn(canvasElement)
		await expect(toggle).toHaveAttribute("aria-expanded", "false")
		await expect(within(working).queryByRole("list")).toBe(null)
		await userEvent.click(toggle)

		await expect(workToggleIn(canvasElement)).toHaveAttribute(
			"aria-expanded",
			"true",
		)
		await expectHiddenStatus(canvasElement, status)
		const rows = within(within(working).getByRole("list")).getAllByRole(
			"listitem",
		)
		await expect(rows).toHaveLength(SEVERAL_AGENTS_AT_WORK.length)

		const thread = threadIn(canvasElement)
		await expect(thread.offsetWidth).toBe(360)
		await expect(thread.scrollWidth).toBeLessThanOrEqual(thread.clientWidth)
		for (const row of rows) {
			await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
			await expect(row.getBoundingClientRect().right).toBeLessThanOrEqual(
				thread.getBoundingClientRect().right,
			)
		}
	},
})

export const SeveralAgentsAtWorkDark = meta.story({
	args: SeveralAgentsAtWork.input.args,
	globals: { theme: "dark" },
	play: SeveralAgentsAtWork.input.play,
})

export const AgentsBackAtWork = meta.story({
	render: (args) => <ReturningAgentsThread {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The agents finish, then a later mention puts them back at work: open the detail, press Agents stop, then Agents start again under the card. Check the row leaves with its status, and comes back with the detail closed, not as it was left.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const canvas = within(canvasElement)
		await userEvent.click(workToggleIn(canvasElement))
		await expect(workToggleIn(canvasElement)).toHaveAttribute(
			"aria-expanded",
			"true",
		)

		await userEvent.click(canvas.getByRole("button", { name: "Agents stop" }))
		await expect(slotsIn(canvasElement, WORK_ROW_SLOT)).toHaveLength(0)
		await expect(canvas.queryByRole("status")).toBe(null)

		await userEvent.click(
			canvas.getByRole("button", { name: "Agents start again" }),
		)
		await expect(workToggleIn(canvasElement)).toHaveAttribute(
			"aria-expanded",
			"false",
		)
		await expect(within(workRowIn(canvasElement)).queryByRole("list")).toBe(
			null,
		)
	},
})

export const HandoverToReply = meta.story({
	render: (args) => <HandoverThread {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The moment the agent at work hands over to its reply: press Atlas replies under the card. Check the thread starts with Atlas at work under the first comment, then holds its reply as the last comment, with no at-work row, no status and no empty container left above the reply field.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const canvas = within(canvasElement)
		await expect(
			within(workRowIn(canvasElement)).getByText("Atlas"),
		).toBeVisible()
		await expect(authorsIn(canvasElement)).toEqual(["person"])

		await userEvent.click(canvas.getByRole("button", { name: "Atlas replies" }))

		await expect(slotsIn(canvasElement, WORK_ROW_SLOT)).toHaveLength(0)
		await expect(canvas.queryByRole("status")).toBe(null)
		await expect(authorsIn(canvasElement)).toEqual(["person", "agent"])
		await expect(canvas.getByText(AGENT_REPLY.body)).toBeVisible()
	},
})

export const Replies = meta.story({
	args: { comments: [FIRST_COMMENT, MEMBER_REPLY, AGENT_REPLY] },
	parameters: {
		docs: {
			description: {
				story:
					"A member then an agent replied, as artboards Thread 5 and Edge 3 draw it. Check the three comments in order, round avatars for the two people and a hexagon for the agent, the card as tall as its content with nothing to scroll, and that typing @ in the reply field opens the mention menu under the card.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		await expect(authorsIn(canvasElement)).toEqual([
			"person",
			"person",
			"agent",
		])
		await expectCardAtContentHeight(threadIn(canvasElement))

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
		workingAgents: [ATLAS_AT_WORK],
	},
	parameters: {
		docs: {
			description: {
				story:
					"A resolved thread, as artboards Thread 6 and Resolved 2 draw it, resolved while an agent still had a turn on it. Check Resolve, the reply field and the at-work row are gone, only the first comment shows, the replies fold into one line in the Space colour naming who replied, the footer names who resolved it beside a check on the Space colour, and Reopen reports once with no colour transition.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const thread = within(threadIn(canvasElement))
		await expect(thread.queryByRole("button", { name: "Resolve" })).toBe(null)
		await expect(thread.queryByRole("textbox")).toBe(null)
		await expect(slotsIn(canvasElement, WORK_ROW_SLOT)).toHaveLength(0)
		await expect(thread.queryByRole("status")).toBe(null)
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

export const LongThread = meta.story({
	args: {
		comments: LONG_THREAD_COMMENTS,
		workingAgents: SEVERAL_AGENTS_AT_WORK,
	},
	render: (args) => <GrowingThread {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"Thirty one comments, ten times a usual thread, with agents at work on it. Check the card stops at 60 percent of the window height, the header and the reply field stay whole above and under the comments, the comments open on the latest one with the at-work row in view under it, the mention menu still opens under the card, and that Lena replies brings her reply into view from the top of the thread.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const card = threadIn(canvasElement)
		const scroller = commentScrollerIn(card)
		await expectCommentThreadCapped(card)
		await expectInViewOf(scroller, workRowIn(canvasElement))

		const canvas = within(canvasElement)
		await userEvent.type(
			canvas.getByRole("textbox", { name: "Reply, @ to mention" }),
			"@jun",
		)
		const menu = await canvas.findByRole("listbox", { name: "Mention" })
		await expect(menu).toBeVisible()
		await expect(menu.getBoundingClientRect().top).toBeGreaterThan(
			card.getBoundingClientRect().bottom,
		)
		await userEvent.keyboard("{Enter}")

		scroller.scrollTop = 0
		await userEvent.click(canvas.getByRole("button", { name: "Lena replies" }))
		await expect(slotsIn(card, "library-comment")).toHaveLength(
			LONG_THREAD_COMMENTS.length + 1,
		)
		await expectCommentThreadCapped(card)
	},
})

export const LongThreadDark = meta.story({
	args: LongThread.input.args,
	globals: { theme: "dark" },
	render: LongThread.input.render,
	play: LongThread.input.play,
})

export const LongThreadClassicScrollbar = meta.story({
	args: { comments: [...LONG_THREAD_COMMENTS, LONG_COMMENT] },
	decorators: [
		(Story) => (
			<div className={CLASSIC_SCROLLBAR_TAKING_WIDTH}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"Thirty two comments, the last one holding an unbreakable link, with the scrollbar of the comments always drawn, thumb and track, as a classic scrollbar that takes width. Its room is held open by the story, so the comments lose that width even in the test runner, which draws no scrollbar. Check every comment keeps its 12 px on the left and on the right of its text, no comment runs under the scrollbar and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const scroller = commentScrollerIn(threadIn(canvasElement))

		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
		await expect(scroller.clientWidth).toBeLessThan(scroller.offsetWidth)
		await expect(rowsCutIn(scroller)).toEqual([])
		await expect(rowsOffTheirInlinePadding(scroller)).toEqual([])
		await expect(scroller.scrollWidth).toBe(scroller.clientWidth)
	},
})

export const ShortThreadClassicScrollbar = meta.story({
	decorators: [
		(Story) => (
			<div className={CLASSIC_SCROLLBAR}>
				<Story />
			</div>
		),
	],
	parameters: {
		docs: {
			description: {
				story:
					"One comment, shorter than the cap, under the same always drawn scrollbar, its room left to the card. Check the comments show no scrollbar and keep no room for one: they are as tall as their content and as wide as the card.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const scroller = commentScrollerIn(threadIn(canvasElement))

		await expect(scroller.scrollHeight).toBe(scroller.clientHeight)
		await expect(scroller.clientWidth).toBe(scroller.offsetWidth)
	},
})

export const LongThreadResolved = meta.story({
	args: {
		comments: [SEVERAL_SCREENS_COMMENT, MEMBER_REPLY, AGENT_REPLY],
		resolution: { by: "Steve", time: "1 min" },
	},
	parameters: {
		docs: {
			description: {
				story:
					"A resolved thread whose first comment alone runs over several screens. Check the card stops at 60 percent of the window height, the header and the resolution footer stay whole with Reopen in reach, and the comment scrolls between them, open on its end with the replies line in view.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const card = threadIn(canvasElement)
		await expectCommentThreadCapped(card)
		await expectInViewOf(
			commentScrollerIn(card),
			slotIn(card, "library-comment-replies"),
		)
		await expect(card.lastElementChild).toBe(
			slotIn(card, "library-comment-resolution"),
		)
		await expect(
			within(card).getByRole("button", { name: "Reopen" }),
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
