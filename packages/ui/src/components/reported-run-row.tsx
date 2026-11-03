"use client"

import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import {
	MISSION_AVATAR_SIZE,
	type MissionBot,
} from "@workspace/ui/components/mission"
import {
	ACTIVITY_ROW_CLASS,
	ROW_GLYPH_CLASS,
	RowAnatomy,
	RowParts,
} from "@workspace/ui/components/row-anatomy"

type ReportedRunRowModel = {
	id: string
	routineTitle: string
	triggerSourceTitle: string
	bot: MissionBot
	timestamp: string
}

const ReportedRunRow = ({
	routineTitle,
	triggerSourceTitle,
	bot,
	timestamp,
}: ReportedRunRowModel) => {
	const { t } = useTranslation("chat")
	const parts = [
		{ key: "source", text: triggerSourceTitle },
		{ key: "bot", text: bot.name },
		{ key: "reported", text: t("activity.runs.reported") },
	]

	return (
		<li data-slot="reported-run-row">
			<div className={ACTIVITY_ROW_CLASS}>
				<RowAnatomy
					geometry="activity"
					media={
						<BotIdentityAvatar
							className="shrink-0"
							hue={bot.blot}
							image={bot.image}
							name={bot.name}
							seed={bot.seed}
							size={MISSION_AVATAR_SIZE}
						/>
					}
					name={routineTitle}
					preview={
						<>
							<Icons.Routine aria-hidden="true" className={ROW_GLYPH_CLASS} />
							<RowParts parts={parts} slot="activity-row-parts" />
						</>
					}
					timestamp={timestamp}
				/>
			</div>
		</li>
	)
}

export { ReportedRunRow, type ReportedRunRowModel }
