"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export const extensionOf = (file: string) => {
	const name = file.slice(file.lastIndexOf("/") + 1)
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toUpperCase() : ""
}

export type AttachmentChipProps = {
	name: string
	extension: string
	onOpen: () => void
	isInline?: boolean
}

export const AttachmentChip = ({
	name,
	extension,
	onOpen,
	isInline = false,
}: AttachmentChipProps) => {
	const { t } = useTranslation("chat")

	return (
		<button
			type="button"
			aria-label={t("attachments.open", { name })}
			data-slot="attachment-chip"
			onClick={onOpen}
			className={cn(
				"flex max-w-56 cursor-pointer items-center gap-2 overflow-hidden rounded-xl border border-foreground/15 bg-foreground/5 p-1 pr-2 text-left outline-none transition-opacity duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none",
				isInline && "not-typeset inline-flex align-middle",
			)}
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
				<Icons.File aria-hidden="true" className="size-4" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-medium text-xs">{name}</span>
				<span className="text-[11px] tracking-wide">{extension}</span>
			</span>
		</button>
	)
}
