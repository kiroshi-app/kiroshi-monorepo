"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type QueuedPrompt = {
	id: string
	text: string
}

type PromptQueueProps = {
	items: QueuedPrompt[]
	agentName: string
	readerName?: string
	onSendNow?: (id: string) => void
	onRemove?: (id: string) => void
	className?: string
}

type QueuedRowActionsProps = {
	onSendNow?: () => void
	onRemove?: () => void
}

const REVEALS_WITH_ROW =
	"hidden shrink-0 items-center gap-1 group-focus-within/queued:flex group-hover/queued:flex"

const QueuedRowActions = ({ onSendNow, onRemove }: QueuedRowActionsProps) => {
	const { t } = useTranslation("chat")

	if (!onSendNow && !onRemove) return null

	return (
		<span className={REVEALS_WITH_ROW}>
			{onSendNow ? (
				<Button
					variant="ghost"
					onClick={onSendNow}
					className="h-7 gap-1.5 rounded-full bg-foreground/8 px-2.5 text-compact text-foreground leading-4"
				>
					<Icons.ArrowUp aria-hidden="true" className="size-3.5" />
					{t("queue.sendNow")}
				</Button>
			) : null}
			{onRemove ? (
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("queue.remove")}
					onClick={onRemove}
					className="rounded-full text-faint-foreground"
				>
					<Icons.Close aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}
		</span>
	)
}

const QUEUE_AVATAR_SIZE = 24

const PromptQueue = ({
	items,
	agentName,
	readerName,
	onSendNow,
	onRemove,
	className,
}: PromptQueueProps) => {
	const { t } = useTranslation("chat")
	const titleId = useId()

	if (items.length === 0) return null

	return (
		<section
			data-slot="prompt-queue"
			aria-labelledby={titleId}
			className={cn(
				"mx-5 flex flex-col rounded-t-[14px] border-foreground/8 border-x border-t bg-prompt-surface-inert p-1.5",
				className,
			)}
		>
			<p
				id={titleId}
				className="flex h-8 items-center px-2 font-medium text-faint-foreground text-xs"
			>
				{t("queue.title", { count: items.length, name: agentName })}
			</p>
			<ul className="flex flex-col">
				{items.map((item, index) => (
					<li
						key={item.id}
						data-slot="prompt-queue-item"
						className="group/queued flex h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-prompt-surface hover:pe-1.5 has-focus-visible:bg-prompt-surface has-focus-visible:pe-1.5 dark:has-focus-visible:bg-foreground/4 dark:hover:bg-foreground/4"
					>
						<InitialsAvatar name={readerName} size={QUEUE_AVATAR_SIZE} />
						<span className="shrink-0 font-medium text-compact text-muted-foreground leading-4">
							{t("queue.you")}
						</span>
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
							{item.text}
						</span>
						{index === 0 ? (
							<span className="shrink-0 font-medium text-primary text-xs group-focus-within/queued:hidden group-hover/queued:hidden">
								{t("queue.next", { name: agentName })}
							</span>
						) : null}
						<QueuedRowActions
							onSendNow={onSendNow ? () => onSendNow(item.id) : undefined}
							onRemove={onRemove ? () => onRemove(item.id) : undefined}
						/>
					</li>
				))}
			</ul>
		</section>
	)
}

export { PromptQueue, type PromptQueueProps, type QueuedPrompt }
