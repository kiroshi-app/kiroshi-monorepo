"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { INVERSE_BUTTON_CLASS } from "@workspace/ui/components/inverse-button"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { RadioGroup } from "@workspace/ui/components/ui/radio-group"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/ui/tabs"
import { useAutoFocus } from "@workspace/ui/hooks/use-auto-focus"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import {
	DIGIT_KEY_LIMIT,
	useDigitKeys,
} from "@workspace/ui/hooks/use-digit-keys"
import { useFocusFirstInvalid } from "@workspace/ui/hooks/use-focus-first-invalid"
import { usePendingSubmit } from "@workspace/ui/hooks/use-pending-submit"
import { cn } from "@workspace/ui/lib/utils"

const QUESTION_PANEL_CLASS =
	"flex w-full flex-col gap-3 rounded-[24px] border border-border bg-muted p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

const QUESTION_SEGMENTS_CLASS =
	"relative scrollbar-hide max-w-full justify-start gap-0.5 self-start overflow-x-auto rounded-[11px] bg-border p-0.75 group-data-horizontal/tabs:h-fit"

const QUESTION_SEGMENT_CLASS =
	"h-6.5 max-w-full flex-none shrink-0 gap-1 rounded-md px-3 py-0 font-medium text-compact text-question-segment-foreground leading-4 transition-[color,background-color,box-shadow] hover:text-foreground data-active:bg-card data-active:text-foreground data-active:shadow-[0_1px_2px_rgb(0_0_0/10%)] motion-reduce:transition-none motion-reduce:duration-0 dark:data-active:bg-card"

const QUESTION_GROUP_CLASS = "flex flex-col gap-1.5"

const QUESTION_MONO_LINE_CLASS = "truncate font-mono text-compact leading-5"

const QUESTION_LINK_ROW_CLASS =
	"flex items-center gap-2 rounded-control border border-input bg-muted py-1 pe-1 ps-3 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30"

const QUESTION_ROW_CLASS =
	"flex w-full cursor-pointer items-start gap-3 rounded-control p-3 text-start outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"

const QUESTION_PILL_CLASS =
	"h-8 rounded-full font-medium text-compact leading-4"

const QUESTION_GHOST_PILL_CLASS = cn(
	QUESTION_PILL_CLASS,
	"px-2.5 text-muted-foreground",
)

const QUESTION_INVERSE_PILL_CLASS = cn(
	INVERSE_BUTTON_CLASS,
	QUESTION_PILL_CLASS,
	"gap-1.5",
)

const QUESTION_PILL_GLYPH_CLASS = "size-3.5"

const QUESTION_CHECK_CLASS = "size-4.5 shrink-0 stroke-[2.4]!"

type ToolQuestionOption = {
	label: string
	description: string
	preview?: ReactNode
}

export type ToolQuestionLink = {
	label: string
	url: string
}

export type ToolQuestionEntry = {
	label: string
	placeholder?: string
	isSecret?: boolean
}

export type ToolQuestionFailure = {
	title: string
	detail?: string
}

export type ToolQuestionExit = {
	label: string
	onSelect: () => void
}

type ToolQuestionAction = {
	label: string
	icon: Icon
	onSelect: () => void
}

export type ToolQuestionItem = {
	question: string
	header: string
	mark?: string
	multiSelect?: boolean
	options: ToolQuestionOption[]
	optionsOnly?: boolean
	link?: ToolQuestionLink
	entry?: ToolQuestionEntry
	action?: ToolQuestionAction
	exit?: ToolQuestionExit
	failure?: ToolQuestionFailure
	isNotice?: false
}

export type ToolQuestionNotice = {
	isNotice: true
	header: string
	failure: ToolQuestionFailure
	action?: ToolQuestionAction
	exit?: ToolQuestionExit
	question?: never
}

export type ToolQuestionAnswers = Record<string, string>

export interface ToolQuestionProps {
	questions: (ToolQuestionItem | ToolQuestionNotice)[]
	onAnswer?: (answers: ToolQuestionAnswers) => unknown
	onDeny?: () => void
	companionName?: string
	hasDigitKeys?: boolean
	minimised?: boolean
	onMinimise?: () => void
	onExpand?: () => void
	className?: string
}

type Draft = { selected: string[]; text: string }

const EMPTY_DRAFT: Draft = { selected: [], text: "" }

const answerOf = ({ selected, text }: Draft) =>
	text.trim() || selected.join(", ")

const OPTION_ROW_SLOT = "tool-question-option"

const isOptionRow = (target: EventTarget) =>
	target instanceof HTMLElement && target.dataset.slot === OPTION_ROW_SLOT

const digitRangeOf = (count: number) =>
	count === 1 ? "1" : `1\u2013${Math.min(count, DIGIT_KEY_LIMIT)}`

const ToolQuestion = ({
	questions,
	onAnswer,
	onDeny,
	companionName,
	hasDigitKeys,
	minimised,
	onMinimise,
	onExpand,
	className,
}: ToolQuestionProps) => {
	const { t } = useTranslation("chat")
	const cardRef = useAutoFocus<HTMLFormElement>()
	const askedId = useId()
	const failureId = useId()
	const blankId = useId()
	const [drafts, setDrafts] = useState<Record<string, Draft>>({})
	const [shownIndex, setShownIndex] = useState(0)
	const [refusedQuestion, setRefusedQuestion] = useState<string | null>(null)
	const { root: fieldsRef, focusFirstInvalid } =
		useFocusFirstInvalid<HTMLDivElement>()
	const { isPending, run } = usePendingSubmit()

	const draftOf = (question: string) => drafts[question] ?? EMPTY_DRAFT

	const writeDraft = (question: string, draft: Draft) =>
		setDrafts((current) => ({ ...current, [question]: draft }))

	const asks = questions.filter(
		(candidate): candidate is ToolQuestionItem => !candidate.isNotice,
	)

	const answers = Object.fromEntries(
		asks.map(({ question }) => [question, answerOf(draftOf(question))]),
	)

	const waitingAfter = (shown: ToolQuestionItem | ToolQuestionNotice) =>
		asks.find((ask) => ask !== shown && answers[ask.question] === "")

	const show = (ask: ToolQuestionItem) => setShownIndex(questions.indexOf(ask))

	const pickOption = (item: ToolQuestionItem, label: string) => {
		const { selected } = draftOf(item.question)
		const held = selected.includes(label)
		writeDraft(item.question, {
			selected: held
				? selected.filter((picked) => picked !== label)
				: item.multiSelect
					? [...selected, label]
					: [label],
			text: "",
		})
		if (item.multiSelect || held) return

		const next = waitingAfter(item)
		if (next) show(next)
	}

	const item = questions[shownIndex]
	const digitItem =
		hasDigitKeys && !minimised && item && !item.isNotice && !item.entry
			? item
			: undefined

	useDigitKeys({
		count: digitItem?.options.length ?? 0,
		surface: cardRef,
		onDigit: (digit) => {
			const option = digitItem?.options[digit - 1]
			if (!digitItem || !option) return
			const isHeldRadio =
				!digitItem.multiSelect &&
				draftOf(digitItem.question).selected.includes(option.label)
			if (!isHeldRadio) pickOption(digitItem, option.label)
		},
	})

	if (!item) return null

	if (minimised) {
		return (
			<WaitingBar
				className={className}
				companionName={companionName}
				onExpand={onExpand}
				question={item.isNotice ? item.failure.title : item.question}
			/>
		)
	}

	const isAnswered = item.isNotice || answers[item.question] !== ""
	const waiting = waitingAfter(item)

	const isRefused = refusedQuestion === item.question && !isAnswered

	const sendOrAdvance = () => {
		if (!isAnswered) {
			setRefusedQuestion(item.question)
			focusFirstInvalid()
			return
		}
		if (waiting) {
			show(waiting)
			return
		}
		run(() => onAnswer?.(answers))
	}

	const submitForm = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		sendOrAdvance()
	}

	const readKey = (event: KeyboardEvent<HTMLFormElement>) => {
		if (event.target !== event.currentTarget && !isOptionRow(event.target))
			return
		if (event.key !== "Enter" || event.shiftKey) return
		event.preventDefault()
		sendOrAdvance()
	}

	const hintOf = () => {
		if (item.isNotice) return null
		const typesOwnAnswer = item.entry || draftOf(item.question).text !== ""
		if (!hasDigitKeys || typesOwnAnswer || item.options.length === 0) {
			return waiting ? t("toolQuestion.hint.next") : t("toolQuestion.hint.send")
		}
		const range = digitRangeOf(item.options.length)
		if (item.multiSelect) {
			return waiting
				? t("toolQuestion.hint.toggleThenNext", { range })
				: t("toolQuestion.hint.toggleThenSend", { range })
		}
		return waiting
			? t("toolQuestion.hint.chooseThenNext", { range })
			: t("toolQuestion.hint.chooseThenSend", { range })
	}

	const hasSegments = questions.length > 1
	const hasEntry = !item.isNotice && Boolean(item.entry)
	const isWaitingOnAnswer = !isAnswered && !isPending
	const primaryName = waiting
		? t("toolQuestion.next")
		: hasEntry
			? undefined
			: t("toolQuestion.submit")

	return (
		<form
			aria-describedby={!item.isNotice && item.failure ? failureId : undefined}
			aria-labelledby={item.isNotice ? failureId : askedId}
			className={cn(QUESTION_PANEL_CLASS, className)}
			onKeyDown={readKey}
			onSubmit={submitForm}
			ref={cardRef}
			tabIndex={-1}
		>
			<div className="flex items-start gap-3 px-1 pt-1">
				<div
					className={cn(
						"flex min-w-0 flex-1 flex-col",
						hasSegments ? "gap-2.5" : "gap-1",
					)}
				>
					{hasSegments ? (
						<Tabs onValueChange={setShownIndex} value={shownIndex}>
							<TabsList activateOnFocus className={QUESTION_SEGMENTS_CLASS}>
								{questions.map((candidate, index) => (
									<TabsTrigger
										className={QUESTION_SEGMENT_CLASS}
										key={
											candidate.isNotice
												? `notice:${candidate.header}`
												: candidate.question
										}
										value={index}
									>
										{!candidate.isNotice && answers[candidate.question] ? (
											<Icons.Check
												aria-hidden="true"
												className="size-3 text-bot-badge-done"
											/>
										) : null}
										<span className="truncate">{candidate.header}</span>
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					) : (
						<p className="truncate font-medium text-muted-foreground text-xs">
							{item.header}
						</p>
					)}

					{item.failure ? (
						<FailureBlock failure={item.failure} titleId={failureId} />
					) : null}

					{item.isNotice ? null : (
						<>
							<p
								className={cn(
									"wrap-break-word font-semibold text-foreground text-reading",
									item.mark && "flex items-center gap-2",
								)}
								id={askedId}
							>
								{item.mark ? (
									<ApplicationMark mark={item.mark} size="inline" />
								) : null}
								{item.question}
							</p>
							{item.multiSelect ? (
								<p className="text-compact text-muted-foreground leading-4.5">
									{t("toolQuestion.pickAny")}
								</p>
							) : null}
						</>
					)}
				</div>

				{onMinimise ? (
					<Button
						aria-label={t("toolQuestion.minimise")}
						className="size-7 shrink-0 rounded-md text-muted-foreground"
						onClick={onMinimise}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Icons.Expand aria-hidden="true" className="size-4" />
					</Button>
				) : null}
			</div>

			{item.isNotice ? null : (
				<div
					className={cn(QUESTION_GROUP_CLASS, hasEntry && "gap-3")}
					ref={fieldsRef}
				>
					{item.link ? <LinkField link={item.link} /> : null}
					<QuestionFields
						draft={draftOf(item.question)}
						errorId={isRefused ? blankId : undefined}
						item={item}
						onPick={(label) => pickOption(item, label)}
						onSubmit={sendOrAdvance}
						onType={(text) => writeDraft(item.question, { selected: [], text })}
						questionId={askedId}
					/>
					{isRefused ? (
						<p
							className="flex items-center gap-1.5 px-1 text-foreground text-xs"
							id={blankId}
							role="alert"
						>
							<Icons.Error
								aria-hidden="true"
								className="size-3.5 shrink-0 text-destructive"
							/>
							{t("toolQuestion.blank")}
						</p>
					) : null}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3 ps-1">
				{onDeny ? (
					<Button
						className={QUESTION_GHOST_PILL_CLASS}
						onClick={onDeny}
						type="button"
						variant="ghost"
					>
						{t("toolQuestion.skip")}
					</Button>
				) : null}
				{item.exit ? (
					<Button
						className={QUESTION_GHOST_PILL_CLASS}
						onClick={item.exit.onSelect}
						type="button"
						variant="ghost"
					>
						{item.exit.label}
					</Button>
				) : null}
				<p className="min-w-0 flex-1 text-end text-muted-foreground text-xs">
					{hintOf()}
				</p>
				{item.action ? (
					<ActionButton action={item.action} />
				) : (
					<Button
						aria-disabled={isWaitingOnAnswer ? true : undefined}
						aria-label={primaryName}
						className={cn(
							QUESTION_INVERSE_PILL_CLASS,
							"ms-auto",
							waiting ? "ps-3.5 pe-3" : "ps-3 pe-3.5",
							"aria-disabled:opacity-40",
						)}
						disabled={isPending}
						type="submit"
					>
						{waiting ? (
							<>
								{t("toolQuestion.nextLabel")}
								<Icons.ArrowRight
									aria-hidden="true"
									className={QUESTION_PILL_GLYPH_CLASS}
								/>
							</>
						) : (
							<>
								<Icons.Send
									aria-hidden="true"
									className={QUESTION_PILL_GLYPH_CLASS}
								/>
								{t(hasEntry ? "toolQuestion.continue" : "toolQuestion.send")}
							</>
						)}
					</Button>
				)}
			</div>
		</form>
	)
}

type WaitingBarProps = {
	question: string
	companionName?: string
	onExpand?: () => void
	className?: string
}

const WaitingBar = ({
	question,
	companionName,
	onExpand,
	className,
}: WaitingBarProps) => {
	const { t } = useTranslation("chat")
	const questionId = useId()

	return (
		<div
			className={cn("w-full px-6 py-2", className)}
			data-slot="tool-question-waiting"
		>
			<div className="flex h-12.5 items-center gap-2.5 rounded-full border border-question-bar-border bg-question-bar py-2 ps-4 pe-2 shadow-[0_1px_3px_rgb(0_0_0/6%)] dark:shadow-[0_1px_3px_rgb(0_0_0/50%)]">
				<span
					aria-hidden="true"
					className="grid size-4 shrink-0 place-items-center rounded-full bg-warning font-bold text-[11px] text-background leading-none"
				>
					{t("toolQuestion.waiting.mark")}
				</span>
				<p className="min-w-0 truncate font-medium text-compact text-foreground leading-4.5">
					{companionName
						? t("toolQuestion.waiting.title", { name: companionName })
						: t("toolQuestion.waiting.unnamedTitle")}
				</p>
				<p
					className="min-w-0 flex-1 truncate text-compact text-muted-foreground leading-4.5"
					id={questionId}
				>
					{question}
				</p>
				<Button
					aria-describedby={questionId}
					className={cn(QUESTION_INVERSE_PILL_CLASS, "px-3.5")}
					onClick={onExpand}
					type="button"
				>
					{t("toolQuestion.waiting.answer")}
				</Button>
			</div>
		</div>
	)
}

type QuestionFieldsProps = {
	item: ToolQuestionItem
	questionId: string
	errorId?: string
	draft: Draft
	onPick: (label: string) => void
	onType: (text: string) => void
	onSubmit: () => void
}

const QuestionFields = ({
	item,
	questionId,
	errorId,
	draft,
	onPick,
	onType,
	onSubmit,
}: QuestionFieldsProps) => {
	const rows = item.options.map((option, index) => (
		<OptionRow
			digit={index + 1}
			isChecked={draft.selected.includes(option.label)}
			isMultiSelect={Boolean(item.multiSelect)}
			key={option.label}
			onPick={() => onPick(option.label)}
			option={option}
		/>
	))

	if (item.entry) {
		return (
			<EntryField
				entry={item.entry}
				errorId={errorId}
				onSubmit={onSubmit}
				onValueChange={onType}
				value={draft.text}
			/>
		)
	}

	return (
		<>
			{item.multiSelect ? (
				<div
					aria-describedby={errorId}
					aria-invalid={errorId ? true : undefined}
					aria-labelledby={questionId}
					className={QUESTION_GROUP_CLASS}
					role="group"
				>
					{rows}
				</div>
			) : (
				<RadioGroup
					aria-describedby={errorId}
					aria-invalid={errorId ? true : undefined}
					aria-labelledby={questionId}
					className="gap-1.5"
					onValueChange={(label: string) => onPick(label)}
					value={draft.selected[0] ?? ""}
				>
					{rows}
				</RadioGroup>
			)}

			{item.optionsOnly ? null : (
				<OwnAnswerField onValueChange={onType} value={draft.text} />
			)}
		</>
	)
}

type OwnAnswerFieldProps = {
	value: string
	onValueChange: (value: string) => void
}

const OwnAnswerField = ({ value, onValueChange }: OwnAnswerFieldProps) => {
	const { t } = useTranslation("chat")

	return (
		<label className="flex h-11 cursor-text items-center gap-3 rounded-control bg-card px-3 has-[input:focus]:ring-3 has-[input:focus]:ring-ring/30">
			<span
				aria-hidden="true"
				className="grid size-5 shrink-0 place-items-center text-muted-foreground"
			>
				<Icons.Edit className="size-3.75" />
			</span>
			<input
				aria-label={t("toolQuestion.freeText")}
				className="h-full min-w-0 flex-1 bg-transparent text-foreground text-sm leading-5 caret-ring outline-none placeholder:text-muted-foreground"
				onChange={(event) => onValueChange(event.target.value)}
				placeholder={t("toolQuestion.freeTextPlaceholder")}
				value={value}
			/>
			{value ? (
				<Icons.Check
					aria-hidden="true"
					className={cn(QUESTION_CHECK_CLASS, "text-ring")}
					data-slot="tool-question-own-answer-check"
				/>
			) : null}
		</label>
	)
}

type ActionButtonProps = {
	action: ToolQuestionAction
}

const ActionButton = ({
	action: { label, icon: Glyph, onSelect },
}: ActionButtonProps) => (
	<Button
		className={cn(QUESTION_INVERSE_PILL_CLASS, "ms-auto ps-3 pe-3.5")}
		onClick={onSelect}
		type="button"
	>
		<Glyph aria-hidden="true" className={QUESTION_PILL_GLYPH_CLASS} />
		{label}
	</Button>
)

type FailureBlockProps = {
	failure: ToolQuestionFailure
	titleId: string
}

const FailureBlock = ({ failure, titleId }: FailureBlockProps) => (
	<div className={QUESTION_GROUP_CLASS} data-slot="tool-question-failure">
		<div className="flex gap-2">
			<span
				aria-hidden="true"
				className="mt-1.75 size-1.5 shrink-0 rounded-full bg-destructive"
				data-slot="tool-question-failure-dot"
			/>
			<p
				className="min-w-0 flex-1 wrap-break-word font-medium text-foreground text-sm leading-5"
				id={titleId}
			>
				{failure.title}
			</p>
		</div>
		{failure.detail ? (
			<p className="self-start wrap-break-word rounded-md bg-card px-2 py-1 text-start font-mono text-muted-foreground text-xs leading-4.5">
				{failure.detail}
			</p>
		) : null}
	</div>
)

type LinkFieldProps = {
	link: ToolQuestionLink
}

const LinkField = ({ link }: LinkFieldProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(link.url)
	const [hasFailedToCopy, setHasFailedToCopy] = useState(false)
	const id = useId()

	const hasCopied = copied && !hasFailedToCopy
	const CopyGlyph = hasCopied ? Icons.Check : Icons.Copy
	const failed = hasFailedToCopy ? t("toolQuestion.copyFailed") : null
	const announced = hasCopied ? t("toolQuestion.copyAnnounced") : null

	const copyLink = () => {
		setHasFailedToCopy(false)
		copy().catch(() => setHasFailedToCopy(true))
	}

	return (
		<div className={QUESTION_GROUP_CLASS}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{link.label}
			</label>
			<div className={QUESTION_LINK_ROW_CLASS}>
				<input
					className={cn(
						QUESTION_MONO_LINE_CLASS,
						"min-w-0 flex-1 bg-transparent text-foreground outline-none",
					)}
					id={id}
					readOnly
					value={link.url}
				/>
				<Button
					className="h-7 shrink-0 px-2.5 leading-5"
					onClick={copyLink}
					size="sm"
					type="button"
					variant="ghost"
				>
					<CopyGlyph className="size-3.5 text-muted-foreground" />
					{hasCopied ? t("toolQuestion.copied") : t("toolQuestion.copy")}
				</Button>
			</div>
			<span aria-live="polite" className="sr-only">
				{failed ?? announced}
			</span>
		</div>
	)
}

type EntryFieldProps = {
	entry: ToolQuestionEntry
	errorId?: string
	value: string
	onValueChange: (value: string) => void
	onSubmit: () => void
}

const LEGACY_COMPOSITION_KEY_CODE = 229

const isComposing = (event: globalThis.KeyboardEvent) =>
	event.isComposing || event.keyCode === LEGACY_COMPOSITION_KEY_CODE

const EntryField = ({
	entry,
	errorId,
	value,
	onValueChange,
	onSubmit,
}: EntryFieldProps) => {
	const id = useId()

	const readKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter" || isComposing(event.nativeEvent)) return
		event.preventDefault()
		onSubmit()
	}

	return (
		<div className={QUESTION_GROUP_CLASS}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{entry.label}
			</label>
			<input
				aria-describedby={errorId}
				aria-invalid={errorId ? true : undefined}
				autoComplete="off"
				className={cn(
					FIELD_CONTROL_CLASS,
					QUESTION_MONO_LINE_CLASS,
					errorId && FIELD_CONTROL_INVALID_CLASS,
				)}
				id={id}
				onChange={(event) => onValueChange(event.target.value)}
				onKeyDown={readKey}
				placeholder={entry.placeholder}
				spellCheck={false}
				type={entry.isSecret ? "password" : "text"}
				value={value}
			/>
		</div>
	)
}

type OptionRowProps = {
	option: ToolQuestionOption
	digit: number
	isChecked: boolean
	isMultiSelect: boolean
	onPick: () => void
}

const OptionRow = ({
	option,
	digit,
	isChecked,
	isMultiSelect,
	onPick,
}: OptionRowProps) => {
	const { t } = useTranslation("chat")
	const labelId = useId()
	const descriptionId = useId()

	const rowClass = cn(
		QUESTION_ROW_CLASS,
		isChecked
			? "surface-user-bubble on-user-bubble text-user-bubble-foreground"
			: "bg-card text-foreground",
	)

	const content = (
		<>
			<span
				aria-hidden="true"
				className={cn(
					"grid size-5 shrink-0 place-items-center rounded-sm font-medium text-[11px] leading-3 tabular-nums",
					isChecked
						? "bg-user-bubble-foreground/10 text-user-bubble-foreground/80 dark:bg-user-bubble-foreground/15"
						: "bg-foreground/6 text-muted-foreground dark:bg-foreground/8",
				)}
				data-slot="tool-question-key"
			>
				{digit}
			</span>
			<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
				<span
					className="min-w-0 wrap-break-word font-medium text-sm leading-5"
					id={labelId}
				>
					{option.label}
				</span>
				<span
					className={cn(
						"min-w-0 wrap-break-word text-compact leading-5",
						isChecked
							? "text-user-bubble-foreground/70 dark:text-(--color-muted-foreground)"
							: "text-muted-foreground",
					)}
					id={descriptionId}
				>
					{option.description}
				</span>
			</span>
			<span
				aria-hidden="true"
				className="grid size-5 shrink-0 place-items-center"
				data-slot="tool-question-mark"
			>
				<OptionMark isChecked={isChecked} isMultiSelect={isMultiSelect} />
			</span>
		</>
	)

	return (
		<>
			{isMultiSelect ? (
				<CheckboxPrimitive.Root
					data-slot={OPTION_ROW_SLOT}
					aria-describedby={descriptionId}
					aria-labelledby={labelId}
					checked={isChecked}
					className={rowClass}
					onCheckedChange={onPick}
				>
					{content}
				</CheckboxPrimitive.Root>
			) : (
				<RadioPrimitive.Root
					data-slot={OPTION_ROW_SLOT}
					aria-describedby={descriptionId}
					aria-labelledby={labelId}
					className={rowClass}
					value={option.label}
				>
					{content}
				</RadioPrimitive.Root>
			)}
			{isChecked && option.preview ? (
				<div className="grid gap-1 px-3 pb-1">
					<span className="text-muted-foreground text-xs">
						{t("toolQuestion.preview")}
					</span>
					<div className="min-w-0 wrap-break-word font-mono text-foreground text-xs">
						{option.preview}
					</div>
				</div>
			) : null}
		</>
	)
}

type OptionMarkProps = {
	isChecked: boolean
	isMultiSelect: boolean
}

const OptionMark = ({ isChecked, isMultiSelect }: OptionMarkProps) => {
	if (!isMultiSelect) {
		return isChecked ? <Icons.Check className={QUESTION_CHECK_CLASS} /> : null
	}
	return isChecked ? (
		<span className="grid size-5 place-items-center rounded-full bg-user-bubble-foreground text-user-bubble">
			<Icons.Check className="size-3" />
		</span>
	) : (
		<span className="size-5 rounded-full border-[1.5px] border-foreground/17 dark:border-question-option-ring" />
	)
}

export { ToolQuestion }
