import { useTranslation } from "react-i18next"

import { AppHeader } from "@workspace/ui/components/app-header"
import { Icons } from "@workspace/ui/components/icons"
import {
	SkeletonBar,
	SkeletonHexagon,
} from "@workspace/ui/components/list-skeleton"
import type { MissionHeaderProps } from "@workspace/ui/components/mission-header"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type MissionHeaderSkeletonProps = Pick<
	MissionHeaderProps,
	"onBack" | "windowControls" | "dragRegion" | "className"
>

const MissionHeaderSkeleton = ({
	onBack,
	windowControls,
	dragRegion,
	className,
}: MissionHeaderSkeletonProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			aria-busy="true"
			className={cn("flex w-full shrink-0 flex-col", className)}
			data-slot="mission-header-skeleton"
		>
			<AppHeader
				data-tauri-drag-region={dragRegion}
				leading={
					<>
						<Button
							aria-label={t("missions.header.back")}
							onClick={onBack}
							size="icon"
							variant="ghost"
						>
							<Icons.Previous aria-hidden="true" />
						</Button>
						<span
							aria-hidden="true"
							className="flex min-w-0 animate-pulse items-center gap-2 motion-reduce:animate-none"
						>
							<SkeletonHexagon className="size-6" />
							<SkeletonBar className="w-48" />
						</span>
					</>
				}
				windowControls={windowControls}
			/>
			<div
				className="flex h-8.5 shrink-0 items-center gap-2 border-border border-b pe-4 ps-12.5"
				data-slot="mission-ticket-band-skeleton"
			>
				<span
					aria-hidden="true"
					className="flex min-w-0 flex-1 animate-pulse items-center gap-2 motion-reduce:animate-none"
				>
					<SkeletonBar className="w-40" />
					<SkeletonBar className="ms-auto w-16 shrink-0" isFaint />
				</span>
			</div>
		</div>
	)
}

export { MissionHeaderSkeleton, type MissionHeaderSkeletonProps }
