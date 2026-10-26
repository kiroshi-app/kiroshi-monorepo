"use client"

import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import type { RosterBot } from "@workspace/ui/components/roster"
import {
	FIELD_LABEL_CLASS,
	SETTINGS_TAG_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const ROW_AVATAR_SIZE = 28

const ROW_CLASS =
	"flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-foreground text-sm hover:bg-muted"

type ParticipantRowProps = {
	bot: RosterBot
	isLead: boolean
	isAlone: boolean
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
}

const ParticipantRow = ({
	bot,
	isLead,
	isAlone,
	onLeadChange,
	onDismiss,
}: ParticipantRowProps) => {
	const { t } = useTranslation("chat")

	return (
		<li className={ROW_CLASS} data-slot="participant">
			<span aria-hidden="true" className="contents">
				<BotIdentityAvatar
					blot={bot.blot}
					image={bot.image}
					name={bot.name}
					seed={bot.id}
					size={ROW_AVATAR_SIZE}
				/>
			</span>
			<span className="flex min-w-0 flex-1 items-center gap-1.5">
				<span className="truncate" data-slot="participant-name">
					{bot.name}
				</span>
				<BotTitleBadge title={bot.title} />
			</span>

			{isLead ? (
				<span
					className={cn(SETTINGS_TAG_CLASS, "flex items-center gap-1")}
					data-slot="participant-lead"
				>
					<Icons.Crown
						aria-hidden="true"
						className="size-3 text-bot-badge-attention"
					/>
					{t("conversationSettings.participants.lead")}
				</span>
			) : (
				<Button
					aria-label={t("conversationSettings.participants.promote", {
						name: bot.name,
					})}
					onClick={() => onLeadChange(bot.id)}
					size="icon-sm"
					variant="ghost"
				>
					<Icons.Crown aria-hidden="true" className="size-3.5" />
				</Button>
			)}

			<Button
				aria-label={t("conversationSettings.participants.dismiss", {
					name: bot.name,
				})}
				disabled={isAlone}
				onClick={() => onDismiss(bot.id)}
				size="icon-sm"
				variant="ghost"
			>
				<Icons.Close aria-hidden="true" className="size-3.5" />
			</Button>
		</li>
	)
}

type ParticipantsPanelProps = {
	participants: RosterBot[]
	leadId: string
	onLeadChange: (id: string) => void
	onDismiss: (id: string) => void
}

const ParticipantsPanel = ({
	participants,
	leadId,
	onLeadChange,
	onDismiss,
}: ParticipantsPanelProps) => {
	const { t } = useTranslation("chat")
	const isAlone = participants.length === 1

	return (
		<div
			className="flex min-h-0 flex-col gap-1.5"
			data-slot="participants-panel"
		>
			<span className={FIELD_LABEL_CLASS}>
				{t("conversationSettings.participants.label")}
			</span>
			<ul className="-mx-2 flex flex-col">
				{participants.map((bot) => (
					<ParticipantRow
						bot={bot}
						isAlone={isAlone}
						isLead={bot.id === leadId}
						key={bot.id}
						onDismiss={onDismiss}
						onLeadChange={onLeadChange}
					/>
				))}
			</ul>
			{isAlone ? (
				<p
					className="text-muted-foreground text-xs"
					data-slot="participants-last"
				>
					{t("conversationSettings.participants.last")}
				</p>
			) : null}
		</div>
	)
}

export { ParticipantsPanel, type ParticipantsPanelProps }
