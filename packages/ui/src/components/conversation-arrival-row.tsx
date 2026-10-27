import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { RosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

type ConversationArrivalInviter =
	| { kind: "person" }
	| { kind: "companion"; bot: RosterBot }

type ConversationArrivalRowProps = Omit<ComponentProps<"p">, "children"> & {
	bot: RosterBot
	inviter: ConversationArrivalInviter
}

const ARRIVAL_AVATAR_SIZE = 16

const ConversationArrivalRow = ({
	bot,
	inviter,
	className,
	...props
}: ConversationArrivalRowProps) => {
	const { t } = useTranslation("chat")
	const sentence =
		inviter.kind === "person"
			? t("conversationArrival.invitedByPerson", { name: bot.name })
			: t("conversationArrival.invitedByCompanion", {
					name: bot.name,
					inviter: inviter.bot.name,
				})

	return (
		<p
			className={cn(
				"flex w-full min-w-0 items-center justify-center gap-1.5 py-0.5 text-center text-muted-foreground text-xs wrap-anywhere",
				className,
			)}
			data-slot="conversation-arrival-row"
			{...props}
		>
			<span aria-hidden="true" className="flex shrink-0">
				<BotIdentityAvatar
					hue={bot.blot}
					image={bot.image}
					name={bot.name}
					seed={bot.id}
					size={ARRIVAL_AVATAR_SIZE}
				/>
			</span>
			<span className="min-w-0">{sentence}</span>
		</p>
	)
}

export { type ConversationArrivalInviter, ConversationArrivalRow }
