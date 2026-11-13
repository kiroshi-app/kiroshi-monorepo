"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	COMMENT_RULE,
	COMMENT_SEPARATOR,
	type LibraryCommentAgent,
	type LibraryCommentAnchor,
	type LibraryCommentAuthor,
	LibraryCommentAvatar,
	useLibraryCommentAnchorLine,
} from "@workspace/ui/components/library-comment-author"
import {
	COMMENT_ICON_BUTTON,
	LibraryCommentMentionButton,
	LibraryCommentSendButton,
	LibraryCommentTextField,
	useLibraryCommentDraft,
} from "@workspace/ui/components/library-comment-field"
import { LibraryCommentMentionMenu } from "@workspace/ui/components/library-comment-mention-menu"
import { mentionRunsOf } from "@workspace/ui/components/library-comment-mentions"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type LibraryComment = {
	id: string
	author: LibraryCommentAuthor
	time: string
	body: string
}

type LibraryCommentResolution = { by: string; time: string }

type LibraryCommentThreadProps = {
	anchor: LibraryCommentAnchor
	comments: [LibraryComment, ...LibraryComment[]]
	participants: LibraryCommentAuthor[]
	workingAgent?: LibraryCommentAgent
	resolution?: LibraryCommentResolution
	reply: string
	onReplyChange: (reply: string) => void
	onReply: () => void
	onResolve: () => void
	onReopen: () => void
	onMore: () => void
	onClose: () => void
	className?: string
}

const ROW = "flex gap-2 p-3"

const AUTHOR_LINE = "break-words text-compact leading-4.5"

const HEADER_BUTTON = cn(COMMENT_ICON_BUTTON, "text-foreground")

type CommentRowProps = { comment: LibraryComment; names: string[] }

const CommentRow = ({ comment, names }: CommentRowProps) => (
	<li className={ROW} data-slot="library-comment">
		<LibraryCommentAvatar author={comment.author} />
		<div className="flex min-w-0 flex-col gap-0.5">
			<p className={AUTHOR_LINE}>
				<span className="font-semibold text-foreground">
					{comment.author.name}
				</span>
				<span className="text-muted-foreground">
					<span aria-hidden="true">{` ${COMMENT_SEPARATOR} `}</span>
					{comment.time}
				</span>
			</p>
			<p className="whitespace-pre-wrap break-words text-foreground text-sm">
				{mentionRunsOf(comment.body, names).map((run) =>
					run.isMention ? (
						<span
							className="font-medium text-primary"
							data-slot="library-comment-mention"
							key={run.start}
						>
							{run.text}
						</span>
					) : (
						run.text
					),
				)}
			</p>
		</div>
	</li>
)

const repliersOf = (replies: LibraryComment[]) => [
	...new Set(replies.map((reply) => reply.author.name)),
]

const LibraryCommentThread = ({
	anchor,
	comments,
	participants,
	workingAgent,
	resolution,
	reply,
	onReplyChange,
	onReply,
	onResolve,
	onReopen,
	onMore,
	onClose,
	className,
}: LibraryCommentThreadProps) => {
	const { t, i18n } = useTranslation("common")
	const anchorLine = useLibraryCommentAnchorLine(anchor)
	const draft = useLibraryCommentDraft({
		value: reply,
		onValueChange: onReplyChange,
		onSubmit: onReply,
		participants,
	})
	const [first, ...replies] = comments
	const isResolved = resolution !== undefined
	const shown = isResolved ? [first] : comments

	return (
		<LibraryCommentMentionMenu
			{...draft.menu}
			className={cn("w-90 max-w-full", className)}
		>
			<section
				aria-label={anchorLine}
				className="overflow-clip rounded-control bg-comment-card text-foreground shadow-comment-card"
				data-resolved={isResolved || undefined}
				data-slot="library-comment-thread"
			>
				<header
					className={cn(
						"flex items-center justify-between gap-2 border-b p-2",
						COMMENT_RULE,
					)}
				>
					<p
						className="min-w-0 break-words ps-1 text-muted-foreground text-xs leading-4"
						data-slot="library-comment-anchor"
					>
						{anchorLine}
					</p>
					<div className="flex shrink-0 items-center gap-0.5">
						{isResolved ? null : (
							<TooltipButton
								aria-label={t("library.comments.thread.resolve")}
								className={HEADER_BUTTON}
								onClick={onResolve}
								size="icon-sm"
								tooltip={t("library.comments.thread.resolve")}
								variant="ghost"
							>
								<Icons.Success aria-hidden="true" />
							</TooltipButton>
						)}
						<TooltipButton
							aria-label={t("library.comments.thread.more")}
							className={HEADER_BUTTON}
							onClick={onMore}
							size="icon-sm"
							tooltip={t("library.comments.thread.more")}
							variant="ghost"
						>
							<Icons.More aria-hidden="true" />
						</TooltipButton>
						<TooltipButton
							aria-label={t("library.comments.thread.close")}
							className={HEADER_BUTTON}
							onClick={onClose}
							size="icon-sm"
							tooltip={t("library.comments.thread.close")}
							variant="ghost"
						>
							<Icons.Close aria-hidden="true" className="size-3.5" />
						</TooltipButton>
					</div>
				</header>
				<ul>
					{shown.map((comment) => (
						<CommentRow
							comment={comment}
							key={comment.id}
							names={draft.names}
						/>
					))}
				</ul>
				{isResolved && replies.length > 0 ? (
					<p
						className="break-words ps-11 pe-3 pb-3 font-medium text-compact text-primary leading-4.5"
						data-slot="library-comment-replies"
					>
						{t("library.comments.thread.replies", {
							count: replies.length,
							names: new Intl.ListFormat(i18n.language, {
								type: "conjunction",
							}).format(repliersOf(replies)),
						})}
					</p>
				) : null}
				{workingAgent && !isResolved ? (
					<div
						className={cn(ROW, "items-center")}
						data-slot="library-comment-working"
						role="status"
					>
						<LibraryCommentAvatar author={workingAgent} isWorking />
						<p className={cn(AUTHOR_LINE, "min-w-0")}>
							<span className="font-semibold text-foreground">
								{workingAgent.name}
							</span>
							<span className="text-muted-foreground">
								{` ${t("library.comments.thread.working")}`}
							</span>
						</p>
					</div>
				) : null}
				{resolution ? (
					<footer
						className={cn(
							"flex items-center justify-between gap-2 border-t p-3",
							COMMENT_RULE,
						)}
						data-slot="library-comment-resolution"
					>
						<p
							className={cn(
								AUTHOR_LINE,
								"flex min-w-0 items-center gap-1.5 text-muted-foreground",
							)}
						>
							<span
								aria-hidden="true"
								className="grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
							>
								<Icons.Check className="size-2.5" />
							</span>
							<span className="min-w-0">
								{t("library.comments.thread.resolvedBy", {
									name: resolution.by,
								})}
								<span aria-hidden="true">{` ${COMMENT_SEPARATOR} `}</span>
								{resolution.time}
							</span>
						</p>
						<Button
							className={cn(
								"shrink-0 rounded-full bg-transparent text-compact text-foreground leading-4 transition-none hover:bg-foreground/4 active:bg-foreground/8 dark:hover:bg-foreground/4",
								COMMENT_RULE,
							)}
							onClick={onReopen}
							size="sm"
							variant="outline"
						>
							{t("library.comments.thread.reopen")}
						</Button>
					</footer>
				) : (
					<form
						className={cn("flex items-end gap-2 border-t p-3", COMMENT_RULE)}
						data-slot="library-comment-reply"
						onSubmit={draft.submit}
					>
						<LibraryCommentTextField
							className="flex-1 py-1 ps-0"
							draft={draft}
							placeholder={t("library.comments.composer.reply")}
						/>
						<LibraryCommentMentionButton draft={draft} />
						<LibraryCommentSendButton draft={draft} />
					</form>
				)}
			</section>
		</LibraryCommentMentionMenu>
	)
}

export {
	type LibraryComment,
	type LibraryCommentResolution,
	LibraryCommentThread,
	type LibraryCommentThreadProps,
}
