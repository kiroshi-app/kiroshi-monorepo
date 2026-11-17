"use client"

import { type ReactNode, useId, useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
	type LibraryCommentAuthor,
	LibraryCommentAvatar,
} from "@workspace/ui/components/library-comment-author"
import { useMentionMenuEscape } from "@workspace/ui/components/library-comment-escape"
import {
	PromptMenuRow,
	PromptMenuSurface,
	usePromptMenu,
} from "@workspace/ui/components/prompt-menu"

type LibraryCommentMentionMenuProps = {
	participants: LibraryCommentAuthor[]
	open: boolean
	query: string
	onSelect: (participant: LibraryCommentAuthor) => void
	onDismiss: () => void
	children: ReactNode
	className?: string
}

const SECTION_LABEL = "px-2 pt-2 pb-1 text-muted-foreground text-xs leading-4"

const matchesOf = (participants: LibraryCommentAuthor[], query: string) => {
	const needle = query.toLocaleLowerCase()
	const named = participants.filter((participant) =>
		participant.name.toLocaleLowerCase().includes(needle),
	)
	const agents = named.filter((participant) => participant.kind === "agent")
	const people = named.filter((participant) => participant.kind === "person")

	return { agents, people, matches: [...agents, ...people] }
}

const LibraryCommentMentionMenu = ({
	participants,
	open,
	query,
	onSelect,
	onDismiss,
	children,
	className,
}: LibraryCommentMentionMenuProps) => {
	const { t } = useTranslation("common")
	const agentsId = useId()
	const peopleId = useId()

	const { agents, people, matches } = useMemo(
		() => matchesOf(participants, query),
		[participants, query],
	)

	const { rootRef, isOpen, active, activateOnPointerMove } = usePromptMenu({
		open,
		query,
		count: matches.length,
		onChoose: (index) => onSelect(matches[index]),
		onDismiss,
	})

	useMentionMenuEscape(isOpen, onDismiss)

	const renderRow = (participant: LibraryCommentAuthor, index: number) => (
		<PromptMenuRow
			className="flex w-full items-center gap-2 rounded-md p-2 text-start text-foreground outline-ring transition-none focus-visible:outline-2 focus-visible:-outline-offset-2"
			isActive={index === active}
			key={participant.id}
			onPointerMove={activateOnPointerMove(index)}
			onSelect={() => onSelect(participant)}
		>
			<LibraryCommentAvatar author={participant} />
			<span
				className="min-w-0 flex-1 break-words font-medium text-sm"
				data-slot="library-comment-mention-name"
			>
				{participant.name}
			</span>
			{participant.kind === "agent" && participant.title ? (
				<span
					className="max-w-1/2 shrink-0 break-words text-muted-foreground text-xs leading-4"
					data-slot="library-comment-mention-role"
				>
					{participant.title}
				</span>
			) : null}
		</PromptMenuRow>
	)

	return (
		<PromptMenuSurface
			className={className}
			isOpen={isOpen}
			label={t("library.comments.mentions.label")}
			panelClassName="absolute inset-x-0 top-full z-50 mt-3 rounded-control bg-comment-card p-1 shadow-comment-card"
			rootRef={rootRef}
			rows={
				<>
					{agents.length > 0 ? (
						<div aria-labelledby={agentsId} role="group">
							<p className={SECTION_LABEL} id={agentsId}>
								{t("library.comments.mentions.agents")}
							</p>
							{agents.map(renderRow)}
						</div>
					) : null}
					{people.length > 0 ? (
						<div aria-labelledby={peopleId} role="group">
							<p className={SECTION_LABEL} id={peopleId}>
								{t("library.comments.mentions.people")}
							</p>
							{people.map((person, index) =>
								renderRow(person, agents.length + index),
							)}
						</div>
					) : null}
				</>
			}
			slot="library-comment-mention-menu"
		>
			{children}
		</PromptMenuSurface>
	)
}

export { LibraryCommentMentionMenu, type LibraryCommentMentionMenuProps }
