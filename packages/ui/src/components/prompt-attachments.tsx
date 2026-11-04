"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@workspace/ui/components/ui/item"
import { cn } from "@workspace/ui/lib/utils"

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

const formatSize = (bytes: number) => {
	const unit = Math.min(
		Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
		SIZE_UNITS.length - 1,
	)
	const value = bytes / 1024 ** unit
	const rounded =
		unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)
	return `${rounded} ${SIZE_UNITS[unit]}`
}

export type PromptAttachment = {
	id: string
	name: string
	size: number
	previewUrl?: string
}

export type PromptReplyAttachment = {
	id: string
	author: string
	excerpt: string
	isExcerpt?: boolean
}

export interface PromptAttachmentsProps {
	items?: PromptAttachment[]
	onRemove?: (id: string) => void
	replies?: PromptReplyAttachment[]
	onRemoveReply?: (id: string) => void
	className?: string
}

const CHIP =
	"flex items-center gap-2 rounded-control border border-foreground/10 bg-foreground/4 p-1"

const CHIP_REMOVE = "size-6 shrink-0 rounded-full text-muted-foreground"

const NO_FILES: PromptAttachment[] = []

const NO_REPLIES: PromptReplyAttachment[] = []

export function PromptAttachments({
	items = NO_FILES,
	onRemove,
	replies = NO_REPLIES,
	onRemoveReply,
	className,
}: PromptAttachmentsProps) {
	const { t } = useTranslation("chat")

	if (items.length === 0 && replies.length === 0) return null

	return (
		<ul
			aria-label={t("attachments.label")}
			data-slot="prompt-attachments"
			className={cn("flex w-full flex-wrap items-center gap-1.5", className)}
		>
			{replies.map((reply) => (
				<Item
					key={reply.id}
					render={<li />}
					variant="outline"
					data-slot="prompt-reply-attachment"
					className={cn(
						CHIP,
						"w-fit min-w-[min(--spacing(59),100%)] max-w-[min(--spacing(90),100%)] flex-nowrap text-[length:inherit] transition-none",
					)}
				>
					<ItemMedia
						variant="icon"
						className="size-8 rounded-md bg-foreground/8 text-soft-foreground"
					>
						<Icons.Reply aria-hidden="true" className="size-4" />
					</ItemMedia>
					<ItemContent className="min-w-0 gap-0">
						<ItemTitle className="line-clamp-none w-auto truncate text-foreground text-xs">
							{reply.author}
						</ItemTitle>
						<ItemDescription
							data-slot="prompt-reply-excerpt"
							className="line-clamp-none truncate text-start text-[11px] leading-3.5"
						>
							{reply.isExcerpt
								? t("reply.excerpt", { excerpt: reply.excerpt })
								: reply.excerpt}
						</ItemDescription>
					</ItemContent>
					{onRemoveReply ? (
						<ItemActions>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label={t("reply.dismissFrom", { author: reply.author })}
								onClick={() => onRemoveReply(reply.id)}
								className={CHIP_REMOVE}
							>
								<Icons.Close />
							</Button>
						</ItemActions>
					) : null}
				</Item>
			))}
			{items.map((item) => (
				<li
					key={item.id}
					data-slot="prompt-attachment"
					className={cn(CHIP, "max-w-56")}
				>
					{item.previewUrl ? (
						<img
							alt=""
							src={item.previewUrl}
							className="image-outline size-8 shrink-0 rounded-md object-cover"
						/>
					) : (
						<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/8 text-muted-foreground">
							<Icons.File aria-hidden="true" className="size-4" />
						</span>
					)}
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-medium text-foreground text-xs">
							{item.name}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{formatSize(item.size)}
						</span>
					</div>
					{onRemove ? (
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label={t("attachments.remove", { name: item.name })}
							onClick={() => onRemove(item.id)}
							className={CHIP_REMOVE}
						>
							<Icons.Close />
						</Button>
					) : null}
				</li>
			))}
		</ul>
	)
}
