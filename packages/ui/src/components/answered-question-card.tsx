"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	AvatarFrame,
	displayNameOf,
	initialsOf,
} from "@workspace/ui/components/initials-avatar"
import { MessageClock } from "@workspace/ui/components/message"
import { MESSAGE_BUBBLE_MAX_INLINE_SIZE } from "@workspace/ui/components/message-bubble"
import type { ToolQuestionItem } from "@workspace/ui/components/tool-question"
import { cn } from "@workspace/ui/lib/utils"

const AUTHOR_AVATAR_SIZE = 20

const CARD_CLASS = cn(
	"flex min-w-[min(--spacing(90),100%)] flex-col gap-2.5 rounded-bubble rounded-ss-sm bg-muted px-4 py-3 text-foreground",
	MESSAGE_BUBBLE_MAX_INLINE_SIZE,
)

const AUTHOR_INITIALS_CLASS =
	"grid size-full place-items-center bg-person-avatar font-medium text-[8px] text-foreground uppercase leading-none"

const CHOSEN_ROW_CLASS =
	"surface-user-bubble on-user-bubble flex items-center gap-3 rounded-control px-3 py-2.5 text-user-bubble-foreground"

const KEY_CHIP_CLASS =
	"grid size-5 shrink-0 place-items-center rounded-sm bg-user-bubble-foreground/10 font-medium text-[11px]/3 text-user-bubble-foreground/80 tabular-nums dark:bg-user-bubble-foreground/15"

type AnsweredQuestionAuthor = {
	name: string
	image?: string
	isViewer?: boolean
}

type AnsweredQuestion = Pick<
	ToolQuestionItem,
	"question" | "header" | "options"
> & {
	selected: string[]
	freeText?: string
}

type AnsweredQuestionCardProps = {
	author: AnsweredQuestionAuthor
	answeredAt: number
	questions: AnsweredQuestion[]
	className?: string
}

type ChosenRowProps = {
	position?: number
	children: ReactNode
}

const ChosenRow = ({ position, children }: ChosenRowProps) => (
	<div data-slot="answered-question-choice" className={CHOSEN_ROW_CLASS}>
		{position === undefined ? null : (
			<span aria-hidden="true" className={KEY_CHIP_CLASS}>
				{position}
			</span>
		)}
		<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
			{children}
		</span>
		<span
			aria-hidden="true"
			className="grid size-5 shrink-0 place-items-center"
		>
			<Icons.Check className="size-4.5 stroke-[2.4]!" />
		</span>
	</div>
)

const ANSWER_TEXT_CLASS = "min-w-0 break-words"

const AnsweredBlock = ({
	header,
	options,
	selected,
	freeText,
}: AnsweredQuestion) => {
	const headerId = useId()
	const writtenAnswer = freeText?.trim()

	return (
		<div
			role="group"
			aria-labelledby={headerId}
			className="flex flex-col gap-1.5"
		>
			<span
				id={headerId}
				className="ps-0.5 font-medium text-muted-foreground text-xs"
			>
				{header}
			</span>
			{options.map((option, index) =>
				selected.includes(option.label) ? (
					<ChosenRow key={option.label} position={index + 1}>
						<span className={cn(ANSWER_TEXT_CLASS, "font-medium text-sm")}>
							{option.label}
						</span>
						{option.description ? (
							<span
								className={cn(
									ANSWER_TEXT_CLASS,
									"text-compact text-(--color-muted-foreground) leading-5",
								)}
							>
								{option.description}
							</span>
						) : null}
					</ChosenRow>
				) : null,
			)}
			{writtenAnswer ? (
				<ChosenRow>
					<span
						className={cn(
							ANSWER_TEXT_CLASS,
							"whitespace-pre-wrap font-medium text-sm",
						)}
					>
						{writtenAnswer}
					</span>
				</ChosenRow>
			) : null}
		</div>
	)
}

type AuthorLineProps = Pick<AnsweredQuestionCardProps, "author" | "answeredAt">

const AuthorLine = ({ author, answeredAt }: AuthorLineProps) => {
	const { t } = useTranslation("chat")
	const label = author.isViewer
		? t("answeredQuestion.byViewer")
		: t("answeredQuestion.byMember", { name: author.name })

	return (
		<div className="flex items-center gap-1.5 px-0.5 pt-0.5">
			<AvatarFrame
				image={author.image}
				shape="round"
				size={AUTHOR_AVATAR_SIZE}
				slot="user-avatar"
				className="shrink-0"
			>
				<span aria-hidden="true" className={AUTHOR_INITIALS_CLASS}>
					{initialsOf(displayNameOf(author.name))}
				</span>
			</AvatarFrame>
			<span className="min-w-0 break-words font-semibold text-muted-foreground text-xs">
				{label}
			</span>
			<MessageClock
				at={answeredAt}
				className="ms-auto text-[11px]/4 text-muted-foreground"
			/>
		</div>
	)
}

const AnsweredQuestionCard = ({
	author,
	answeredAt,
	questions,
	className,
}: AnsweredQuestionCardProps) => (
	<div data-slot="answered-question-card" className={cn(CARD_CLASS, className)}>
		<AuthorLine author={author} answeredAt={answeredAt} />
		{questions.map((question) => (
			<AnsweredBlock key={question.question} {...question} />
		))}
	</div>
)

export {
	type AnsweredQuestion,
	type AnsweredQuestionAuthor,
	AnsweredQuestionCard,
}
