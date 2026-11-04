"use client"

import { type ReactNode, useContext } from "react"
import { useTranslation } from "react-i18next"

import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { TOUCH_GESTURE_CONTENT_CLASS } from "@workspace/ui/lib/touch"
import { cn } from "@workspace/ui/lib/utils"

interface MessageActionsProps {
	menu?: ReactNode
	children: ReactNode
}

interface MessageActionProps {
	label: string
	onClick: () => void
	children: ReactNode
}

interface MessageMenuItemProps {
	label: string
	onClick: () => void
	children: ReactNode
}

const MESSAGE_MENU =
	"w-42 min-w-42! rounded-2xl bg-menu-surface p-1 shadow-popover ring-0"

const MESSAGE_MENU_ITEM =
	"h-8 min-h-8 gap-2 rounded-xl px-2 py-0 text-compact [&_svg]:size-3.5"

function MessageActions({ menu, children }: MessageActionsProps) {
	const { t } = useTranslation("chat")
	const side = useContext(MessageSideContext) ?? "start"

	const row = (
		<div
			data-slot="message-actions"
			className={cn("flex max-w-full", side === "end" && "justify-end")}
		>
			{children}
		</div>
	)

	if (!menu) return row

	return (
		<ContextMenu>
			<ContextMenuTrigger
				className={TOUCH_GESTURE_CONTENT_CLASS}
				render={row}
			/>
			<ContextMenuContent
				aria-label={t("transcript.message.actions")}
				className={cn(MESSAGE_MENU, STILL_UNDER_REDUCED_MOTION)}
			>
				{menu}
			</ContextMenuContent>
		</ContextMenu>
	)
}

function MessageMenuItem({ label, onClick, children }: MessageMenuItemProps) {
	return (
		<ContextMenuItem
			label={label}
			onClick={onClick}
			className={MESSAGE_MENU_ITEM}
		>
			{children}
		</ContextMenuItem>
	)
}

function MessageAction({ label, onClick, children }: MessageActionProps) {
	return (
		<TooltipButton
			size="icon-xs"
			variant="ghost"
			aria-label={label}
			tooltip={label}
			onClick={onClick}
			className="rounded-sm text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
		>
			{children}
		</TooltipButton>
	)
}

export { MessageAction, MessageActions, MessageMenuItem }
