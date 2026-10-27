"use client"

import { type ReactNode, useId, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	PromptMenuRow,
	PromptMenuSurface,
	usePromptMenu,
} from "@workspace/ui/components/prompt-menu"
import type { RosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

const ROW_AVATAR_SIZE = 24

const OPENING_ROWS = 6

const COUNT_GLYPH = "×"

type MentionBot = RosterBot & {
	isOutside?: boolean
}

interface PromptMentionMenuProps {
	bots: MentionBot[]
	counts?: Record<string, number>
	leadId?: string
	spaceName?: string
	open: boolean
	query: string
	onSelect: (id: string, isOutside: boolean) => void
	onDismiss: () => void
	children: ReactNode
	className?: string
}

const runsFor = (bots: MentionBot[], query: string) => {
	const needle = query.toLocaleLowerCase()
	const named = bots.filter((bot) =>
		bot.name.toLocaleLowerCase().includes(needle),
	)
	const inside = named.filter((bot) => !bot.isOutside)
	const outside = needle ? named.filter((bot) => bot.isOutside) : []
	const shown = needle ? inside : inside.slice(0, OPENING_ROWS)

	return { inside: shown, outside, matches: [...shown, ...outside] }
}

const PromptMentionMenu = ({
	bots,
	counts,
	leadId,
	spaceName,
	open,
	query,
	onSelect,
	onDismiss,
	children,
	className,
}: PromptMentionMenuProps) => {
	const { t } = useTranslation("chat")
	const boundaryId = useId()

	const { inside, outside, matches } = useMemo(
		() => runsFor(bots, query),
		[bots, query],
	)

	const further = query ? 0 : bots.length - matches.length

	const { rootRef, isOpen, active, activateOnPointerMove } = usePromptMenu({
		open,
		query,
		count: matches.length,
		onChoose: (index) => {
			const { id, isOutside } = matches[index]
			onSelect(id, Boolean(isOutside))
		},
		onDismiss,
	})

	const renderRow = (bot: MentionBot, index: number) => {
		const count = counts?.[bot.id] ?? 0
		const isLead = bot.id === leadId

		return (
			<PromptMenuRow
				key={bot.id}
				className="flex h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
				isActive={index === active}
				onPointerMove={activateOnPointerMove(index)}
				onSelect={() => onSelect(bot.id, Boolean(bot.isOutside))}
			>
				<span
					aria-hidden="true"
					className={cn("flex shrink-0", bot.isOutside && "opacity-70")}
				>
					<BotIdentityAvatar
						hue={bot.blot}
						image={bot.image}
						name={bot.name}
						seed={bot.id}
						size={ROW_AVATAR_SIZE}
					/>
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-1.5">
					<span className="flex min-w-0 items-center gap-1">
						<span className="truncate" data-slot="prompt-mention-name">
							{bot.name}
						</span>
						<BotTitleBadge title={bot.title} />
						{count > 0 ? (
							<>
								<span
									aria-hidden="true"
									className="shrink-0 text-muted-foreground tabular-nums"
									data-slot="prompt-mention-count"
								>
									{`${COUNT_GLYPH}${count}`}
								</span>
								<span className="sr-only">
									{t("composer.mentioned", { count })}
								</span>
							</>
						) : null}
					</span>
				</span>
				{isLead || bot.isOutside ? (
					<span
						className="flex w-14 shrink-0 items-center justify-end gap-1"
						data-slot="prompt-mention-trailing"
					>
						{isLead ? (
							<>
								<Icons.Crown
									aria-hidden="true"
									className="size-4 shrink-0 text-bot-badge-attention"
									data-slot="prompt-mention-lead"
								/>
								<span className="sr-only">{t("composer.lead")}</span>
							</>
						) : null}
						{bot.isOutside ? (
							<>
								<Icons.Add
									aria-hidden="true"
									className="size-3.5 shrink-0 text-muted-foreground"
									data-slot="prompt-mention-invite"
								/>
								<span className="sr-only">{t("composer.invite")}</span>
							</>
						) : null}
					</span>
				) : null}
			</PromptMenuRow>
		)
	}

	return (
		<PromptMenuSurface
			className={className}
			footer={
				further > 0 && spaceName ? (
					<div
						className="mt-1.5 flex items-center gap-1.5 border-border border-t p-2 text-muted-foreground text-xs"
						data-slot="prompt-mention-footer"
					>
						<Icons.Search aria-hidden="true" className="size-3.5 shrink-0" />
						<span>
							{t("composer.further", { count: further, space: spaceName })}
						</span>
					</div>
				) : null
			}
			isOpen={isOpen}
			label={t("composer.mentions")}
			panelClassName="absolute bottom-full left-0 z-50 mb-2 w-84 max-w-full overflow-hidden rounded-xl p-1.5 shadow-popover"
			rootRef={rootRef}
			rows={
				<>
					{inside.map(renderRow)}
					{outside.length > 0 ? (
						<div role="group" aria-labelledby={boundaryId}>
							<div
								className="flex items-center gap-2 px-2 pt-3 pb-1.5"
								data-slot="prompt-mention-boundary"
							>
								<span
									id={boundaryId}
									className="shrink-0 font-medium text-muted-foreground text-xs"
								>
									{t("composer.outside")}
								</span>
								<span aria-hidden="true" className="h-px flex-1 bg-border" />
							</div>
							{outside.map((bot, index) =>
								renderRow(bot, inside.length + index),
							)}
						</div>
					) : null}
				</>
			}
			slot="prompt-mention-menu"
		>
			{children}
		</PromptMenuSurface>
	)
}

export { type MentionBot, PromptMentionMenu, type PromptMentionMenuProps }
