"use client"

import { useTranslation } from "react-i18next"

import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { cn } from "@workspace/ui/lib/utils"

type QueuedPrompt = {
	id: string
	text: string
}

type PromptQueueProps = {
	items: QueuedPrompt[]
	agentName: string
	readerName?: string
	className?: string
}

const QUEUE_AVATAR_SIZE = 24

const PromptQueue = ({
	items,
	agentName,
	readerName,
	className,
}: PromptQueueProps) => {
	const { t } = useTranslation("chat")

	if (items.length === 0) return null

	return (
		<section
			data-slot="prompt-queue"
			aria-label={t("queue.title", { count: items.length, name: agentName })}
			className={cn(
				"mx-5 flex flex-col rounded-t-[14px] border-foreground/8 border-x border-t bg-prompt-surface-inert p-1.5",
				className,
			)}
		>
			<p className="flex h-8 items-center px-2 font-medium text-faint-foreground text-xs">
				{t("queue.title", { count: items.length, name: agentName })}
			</p>
			<ul className="flex flex-col">
				{items.map((item, index) => (
					<li
						key={item.id}
						data-slot="prompt-queue-item"
						className="flex h-10 items-center gap-2.5 px-2"
					>
						<InitialsAvatar name={readerName} size={QUEUE_AVATAR_SIZE} />
						<span className="shrink-0 font-medium text-compact text-foreground">
							{t("queue.you")}
						</span>
						<span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
							{item.text}
						</span>
						{index === 0 ? (
							<span className="shrink-0 font-medium text-primary text-xs">
								{t("queue.next", { name: agentName })}
							</span>
						) : null}
					</li>
				))}
			</ul>
		</section>
	)
}

export { PromptQueue, type PromptQueueProps, type QueuedPrompt }
