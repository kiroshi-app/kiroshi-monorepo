import { type ComponentProps, useId } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import type { RosterBot } from "@workspace/ui/components/roster"
import { SpaceTint } from "@workspace/ui/components/space-tint"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type SuggestionProps =
	| { suggestedBots?: never; onSuggestedBotPress?: never }
	| {
			suggestedBots: RosterBot[]
			onSuggestedBotPress: (bot: RosterBot) => void
	  }

type ConversationEmptyStateProps = Omit<
	ComponentProps<"div">,
	"children" | "title"
> &
	Pick<ConversationSubjectIconProps, "icon" | "color"> & {
		title: string
		bots: RosterBot[]
		spaceName?: string
		spaceTint?: BotAvatarBlot | null
	} & SuggestionProps

const MARK_SIZE = 56

const SUGGESTED_AVATAR_SIZE = 20

const MENTION_GLYPH = "@"

type SpaceLineProps = {
	name: string
	tint?: BotAvatarBlot | null
}

const SpaceLine = ({ name, tint }: SpaceLineProps) => (
	<p
		className="flex min-w-0 max-w-full items-center gap-2 text-muted-foreground text-sm"
		data-slot="conversation-empty-space"
	>
		<SpaceTint className="rounded-sm" tint={tint} />
		<span className="min-w-0 truncate">{name}</span>
	</p>
)

type SuggestedBotsProps = {
	bots: RosterBot[]
	onPress: (bot: RosterBot) => void
}

const SuggestedBots = ({ bots, onPress }: SuggestedBotsProps) => {
	const { t } = useTranslation("chat")
	const labelId = useId()

	return (
		<div
			aria-labelledby={labelId}
			className="flex w-full max-w-md flex-col items-center gap-2.5"
			data-slot="conversation-suggested-bots"
			role="group"
		>
			<p className="text-muted-foreground text-xs" id={labelId}>
				{t("conversationEmptyState.nobody.suggested")}
			</p>
			<div className="flex max-w-full flex-wrap justify-center gap-2">
				{bots.map((bot) => (
					<Button
						className="max-w-full rounded-full ps-1.5 text-foreground"
						data-slot="conversation-suggested-bot"
						key={bot.id}
						onClick={() => onPress(bot)}
						variant="outline"
					>
						<span aria-hidden="true" className="flex shrink-0">
							<BotIdentityAvatar
								blot={bot.blot}
								image={bot.image}
								name={bot.name}
								seed={bot.id}
								size={SUGGESTED_AVATAR_SIZE}
							/>
						</span>
						<span className="min-w-0 truncate">{bot.name}</span>
					</Button>
				))}
			</div>
		</div>
	)
}

const ConversationEmptyState = ({
	title,
	bots,
	icon,
	color,
	spaceName,
	spaceTint,
	suggestedBots,
	onSuggestedBotPress,
	className,
	...props
}: ConversationEmptyStateProps) => {
	const { t } = useTranslation("chat")
	const [soloBot] = bots
	const eyebrow = spaceName ? (
		<SpaceLine name={spaceName} tint={spaceTint} />
	) : undefined

	if (bots.length === 0) {
		return (
			<EmptyStateShell
				action={
					suggestedBots && suggestedBots.length > 0 ? (
						<SuggestedBots bots={suggestedBots} onPress={onSuggestedBotPress} />
					) : undefined
				}
				className={cn("m-auto", className)}
				data-slot="conversation-empty-state"
				description={t("conversationEmptyState.nobody.description")}
				eyebrow={eyebrow}
				mark={
					<span
						aria-hidden="true"
						className="grid size-14 place-items-center rounded-[1rem] border border-border text-2xl text-muted-foreground leading-7"
						data-slot="conversation-empty-mark"
					>
						{MENTION_GLYPH}
					</span>
				}
				title={t("conversationEmptyState.nobody.title")}
				{...props}
			/>
		)
	}

	return (
		<EmptyStateShell
			className={cn("m-auto", className)}
			data-slot="conversation-empty-state"
			description={t("conversationEmptyState.description", {
				count: bots.length,
			})}
			eyebrow={eyebrow}
			hint={t("conversationEmptyState.hint")}
			mark={
				bots.length > 1 ? (
					<ConversationSubjectIcon color={color} icon={icon} side={MARK_SIZE} />
				) : (
					<BotIdentityAvatar
						blot={soloBot.blot}
						image={soloBot.image}
						name={soloBot.name}
						seed={soloBot.id}
						size={MARK_SIZE}
					/>
				)
			}
			title={title}
			{...props}
		/>
	)
}

export { ConversationEmptyState }
