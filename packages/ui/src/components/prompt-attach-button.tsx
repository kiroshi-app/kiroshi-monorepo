"use client"

import { type ChangeEvent, useRef } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

export interface PromptAttachButtonProps {
	onAttach: (files: File[]) => void
	disabled?: boolean
	className?: string
}

export function PromptAttachButton({
	onAttach,
	disabled,
	className,
}: PromptAttachButtonProps) {
	const { t } = useTranslation("chat")
	const label = t("attachments.attach")
	const fileRef = useRef<HTMLInputElement>(null)

	const handleBrowsed = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		if (files.length > 0) onAttach(files)
		event.target.value = ""
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={label}
				disabled={disabled}
				onClick={() => fileRef.current?.click()}
				className={cn(
					"size-8 rounded-full border-foreground/12 text-soft-foreground",
					className,
				)}
			>
				<Icons.Add />
			</Button>
			<input
				aria-label={label}
				className="hidden"
				multiple
				onChange={handleBrowsed}
				ref={fileRef}
				type="file"
			/>
		</>
	)
}
