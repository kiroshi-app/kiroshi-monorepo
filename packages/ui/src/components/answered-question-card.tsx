"use client"

import { type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import { AuthorLine } from "@workspace/ui/components/author-line"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { MessageClock } from "@workspace/ui/components/message"
import type { ToolQuestionItem } from "@workspace/ui/components/tool-question"
import { AUTHOR_AVATAR_SIZE } from "@workspace/ui/components/turn"
import { cn } from "@workspace/ui/lib/utils"

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

type AnswererLineProps = Pick<
	AnsweredQuestionCardProps,
	"author" | "answeredAt"
>

const AnswererLine = ({ author, answeredAt }: AnswererLineProps) => {
	const { t } = useTranslation("chat")
	const label = author.isViewer
		? t("answeredQuestion.byViewer")
		: t("answeredQuestion.byMember", { name: author.name })

	return (
		<AuthorLine
			tone="person"
			name={label}
			avatar={
				<InitialsAvatar
					name={author.name}
					image={author.image}
					size={AUTHOR_AVATAR_SIZE}
				/>
			}
			time={<MessageClock at={answeredAt} />}
			className="self-start"
		/>
	)
}

const AnsweredQuestionCard = ({
	author,
	answeredAt,
	questions,
	className,
}: AnsweredQuestionCardProps) => (
	<div
		data-slot="answered-question-card"
		className={cn("flex flex-col gap-2", className)}
	>
		<div className="flex flex-col gap-2.5">
			{questions.map((question) => (
				<AnsweredBlock key={question.question} {...question} />
			))}
		</div>
		<AnswererLine author={author} answeredAt={answeredAt} />
	</div>
)

export {
	type AnsweredQuestion,
	type AnsweredQuestionAuthor,
	AnsweredQuestionCard,
}
