"use client"

import { type FormEvent, type ReactNode, useState } from "react"
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
import { Skeleton } from "@workspace/ui/components/ui/skeleton"
import { cn } from "@workspace/ui/lib/utils"

const SHELL =
	"flex w-full flex-col overflow-clip rounded-[20px] border border-foreground/10 bg-prompt-surface-inert"

const FIELD_CARD = "flex flex-col gap-3 rounded-[20px] bg-prompt-surface p-3"

const ACTIONS = "flex items-center gap-2"

const SKELETON_FILL = "bg-foreground/6"

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
}

type SendButtonProps = { isFilled: boolean }

const SendButton = ({ isFilled }: SendButtonProps) => {
	const { t } = useTranslation("chat")

	return (
		<Button
			aria-label={t("composer.send")}
			className={cn(
				"size-8 rounded-full transition-none disabled:opacity-100",
				!isFilled && "bg-foreground/8 text-disabled-foreground",
			)}
			data-filled={isFilled}
			disabled={!isFilled}
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
		if (!hasPayload) return
		onSubmit?.(currentValue.trim())
		if (value === undefined) setInternalValue("")
	}

	const removeAttachment = (id: string) => {
		onRemoveAttachment?.(id)
		refs.textarea.current?.focus({ preventScroll: true })
	}

	return (
		<form
			className={SHELL}
			data-slot="home-composer"
			onSubmit={submit}
			ref={refs.form}
		>
			<div className={cn(FIELD_CARD, band && "border-foreground/8 border-b")}>
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
				<div className={ACTIONS} ref={refs.controls}>
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
					<SendButton isFilled={hasPayload} />
				</div>
			</div>
			{band}
		</form>
	)
}

const HomeComposerSkeleton = () => (
	<div className={SHELL} data-slot="home-composer-skeleton" inert>
		<div className={FIELD_CARD}>
			<div className="min-h-14 p-1">
				<Skeleton
					className={cn("mt-1.25 h-3.5 w-35 rounded-full", SKELETON_FILL)}
				/>
			</div>
			<div className={ACTIONS}>
				<PromptAttachButton
					className="me-auto"
					hasLabel
					onAttach={() => undefined}
				/>
				<Skeleton className="h-8 w-21 rounded-2xl bg-foreground/5" />
				<SendButton isFilled={false} />
			</div>
		</div>
	</div>
)

export { HomeComposer, type HomeComposerProps, HomeComposerSkeleton }
