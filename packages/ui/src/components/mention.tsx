"use client"

import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { CompanionMenuHost } from "@workspace/ui/components/companion-menu"
import { useCompanionSelect } from "@workspace/ui/components/companion-select"
import { Icons } from "@workspace/ui/components/icons"
import { useRosterBot } from "@workspace/ui/components/roster"
import { clickHandlersFor } from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

const MENTION_AVATAR_SIZE = 16

const MENTION_CLASS =
	"inline-flex max-w-full items-center gap-1 rounded-full bg-current/10 pr-2 pl-1 align-top font-medium"

const SELECTABLE_CLASS =
	"cursor-pointer outline-none hover:bg-current/20 focus-visible:ring-2 focus-visible:ring-current"

const DIM_CLASS = "text-current/70"

const UNKNOWN_CLASS = `pl-2 ${DIM_CLASS}`

const NAME_CLASS = "max-w-40 truncate"

const COUNT_CLASS = "shrink-0 tabular-nums"

const COUNT_GLYPH = "×"

type MentionProps = {
	botId: string
	count?: number
	className?: string
}

const Mention = ({ botId, count = 1, className }: MentionProps) => {
	const { t } = useTranslation("chat")
	const bot = useRosterBot(botId)
	const name = bot?.name ?? t("transcript.mention.unknown")
	const isCounted = count > 1
	const onSelect = useCompanionSelect()

	const selectHandlers =
		onSelect && bot
			? clickHandlersFor((modifiers) => onSelect(bot.id, modifiers))
			: undefined
	const pillProps = {
		className: cn(
			MENTION_CLASS,
			!bot && UNKNOWN_CLASS,
			selectHandlers && SELECTABLE_CLASS,
			className,
		),
		"data-slot": "bot-mention",
		"data-unknown": bot ? undefined : "true",
	}
	const content = (
		<>
			{bot ? (
				<span aria-hidden="true" className="contents">
					<BotIdentityAvatar
						blot={bot.blot}
						image={bot.image}
						name={bot.name}
						seed={bot.id}
						size={MENTION_AVATAR_SIZE}
					/>
				</span>
			) : (
				<Icons.User aria-hidden="true" className="size-3 shrink-0" />
			)}
			<span className={NAME_CLASS} data-slot="bot-mention-name">
				{name}
			</span>
			<BotTitleBadge title={bot?.title} />
			{isCounted ? (
				<>
					<span
						aria-hidden="true"
						className={cn(COUNT_CLASS, bot && DIM_CLASS)}
						data-slot="bot-mention-count"
					>
						{`${COUNT_GLYPH}${count}`}
					</span>
					<span className="sr-only">
						{t("transcript.mention.counted", { count })}
					</span>
				</>
			) : null}
		</>
	)

	return (
		<CompanionMenuHost companionId={bot?.id}>
			{selectHandlers ? (
				<button {...pillProps} {...selectHandlers} type="button">
					{content}
				</button>
			) : (
				<span {...pillProps}>{content}</span>
			)}
		</CompanionMenuHost>
	)
}

export { Mention }
