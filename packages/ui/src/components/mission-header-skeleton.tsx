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
			<HeaderIsland data-island="mission-ticket">
				<HeaderIslandCell
					aria-hidden="true"
					className={cn("flex-1", SKELETON_PULSE)}
				>
					<SkeletonBar className="w-40" />
					<SkeletonBar className="ms-auto w-16 shrink-0" isFaint />
				</HeaderIslandCell>
			</HeaderIsland>
		</div>
	)
}

export { MissionHeaderSkeleton, type MissionHeaderSkeletonProps }
