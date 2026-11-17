"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"

export type AttachmentStandInProps = {
	name: string
	onOpen: () => void
	children: ReactNode
}

export const AttachmentStandIn = ({
	name,
	onOpen,
	children,
}: AttachmentStandInProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			data-slot="attachment-stand-in"
			className="flex w-full min-w-0 flex-col gap-1"
		>
			{children}
			<Button
				variant="ghost"
				size="xs"
				className="max-w-full self-start"
				onClick={onOpen}
			>
				<Icons.File aria-hidden="true" />
				<span className="truncate">{t("attachments.open", { name })}</span>
			</Button>
		</div>
	)
}
