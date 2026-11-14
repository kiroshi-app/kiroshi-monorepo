import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import {
	HeaderIsland,
	HeaderIslandButton,
	HeaderIslandCell,
} from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import {
	SkeletonBar,
	SkeletonHexagon,
} from "@workspace/ui/components/list-skeleton"
import {
	MISSION_HEADER_ROWS,
	MISSION_TICKET_ISLAND,
	MISSION_TICKET_SPACER,
	MISSION_TICKET_STACKED_CELL,
	type MissionHeaderProps,
} from "@workspace/ui/components/mission-header"
import { cn } from "@workspace/ui/lib/utils"

const SKELETON_PULSE = "animate-pulse motion-reduce:animate-none"

type MissionHeaderSkeletonProps = Pick<
	MissionHeaderProps,
	"onBack" | "dragRegion" | "className"
>

const MissionHeaderSkeleton = ({
	onBack,
	dragRegion,
	className,
}: MissionHeaderSkeletonProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			aria-busy="true"
			className={cn(MISSION_HEADER_ROWS, className)}
			data-slot="mission-header-skeleton"
		>
			<AppHeader
				data-tauri-drag-region={dragRegion}
				isFloating
				leading={
					<>
						<HeaderIslandButton
							aria-label={t("missions.header.back")}
							onClick={onBack}
						>
							<Icons.Previous aria-hidden="true" />
						</HeaderIslandButton>
						<HeaderIslandCell
							aria-hidden="true"
							className={cn("p-1", SKELETON_PULSE)}
						>
							<SkeletonHexagon className="size-6" />
							<SkeletonBar className="w-48" />
						</HeaderIslandCell>
					</>
				}
			/>
			<HeaderIsland
				aria-hidden="true"
				className={MISSION_TICKET_ISLAND}
				data-island="mission-ticket"
			>
				<HeaderIslandCell
					className={cn(MISSION_TICKET_STACKED_CELL, SKELETON_PULSE)}
				>
					<SkeletonBar className="w-12 shrink-0" />
					<SkeletonBar className="w-48" />
				</HeaderIslandCell>
				<HeaderIslandCell
					className={cn(MISSION_TICKET_STACKED_CELL, SKELETON_PULSE)}
				>
					<SkeletonBar className="w-40" isFaint />
				</HeaderIslandCell>
				<span className={MISSION_TICKET_SPACER} />
				<HeaderIslandCell className={cn("shrink-0", SKELETON_PULSE)}>
					<SkeletonBar className="w-20" isFaint />
				</HeaderIslandCell>
			</HeaderIsland>
		</div>
	)
}

export { MissionHeaderSkeleton, type MissionHeaderSkeletonProps }
