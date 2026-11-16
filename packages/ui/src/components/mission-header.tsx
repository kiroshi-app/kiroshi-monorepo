import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderPathLink,
	AppHeaderPathSeparator,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	type MissionBot,
	type MissionState,
	missionBadgeFor,
} from "@workspace/ui/components/mission"
import {
	hasStatePill,
	MissionStatePill,
} from "@workspace/ui/components/mission-state-pill"

const MISSION_HEADER_AVATAR_SIZE = 32

type MissionHeaderProps = {
	bot: MissionBot
	objective: string
	state: MissionState
	isWorking: boolean
	onBack: () => void
	pathLabel?: string
	dragRegion?: "deep"
	className?: string
}

type MissionHeaderPathProps = Pick<MissionHeaderProps, "onBack" | "pathLabel">

const MissionHeaderPath = ({ onBack, pathLabel }: MissionHeaderPathProps) => {
	const { t } = useTranslation("chat")

	return (
		<>
			<AppHeaderPathLink onClick={onBack}>
				{pathLabel ?? t("missions.page.title")}
			</AppHeaderPathLink>
			<AppHeaderPathSeparator />
		</>
	)
}

const MissionHeader = ({
	bot,
	objective,
	state,
	isWorking,
	onBack,
	pathLabel,
	dragRegion,
	className,
}: MissionHeaderProps) => (
	<div className={className} data-slot="mission-header">
		<AppHeader
			data-tauri-drag-region={dragRegion}
			leading={
				<>
					<BotIdentityAvatar
						badge={missionBadgeFor(state)}
						hue={bot.blot}
						image={bot.image}
						kind="working"
						name={bot.name}
						seed={bot.seed}
						size={MISSION_HEADER_AVATAR_SIZE}
						working={isWorking}
					/>
					<AppHeaderText
						topLine={
							<MissionHeaderPath onBack={onBack} pathLabel={pathLabel} />
						}
					>
						<span className={APP_HEADER_TITLE} data-slot="mission-objective">
							{objective}
						</span>
					</AppHeaderText>
				</>
			}
			trailing={hasStatePill(state) ? <MissionStatePill state={state} /> : null}
		/>
	</div>
)

export { MissionHeader, MissionHeaderPath, type MissionHeaderProps }
