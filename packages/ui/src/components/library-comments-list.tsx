"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useTranslation } from "react-i18next"

import {
	COMMENT_RULE,
	COMMENT_SEPARATOR,
	type LibraryCommentAnchor,
	type LibraryCommentAuthor,
	LibraryCommentAvatar,
	useLibraryCommentAnchorLine,
} from "@workspace/ui/components/library-comment-author"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCommentsTab = "open" | "resolved"

type LibraryCommentsCounts = Record<LibraryCommentsTab, number>

type LibraryCommentSummary = {
	id: string
	author: LibraryCommentAuthor
	replyCount: number
	date: string
	comment: string
	anchor: LibraryCommentAnchor
}

type LibraryCommentsListProps = {
	tab: LibraryCommentsTab
	onTabChange: (tab: LibraryCommentsTab) => void
	counts: LibraryCommentsCounts
	threads: LibraryCommentSummary[]
	onOpenThread: (id: string) => void
	className?: string
}

const TABS = [
	{
		tab: "open",
		label: "library.comments.list.open",
		empty: "library.comments.list.emptyOpen",
	},
	{
		tab: "resolved",
		label: "library.comments.list.resolved",
		empty: "library.comments.list.emptyResolved",
	},
] as const satisfies { tab: LibraryCommentsTab; label: string; empty: string }[]

const FOCUS_INSIDE =
	"outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2"

type SummaryRowProps = {
	thread: LibraryCommentSummary
	onOpenThread: (id: string) => void
}

const SummaryRow = ({ thread, onOpenThread }: SummaryRowProps) => {
	const { t } = useTranslation("common")
	const anchorLine = useLibraryCommentAnchorLine(thread.anchor)

	return (
		<li>
			<button
				className={cn(
					"flex w-full gap-2 p-3 text-start transition-none hover:bg-foreground/2 active:bg-foreground/4 dark:hover:bg-foreground/4 dark:active:bg-foreground/6",
					FOCUS_INSIDE,
				)}
				data-slot="library-comments-row"
				onClick={() => onOpenThread(thread.id)}
				type="button"
			>
				<LibraryCommentAvatar author={thread.author} />
				<span className="flex min-w-0 flex-col gap-0.5">
					<span
						className="break-words text-compact leading-4.5"
						data-slot="library-comments-row-line"
					>
						<span className="font-semibold text-foreground">
							{thread.author.name}
						</span>
						<span className="text-muted-foreground">
							{thread.replyCount > 0 ? (
								<>
									<span aria-hidden="true">{` ${COMMENT_SEPARATOR} `}</span>
									{t("library.comments.list.replies", {
										count: thread.replyCount,
									})}
								</>
							) : null}
							<span aria-hidden="true">{` ${COMMENT_SEPARATOR} `}</span>
							{thread.date}
						</span>
					</span>
					<span className="line-clamp-2 break-words text-foreground text-sm">
						{thread.comment}
					</span>
					<span className="break-words text-muted-foreground text-xs leading-4">
						{anchorLine}
					</span>
				</span>
			</button>
		</li>
	)
}

const LibraryCommentsList = ({
	tab,
	onTabChange,
	counts,
	threads,
	onOpenThread,
	className,
}: LibraryCommentsListProps) => {
	const { t } = useTranslation("common")

	return (
		<Tabs.Root
			className={cn(
				"w-95 max-w-full overflow-clip rounded-control bg-comment-card text-foreground shadow-comment-list",
				className,
			)}
			data-slot="library-comments-list"
			onValueChange={onTabChange}
			value={tab}
		>
			<Tabs.List
				aria-label={t("library.comments.list.label")}
				className={cn("flex gap-1 border-b p-2", COMMENT_RULE)}
			>
				{TABS.map(({ tab: value, label }) => (
					<Tabs.Tab
						className="group/tab flex h-7 items-center gap-1.5 rounded-full px-3 font-medium text-compact text-muted-foreground leading-4 outline-ring transition-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 data-active:bg-muted data-active:text-foreground dark:data-active:bg-foreground/8"
						key={value}
						value={value}
					>
						{t(label)}
						<span className="tabular-nums group-data-active/tab:text-muted-foreground">
							{counts[value]}
						</span>
					</Tabs.Tab>
				))}
			</Tabs.List>
			{TABS.map(({ tab: value, empty }) => (
				<Tabs.Panel
					className={cn("max-h-120 overflow-y-auto", FOCUS_INSIDE)}
					key={value}
					value={value}
				>
					{value !== tab ? null : threads.length > 0 ? (
						<ul>
							{threads.map((thread) => (
								<SummaryRow
									key={thread.id}
									onOpenThread={onOpenThread}
									thread={thread}
								/>
							))}
						</ul>
					) : (
						<p
							className="p-3 text-center text-compact text-muted-foreground leading-4.5"
							data-slot="library-comments-empty"
						>
							{t(empty)}
						</p>
					)}
				</Tabs.Panel>
			))}
		</Tabs.Root>
	)
}

export {
	type LibraryCommentSummary,
	type LibraryCommentsCounts,
	LibraryCommentsList,
	type LibraryCommentsListProps,
	type LibraryCommentsTab,
}
