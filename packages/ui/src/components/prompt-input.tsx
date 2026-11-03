"use client"

import {
	type FormEvent,
	type ReactNode,
	type Ref,
	type TextareaHTMLAttributes,
	useMemo,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	PromptAttachments,
	type PromptReplyAttachment,
} from "@workspace/ui/components/prompt-attachments"
import { PromptField } from "@workspace/ui/components/prompt-input-field"
import { usePromptLayout } from "@workspace/ui/components/prompt-input-layout"
import { usePromptTransfer } from "@workspace/ui/components/prompt-input-transfer"
import {
	SelectionQuote,
	type SelectionQuoteProps,
} from "@workspace/ui/components/selection-quote"
import { Button } from "@workspace/ui/components/ui/button"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

const OFFLINE_CONTROLS = "[&_svg]:invisible"

const NO_REPLIES: PromptReplyAttachment[] = []

export type PromptInputOffline = {
	spaceName: string
	hostName: string
}

type PromptInputQuote = Pick<
	SelectionQuoteProps,
	"agentName" | "text" | "onRemove"
>

export interface PromptInputProps
	extends Omit<
		TextareaHTMLAttributes<HTMLTextAreaElement>,
		"value" | "defaultValue" | "onChange" | "onSubmit" | "children"
	> {
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	onSubmit?: (value: string) => void
	leading?: ReactNode
	quote?: PromptInputQuote
	replies?: PromptReplyAttachment[]
	onRemoveReply?: (id: string) => void
	attachments?: ReactNode
	onAttach?: (files: File[]) => void
	dropTarget?: boolean
	offline?: PromptInputOffline
	textareaRef?: Ref<HTMLTextAreaElement>
}

export function PromptInput({
	value,
	defaultValue = "",
	onValueChange,
	onSubmit,
	leading,
	quote,
	replies = NO_REPLIES,
	onRemoveReply,
	attachments,
	onAttach,
	dropTarget = false,
	offline,
	className,
	disabled,
	placeholder,
	"aria-label": ariaLabel,
	onKeyDown,
	onPaste,
	textareaRef: externalTextareaRef,
	...textareaProps
}: PromptInputProps) {
	const { t } = useTranslation("chat")
	const [internalValue, setInternalValue] = useState(defaultValue)
	const currentValue = value ?? internalValue
	const isBlocked = disabled || Boolean(offline)
	const canAttach = Boolean(onAttach) && !isBlocked
	const hasReplies = replies.length > 0

	const { refs, isExpanded, hasAttachments } = usePromptLayout({
		attachments,
		currentValue,
	})
	const {
		isDragOver,
		handleDragOver,
		handleDragLeave,
		handleDragEnd,
		handleDrop,
		handlePaste,
	} = usePromptTransfer({ canAttach, onAttach, onPaste })
	const setTextareaRef = useMemo(
		() => mergeRefs(refs.textarea, externalTextareaRef),
		[refs.textarea, externalTextareaRef],
	)

	const hasPayload = Boolean(currentValue.trim()) || hasAttachments
	const isDropTarget = canAttach && (dropTarget || isDragOver)
	const canSubmit = hasPayload && !isBlocked

	const setValue = (next: string) => {
		if (value === undefined) setInternalValue(next)
		onValueChange?.(next)
	}

	const submit = (event?: FormEvent) => {
		event?.preventDefault()
		if (!canSubmit) return

		onSubmit?.(currentValue.trim())
		if (value === undefined) setInternalValue("")
		refs.textarea.current?.focus({ preventScroll: true })
	}

	return (
		<form
			ref={refs.form}
			onSubmit={submit}
			data-slot="prompt-input"
			aria-label={offline ? (ariaLabel ?? t("composer.label")) : undefined}
			data-expanded={isExpanded}
			data-drop-target={isDropTarget}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDragEnd={handleDragEnd}
			onDrop={handleDrop}
			className={cn(
				"flex w-full flex-wrap items-center gap-1 rounded-[25px] border border-foreground/10 bg-prompt-surface p-2 focus-within:border-foreground/20",
				hasPayload && "border-foreground/20",
				isExpanded && "rounded-3xl",
				(hasAttachments || hasReplies || quote) && "rounded-[20px]",
				offline && "border-foreground/8 bg-prompt-surface-inert",
				isDropTarget && "border-primary bg-primary/10",
				disabled && "opacity-50",
				className,
			)}
		>
			{quote && (
				<div
					data-slot="prompt-input-quote"
					inert={isBlocked}
					className="order-first w-full min-w-0 pb-1"
				>
					<SelectionQuote {...quote} />
				</div>
			)}

			<div
				inert={isBlocked}
				className={
					hasReplies ? "order-first flex w-full flex-wrap gap-1.5" : "contents"
				}
			>
				{hasReplies && (
					<PromptAttachments
						className="w-auto"
						onRemoveReply={onRemoveReply}
						replies={replies}
					/>
				)}
				<div
					ref={refs.attachments}
					className={cn(
						"empty:hidden",
						hasReplies ? "min-w-0 flex-1 basis-56" : "order-first w-full",
					)}
				>
					{attachments}
				</div>
			</div>

			<PromptField
				disabled={disabled}
				label={ariaLabel}
				notice={
					offline
						? t("composer.offline", {
								host: offline.hostName,
								space: offline.spaceName,
							})
						: undefined
				}
				onKeyDown={onKeyDown}
				onPaste={handlePaste}
				onSubmit={submit}
				onValueChange={setValue}
				placeholder={placeholder}
				refs={refs}
				textareaProps={textareaProps}
				textareaRef={setTextareaRef}
				value={currentValue}
			/>

			<div
				ref={refs.leading}
				inert={isBlocked}
				className={cn(
					"flex items-center gap-1 empty:hidden",
					!isExpanded && "order-first",
					offline && OFFLINE_CONTROLS,
				)}
			>
				{leading}
			</div>

			<div
				ref={refs.controls}
				inert={isBlocked}
				className={cn("ms-auto flex items-center", offline && OFFLINE_CONTROLS)}
			>
				<Button
					type="submit"
					size="icon"
					disabled={disabled}
					aria-label={t("composer.send")}
					data-empty={!hasPayload}
					className={cn(
						"size-8 rounded-full",
						hasPayload
							? "bg-foreground text-on-foreground hover:bg-foreground"
							: "bg-foreground/8 text-disabled-foreground hover:bg-foreground/8",
					)}
				>
					<Icons.Send />
				</Button>
			</div>
		</form>
	)
}
