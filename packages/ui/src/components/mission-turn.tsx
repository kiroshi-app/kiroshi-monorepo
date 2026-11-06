"use client"

import { useTranslation } from "react-i18next"

import { AuthorLine } from "@workspace/ui/components/author-line"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Message } from "@workspace/ui/components/message"
import {
	type MissionCardModel,
	missionBadgeFor,
} from "@workspace/ui/components/mission"
import {
	MissionCard,
	type MissionCardWrap,
	wrapCard,
} from "@workspace/ui/components/mission-card"
import {
	AGENT_BUBBLE_WIDTH,
	AUTHOR_AVATAR_SIZE,
} from "@workspace/ui/components/turn"
import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

type MissionTurnProps = {
	mission: MissionCardModel
	onOpen: (missionId: string, modifiers: ClickModifiers) => void
	wrap?: MissionCardWrap
}

const MissionTurn = ({ mission, onOpen, wrap }: MissionTurnProps) => {
	const { t } = useTranslation("chat")
	const { author, ...card } = mission
	const face = author ?? card.identity

	return (
		<Message aria-label={t("transcript.message.mission")} from="assistant">
			{wrapCard(
				<MissionCard
					{...card}
					className={cn("min-w-0", AGENT_BUBBLE_WIDTH)}
					density="card"
					foot={
						<AuthorLine
							tone={author?.isDeleted ? "deleted" : "agent"}
							name={face.name}
							hue={face.blot}
							badge={face.title}
							avatar={
								<BotIdentityAvatar
									badge={missionBadgeFor(card.state)}
									hue={face.blot}
									image={face.image}
									kind="working"
									name={face.name}
									seed={face.id}
									size={AUTHOR_AVATAR_SIZE}
									working={card.isWorking}
								/>
							}
							time={card.timestamp}
							isSticky
							className="pointer-events-none"
						/>
					}
					onOpen={onOpen}
				/>,
				wrap,
			)}
		</Message>
	)
}

export { MissionTurn }
