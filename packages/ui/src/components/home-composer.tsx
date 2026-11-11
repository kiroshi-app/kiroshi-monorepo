"use client"

import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type HomeAgent,
	HomeAgentPicker,
} from "@workspace/ui/components/home-agent-picker"
import { Icons } from "@workspace/ui/components/icons"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import {
	type PromptAttachment,
	PromptAttachments,
} from "@workspace/ui/components/prompt-attachments"
import { PromptField } from "@workspace/ui/components/prompt-input-field"
import { usePromptLayout } from "@workspace/ui/components/prompt-input-layout"
import { usePromptTransfer } from "@workspace/ui/components/prompt-input-transfer"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const NO_ATTACHMENTS: PromptAttachment[] = []

type HomeComposerProps = {
	agents: HomeAgent[]
	selectedAgentId: string
	onSelectAgent: (id: string) => void
	onAttach: (files: File[]) => void
	attachments?: PromptAttachment[]
	onRemoveAttachment?: (id: string) => void
	value?: string
	defaultValue?: string
	onValueChange?: (value: string) => void
	onSubmit?: (value: string) => void
	band?: ReactNode
	sending?: boolean
	arrivalKey?: string
}

type SendButtonProps = { isFilled: boolean; isSending?: boolean }

const SendButton = ({ isFilled, isSending = false }: SendButtonProps) => {
	const { t } = useTranslation("chat")
	const looksFilled = isFilled && !isSending

	return (
		<Button
			aria-busy={isSending || undefined}
			aria-disabled={isSending || undefined}
			aria-label={t("composer.send")}
			className={cn(
				"size-8 rounded-full transition-none disabled:opacity-100",
				!looksFilled &&
					"bg-foreground/8 text-disabled-foreground hover:bg-foreground/8",
				isSending && "active:not-aria-[haspopup]:translate-y-0",
			)}
			data-filled={looksFilled}
			disabled={!isFilled && !isSending}
			size="icon"
			type="submit"
		>
			<Icons.Send />
		</Button>
	)
}

const HomeComposer = ({
	agents,
	selectedAgentId,
	onSelectAgent,
	onAttach,
	attachments = NO_ATTACHMENTS,
	onRemoveAttachment,
	value,
	defaultValue = "",
	onValueChange,
	onSubmit,
	band,
	sending = false,
	arrivalKey,
}: HomeComposerProps) => {
	const { t } = useTranslation("chat")
	const [internalValue, setInternalValue] = useState(defaultValue)
	const currentValue = value ?? internalValue
	const hasPayload = currentValue.trim() !== "" || attachments.length > 0
	const { refs } = usePromptLayout({ currentValue })
	const { handlePaste } = usePromptTransfer({ canAttach: true, onAttach })
	const selectedAgent =
		agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]

	const setValue = (next: string) => {
		if (value === undefined) setInternalValue(next)
		onValueChange?.(next)
	}

	const submit = (event?: FormEvent) => {
		event?.preventDefault()
		if (!hasPayload || sending) return
		onSubmit?.(currentValue.trim())
		if (value === undefined) setInternalValue("")
	}

	useEffect(() => {
		const field = refs.textarea.current
		if (arrivalKey === undefined || !field) return
		field.focus({ preventScroll: true })
		field.setSelectionRange(field.value.length, field.value.length)
	}, [arrivalKey, refs.textarea])

	const removeAttachment = (id: string) => {
		onRemoveAttachment?.(id)
		refs.textarea.current?.focus({ preventScroll: true })
	}

	return (
		<form
			className="flex w-full flex-col overflow-clip rounded-[20px] border border-foreground/10 bg-prompt-surface-inert"
			data-slot="home-composer"
			onSubmit={submit}
			ref={refs.form}
		>
			<div
				className={cn(
					"flex flex-col gap-3 rounded-[20px] bg-prompt-surface p-3",
					band && "border-foreground/8 border-b",
				)}
			>
				<PromptAttachments
					items={attachments}
					onRemove={onRemoveAttachment && removeAttachment}
				/>
				<div className="flex">
					<PromptField
						onPaste={handlePaste}
						onSubmit={submit}
						onValueChange={setValue}
						placeholder={
							selectedAgent
								? t("home.composer.placeholder", { name: selectedAgent.name })
								: t("composer.placeholder")
						}
						refs={refs}
						size="large"
						textareaProps={{}}
						textareaRef={refs.textarea}
						value={currentValue}
					/>
				</div>
				<div className="flex items-center gap-2" ref={refs.controls}>
					<PromptAttachButton
						className="me-auto"
						hasLabel
						onAttach={onAttach}
					/>
					<HomeAgentPicker
						agents={agents}
						onSelectAgent={onSelectAgent}
						selected={selectedAgent}
					/>
					<SendButton isFilled={hasPayload} isSending={sending} />
				</div>
			</div>
			{band}
		</form>
	)
}

export { HomeComposer, type HomeComposerProps }
