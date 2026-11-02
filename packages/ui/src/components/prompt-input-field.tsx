"use client"

import type {
	ClipboardEvent,
	KeyboardEvent,
	Ref,
	TextareaHTMLAttributes,
} from "react"
import { useTranslation } from "react-i18next"

import {
	MIN_ROWS,
	type PromptRefs,
} from "@workspace/ui/components/prompt-input-layout"
import { cn } from "@workspace/ui/lib/utils"

const NOTICE = "px-2 py-1 text-muted-foreground text-reading leading-6"

const MIRROR =
	"pointer-events-none invisible absolute top-0 left-0 px-2 text-reading leading-6"

type PromptFieldProps = {
	value: string
	refs: PromptRefs
	textareaRef: Ref<HTMLTextAreaElement>
	textareaProps: TextareaHTMLAttributes<HTMLTextAreaElement>
	disabled?: boolean
	placeholder?: string
	label?: string
	notice?: string
	onValueChange: (value: string) => void
	onSubmit: () => void
	onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
	onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void
}

const PromptField = ({
	value,
	refs,
	textareaRef,
	textareaProps,
	disabled,
	placeholder,
	label,
	notice,
	onValueChange,
	onSubmit,
	onKeyDown,
	onPaste,
}: PromptFieldProps) => {
	const { t } = useTranslation("chat")

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		onKeyDown?.(event)
		if (
			event.defaultPrevented ||
			event.key !== "Enter" ||
			event.shiftKey ||
			event.nativeEvent.isComposing
		) {
			return
		}
		event.preventDefault()
		onSubmit()
	}

	return (
		<div
			ref={refs.prompt}
			className="relative min-w-0 grow-[999] overflow-hidden"
		>
			{notice ? (
				<p className={NOTICE} data-slot="prompt-input-notice" role="status">
					{notice}
				</p>
			) : (
				<>
					<div
						ref={refs.singleLine}
						aria-hidden="true"
						className={cn(MIRROR, "w-max whitespace-pre")}
					>
						{`${value}\u200b`}
					</div>
					<div
						ref={refs.measurement}
						aria-hidden="true"
						className={cn(
							MIRROR,
							"whitespace-pre-wrap [overflow-wrap:break-word]",
						)}
					>
						{`${value}\u200b`}
					</div>
					<textarea
						ref={textareaRef}
						value={value}
						disabled={disabled}
						placeholder={placeholder ?? t("composer.placeholder")}
						aria-label={label ?? t("composer.label")}
						rows={MIN_ROWS}
						{...textareaProps}
						onChange={(event) => onValueChange(event.target.value)}
						onKeyDown={handleKeyDown}
						onPaste={onPaste}
						className="block w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-foreground text-reading leading-6 outline-none placeholder:text-faint-foreground disabled:cursor-not-allowed [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/22 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1"
					/>
				</>
			)}
		</div>
	)
}

export { PromptField }
