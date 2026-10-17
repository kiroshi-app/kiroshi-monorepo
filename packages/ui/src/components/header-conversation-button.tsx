"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { HEADER_IDENTITY_CLASS } from "@workspace/ui/components/header-identity-button"
import { Icons } from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 24

type HeaderConversationButtonProps = Pick<
	ConversationSubjectIconProps,
	"icon" | "color"
> & {
	name: string
	bots: RosterBot[]
	isSettingsOpen?: boolean
	onOpenSettings?: () => void
	className?: string
}

const HeaderConversationButton = ({
	name,
	bots,
	icon,
	color,
	isSettingsOpen = false,
	onOpenSettings,
	className,
}: HeaderConversationButtonProps) => {
	const { t } = useTranslation("chat")

	return (
		<Button
			aria-expanded={isSettingsOpen}
			aria-label={t("screen.conversationIdentity", { name })}
			className={cn(HEADER_IDENTITY_CLASS, className)}
			data-slot="header-conversation-button"
			onClick={onOpenSettings}
			variant="ghost"
		>
			{bots.length > 1 ? (
				<ConversationSubjectIcon color={color} icon={icon} side={AVATAR_SIZE} />
			) : (
				<span className="flex shrink-0 items-center gap-1">
					{bots.map((bot) => (
						<BotIdentityAvatar
							blot={bot.blot}
							image={bot.image}
							key={bot.id}
							name={bot.name}
							seed={bot.id}
							size={AVATAR_SIZE}
						/>
					))}
				</span>
			)}
			<span className="min-w-0 truncate">{name}</span>
			<Icons.Settings aria-hidden="true" className="text-muted-foreground" />
		</Button>
	)
}

export { HeaderConversationButton }
