"use client"

import { useTranslation } from "react-i18next"

import { Gallery } from "@workspace/ui/components/answer-blocks/gallery"
import { Icons } from "@workspace/ui/components/icons"
import {
	type ImageMenuActions,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toUpperCase() : ""
}

export type MessageAttachment = {
	id: string
	name: string
	previewUrl?: string
}

export interface MessageAttachmentsProps {
	items: MessageAttachment[]
	onOpen: (id: string) => void
	imageMenu?: ImageMenuActions<string>
	className?: string
}

export function MessageAttachments({
	items,
	onOpen,
	imageMenu,
	className,
}: MessageAttachmentsProps) {
	const { t } = useTranslation("chat")

	if (items.length === 0) return null

	const images = items.filter((item) => item.previewUrl)
	const files = items.filter((item) => !item.previewUrl)
	const idAt = (index: number) => images[index].id

	return (
		<div
			aria-label={t("attachments.label")}
			data-slot="message-attachments"
			role="group"
			className={cn(
				"not-typeset mb-2 flex flex-col gap-1.5 last:mb-0",
				className,
			)}
		>
			{images.length > 0 ? (
				<Gallery
					images={images.map((item) => ({
						src: item.previewUrl ?? "",
						alt: item.name,
					}))}
					imageMenu={imageMenu && imageMenuActionsFor(imageMenu, idAt)}
					onOpen={(index) => onOpen(idAt(index))}
				/>
			) : null}
			{files.length > 0 ? (
				<ul className="flex flex-wrap items-start gap-1.5">
					{files.map((item) => (
						<li key={item.id} data-slot="message-attachment">
							<button
								type="button"
								aria-label={t("attachments.open", { name: item.name })}
								onClick={() => onOpen(item.id)}
								className="flex max-w-56 cursor-pointer items-center gap-2 overflow-hidden rounded-xl border border-foreground/15 bg-foreground/5 p-1 pr-2 text-left outline-none transition-opacity duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent motion-reduce:transition-none"
							>
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
									<Icons.File aria-hidden="true" className="size-4" />
								</span>
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium text-xs">
										{item.name}
									</span>
									<span className="text-[11px] tracking-wide">
										{extensionOf(item.name)}
									</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}
