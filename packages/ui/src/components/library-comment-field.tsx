"use client"

import {
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	type SyntheticEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { LibraryCommentAuthor } from "@workspace/ui/components/library-comment-author"
import {
	type MentionEdit,
	mentionQueryAt,
	mentionRunsOf,
	withMention,
	withTrigger,
} from "@workspace/ui/components/library-comment-mentions"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { cn } from "@workspace/ui/lib/utils"

const ZERO_WIDTH_SPACE = "​"

const COMMENT_ICON_BUTTON =
	"size-7 rounded-full transition-none hover:bg-foreground/8 active:bg-foreground/12 dark:hover:bg-foreground/8"

type LibraryCommentDraftOptions = {
	value: string
	onValueChange: (value: string) => void
	onSubmit: () => void
	participants: LibraryCommentAuthor[]
}

const useLibraryCommentDraft = ({
	value,
	onValueChange,
	onSubmit,
	participants,
}: LibraryCommentDraftOptions) => {
	const fieldRef = useRef<HTMLTextAreaElement>(null)
	const pendingCaret = useRef<number | null>(null)
	const [caret, setCaret] = useState(value.length)
	const [isFocused, setFocused] = useState(false)
	const [dismissedStart, setDismissedStart] = useState<number | null>(null)

	const mention = mentionQueryAt(value, caret)
	const isMentioning = mention !== null && mention.start !== dismissedStart
	const canSend = value.trim().length > 0

	useLayoutEffect(() => {
		if (pendingCaret.current === null) return
		fieldRef.current?.setSelectionRange(
			pendingCaret.current,
			pendingCaret.current,
		)
		pendingCaret.current = null
	})

	const write = (edit: MentionEdit) => {
		pendingCaret.current = edit.caret
		setCaret(edit.caret)
		setDismissedStart(null)
		onValueChange(edit.value)
		fieldRef.current?.focus()
	}

	const track = (field: HTMLTextAreaElement) => {
		setCaret(field.selectionStart)
		if (mentionQueryAt(field.value, field.selectionStart) === null)
			setDismissedStart(null)
	}

	return {
		canSend,
		names: participants.map((participant) => participant.name),
		submit: (event: FormEvent) => {
			event.preventDefault()
			if (canSend) onSubmit()
		},
		openMentions: () => {
			if (isMentioning) fieldRef.current?.focus()
			else write(withTrigger(value, caret))
		},
		field: {
			ref: fieldRef,
			value,
			onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
				onValueChange(event.currentTarget.value)
				track(event.currentTarget)
			},
			onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) =>
				track(event.currentTarget),
			onFocus: () => setFocused(true),
			onBlur: () => setFocused(false),
			onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
				if (event.key !== "Enter" || event.shiftKey) return
				if (event.nativeEvent.isComposing) return
				event.preventDefault()
				if (canSend) onSubmit()
			},
		},
		menu: {
			participants,
			open: isFocused && isMentioning,
			query: mention?.query ?? "",
			onSelect: (participant: LibraryCommentAuthor) => {
				if (mention) write(withMention(value, mention, participant.name))
			},
			onDismiss: () => setDismissedStart(mention?.start ?? null),
		},
	}
}

type LibraryCommentDraft = ReturnType<typeof useLibraryCommentDraft>

type LibraryCommentTextFieldProps = {
	draft: LibraryCommentDraft
	placeholder: string
	className?: string
}

const LibraryCommentTextField = ({
	draft,
	placeholder,
	className,
}: LibraryCommentTextFieldProps) => (
	<span
		className={cn("grid min-w-0 break-words ps-0.5 text-sm", className)}
		data-slot="library-comment-field"
	>
		<span
			aria-hidden="true"
			className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap text-foreground"
		>
			{mentionRunsOf(draft.field.value, draft.names).map((run) =>
				run.isMention ? (
					<span
						className="text-primary"
						data-slot="library-comment-mention"
						key={run.start}
					>
						{run.text}
					</span>
				) : (
					run.text
				),
			)}
			{ZERO_WIDTH_SPACE}
		</span>
		<textarea
			aria-label={placeholder}
			className="col-start-1 row-start-1 resize-none overflow-hidden bg-transparent text-transparent caret-primary outline-none placeholder:text-placeholder-foreground"
			placeholder={placeholder}
			rows={1}
			{...draft.field}
		/>
	</span>
)

type LibraryCommentDraftControlProps = { draft: LibraryCommentDraft }

const LibraryCommentMentionButton = ({
	draft,
}: LibraryCommentDraftControlProps) => {
	const { t } = useTranslation("common")

	return (
		<TooltipButton
			aria-label={t("library.comments.composer.mention")}
			className={cn(COMMENT_ICON_BUTTON, "text-muted-foreground")}
			onClick={draft.openMentions}
			size="icon-sm"
			tooltip={t("library.comments.composer.mention")}
			type="button"
			variant="ghost"
		>
			<Icons.Mention aria-hidden="true" />
		</TooltipButton>
	)
}

const LibraryCommentSendButton = ({
	draft,
}: LibraryCommentDraftControlProps) => {
	const { t } = useTranslation("common")

	return (
		<TooltipButton
			aria-label={t("library.comments.composer.send")}
			className="size-7 rounded-full transition-none disabled:bg-muted disabled:text-disabled-foreground disabled:opacity-100 dark:disabled:bg-foreground/8"
			disabled={!draft.canSend}
			size="icon-sm"
			tooltip={t("library.comments.composer.send")}
			type="submit"
		>
			<Icons.Send aria-hidden="true" />
		</TooltipButton>
	)
}

export {
	COMMENT_ICON_BUTTON,
	type LibraryCommentDraft,
	type LibraryCommentDraftOptions,
	LibraryCommentMentionButton,
	LibraryCommentSendButton,
	LibraryCommentTextField,
	useLibraryCommentDraft,
}
