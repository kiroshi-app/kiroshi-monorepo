"use client"

import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	HeaderIslandButton,
	useIsInHeaderIsland,
} from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import {
	PopoverPanel,
	PopoverPanelContent,
	PopoverPanelTrigger,
} from "@workspace/ui/components/popover-panel"
import { Button } from "@workspace/ui/components/ui/button"

const PINNED_AVATAR_SIZE = 24

interface PinnedMessage {
	id: string
	author: string
	avatar: ReactNode
	timestamp: string
	excerpt: string
}

interface PinnedMessagesProps {
	messages: PinnedMessage[]
	onJump: (messageId: string) => void
	onUnpin: (messageId: string) => void
	className?: string
}

interface PinnedMessageRowProps {
	message: PinnedMessage
	onJump: () => void
	onUnpin: () => void
}

const PinnedMessageRow = ({
	message: { author, avatar, timestamp, excerpt },
	onJump,
	onUnpin,
}: PinnedMessageRowProps) => {
	const { t } = useTranslation("chat")

	return (
		<li
			data-slot="pinned-message"
			className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 px-4 py-3 hover:bg-muted/40"
		>
			<span aria-hidden="true" className="row-span-2 shrink-0">
				{avatar}
			</span>
			<div className="flex items-center gap-2">
				<span className="min-w-0 truncate font-medium text-sm">{author}</span>
				<span className="shrink-0 text-muted-foreground text-xs">
					{timestamp}
				</span>
				<span className="-mr-1.5 ml-auto flex shrink-0 items-center gap-0.5">
					<Button
						data-slot="pinned-message-jump"
						size="xs"
						variant="ghost"
						aria-label={t("pinned.jumpTo", { author })}
						onClick={onJump}
					>
						{t("pinned.jump")}
					</Button>
					<Button
						data-slot="pinned-message-unpin"
						size="icon-xs"
						variant="ghost"
						aria-label={t("pinned.unpin", { author })}
						onClick={onUnpin}
					>
						<Icons.Unpin />
					</Button>
				</span>
			</div>
			<p className="line-clamp-3 text-muted-foreground text-sm">{excerpt}</p>
		</li>
	)
}

const PinnedMessages = ({
	messages,
	onJump,
	onUnpin,
	className,
}: PinnedMessagesProps) => {
	const { t } = useTranslation("chat")
	const [isOpen, setIsOpen] = useState(false)
	const isInIsland = useIsInHeaderIsland()
	const title = t("pinned.title")
	const count = messages.length
	const hasPins = count > 0
	const triggerLabel = hasPins ? t("pinned.counted", { count }) : title
	const triggerMark = (
		<>
			<Icons.Pin />
			{hasPins ? count : null}
		</>
	)

	const jumpTo = (messageId: string) => {
		setIsOpen(false)
		onJump(messageId)
	}

	return (
		<PopoverPanel
			open={isOpen}
			onOpenChange={setIsOpen}
			placement="bottom-end"
			className={className}
		>
			<PopoverPanelTrigger>
				{isInIsland ? (
					<HeaderIslandButton
						data-slot="pinned-messages-trigger"
						aria-label={triggerLabel}
						className={
							hasPins ? "w-auto gap-1 px-2 text-xs tabular-nums" : undefined
						}
					>
						{triggerMark}
					</HeaderIslandButton>
				) : (
					<Button
						data-slot="pinned-messages-trigger"
						size={hasPins ? "sm" : "icon-sm"}
						variant="ghost"
						aria-label={triggerLabel}
						className={
							hasPins ? "h-7 gap-1 px-2 text-xs tabular-nums" : undefined
						}
					>
						{triggerMark}
					</Button>
				)}
			</PopoverPanelTrigger>
			<PopoverPanelContent
				aria-label={title}
				className="w-80 overflow-hidden rounded-2xl p-0"
			>
				<p className="border-border border-b px-4 py-3 font-medium text-sm">
					{title}
				</p>
				{hasPins ? (
					<ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
						{messages.map((message) => (
							<PinnedMessageRow
								key={message.id}
								message={message}
								onJump={() => jumpTo(message.id)}
								onUnpin={() => onUnpin(message.id)}
							/>
						))}
					</ul>
				) : (
					<p className="px-4 py-3 text-muted-foreground text-sm">
						{t("pinned.empty")}
					</p>
				)}
			</PopoverPanelContent>
		</PopoverPanel>
	)
}

export {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
	type PinnedMessagesProps,
}
