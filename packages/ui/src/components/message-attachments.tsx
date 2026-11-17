"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Gallery } from "@workspace/ui/components/answer-blocks/gallery"
import {
	AttachmentChip,
	extensionOf,
} from "@workspace/ui/components/attachment-chip"
import { AttachmentStandIn } from "@workspace/ui/components/attachment-stand-in"
import {
	type ImageMenuActions,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

export type MessageAttachment = {
	id: string
	name: string
	previewUrl?: string
}

export type RenderMessageAttachment = (item: MessageAttachment) => ReactNode

export interface MessageAttachmentsProps {
	items: MessageAttachment[]
	onOpen: (id: string) => void
	imageMenu?: ImageMenuActions<string>
	renderAttachment?: RenderMessageAttachment
	className?: string
}

export function MessageAttachments({
	items,
	onOpen,
	imageMenu,
	renderAttachment,
	className,
}: MessageAttachmentsProps) {
	const { t } = useTranslation("chat")

	if (items.length === 0) return null

	const images = items.filter((item) => item.previewUrl)
	const files = items.filter((item) => !item.previewUrl)
	const idAt = (index: number) => images[index].id

	return (
		<ul
			aria-label={t("attachments.label")}
			data-slot="message-attachments"
			className={cn(
				"not-typeset mb-2 flex flex-wrap items-start gap-1.5 last:mb-0",
				className,
			)}
		>
			{images.length > 0 ? (
				<li className="min-w-0 basis-full">
					<Gallery
						images={images.map((item) => ({
							src: item.previewUrl ?? "",
							alt: item.name,
						}))}
						imageMenu={imageMenu && imageMenuActionsFor(imageMenu, idAt)}
						onOpen={(index) => onOpen(idAt(index))}
						tileLabel="open"
					/>
				</li>
			) : null}
			{files.map((item) => {
				const rendering = renderAttachment?.(item)
				return rendering == null ? (
					<li key={item.id} data-slot="message-attachment">
						<AttachmentChip
							name={item.name}
							extension={extensionOf(item.name)}
							onOpen={() => onOpen(item.id)}
						/>
					</li>
				) : (
					<li
						key={item.id}
						data-slot="message-attachment"
						className="min-w-0 basis-full"
					>
						<AttachmentStandIn name={item.name} onOpen={() => onOpen(item.id)}>
							{rendering}
						</AttachmentStandIn>
					</li>
				)
			})}
		</ul>
	)
}
