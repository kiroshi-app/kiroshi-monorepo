import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { RosterBot } from "@workspace/ui/components/roster"
import { cn } from "@workspace/ui/lib/utils"

type ConversationArrivalInviter =
	| { kind: "person" }
	| { kind: "companion"; bot: RosterBot }

type ArrivalRowProps = Omit<ComponentProps<"p">, "children"> & {
	bot: RosterBot
	sentence: string
}

const ARRIVAL_AVATAR_SIZE = 16

const ArrivalRow = ({
	bot,
	sentence,
	className,
	...props
}: ArrivalRowProps) => (
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

type ConversationArrivalRowProps = Omit<ComponentProps<"p">, "children"> & {
	bot: RosterBot
	inviter: ConversationArrivalInviter
}

const ConversationArrivalRow = ({
	bot,
	inviter,
	...props
}: ConversationArrivalRowProps) => {
	const { t } = useTranslation("chat")
	const sentence =
		inviter.kind === "person"
			? t("conversationArrival.invitedByPerson", { name: bot.name })
			: t("conversationArrival.invitedByAgent", {
					name: bot.name,
					inviter: inviter.bot.name,
				})

	return <ArrivalRow bot={bot} sentence={sentence} {...props} />
}

type BotCreatedRowProps = Omit<ComponentProps<"p">, "children"> & {
	bot: RosterBot
	creator: string
}

const BotCreatedRow = ({
	bot,
	creator,
	className,
	...props
}: BotCreatedRowProps) => {
	const { t } = useTranslation("chat")

	return (
		<ArrivalRow
			bot={bot}
			className={cn("min-h-9 px-3", className)}
			data-slot="bot-created-row"
			sentence={t("conversationArrival.createdBy", {
				creator,
				name: bot.name,
			})}
			{...props}
		/>
	)
}

export {
	BotCreatedRow,
	type ConversationArrivalInviter,
	ConversationArrivalRow,
}
