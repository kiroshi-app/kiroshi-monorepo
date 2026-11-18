import { AppHeader, AppHeaderText } from "@workspace/ui/components/app-header"
import {
	SkeletonBar,
	SkeletonHexagon,
} from "@workspace/ui/components/list-skeleton"
import {
	MissionHeaderPath,
	type MissionHeaderProps,
} from "@workspace/ui/components/mission-header"
import { cn } from "@workspace/ui/lib/utils"

const SKELETON_PULSE = "animate-pulse motion-reduce:animate-none"

type MissionHeaderSkeletonProps = Pick<
	MissionHeaderProps,
	"onBack" | "pathLabel" | "dragRegion" | "className"
>

const MissionHeaderSkeleton = ({
	onBack,
	pathLabel,
	dragRegion,
	className,
}: MissionHeaderSkeletonProps) => (
	<div
		aria-busy="true"
		className={className}
		data-slot="mission-header-skeleton"
	>
		<AppHeader
			data-tauri-drag-region={dragRegion}
			leading={
				<>
					<SkeletonHexagon className={cn("size-8", SKELETON_PULSE)} />
					<AppHeaderText
						topLine={
							<MissionHeaderPath onBack={onBack} pathLabel={pathLabel} />
						}
					>
						<span className="flex h-4.5 items-center">
							<SkeletonBar className={cn("w-48", SKELETON_PULSE)} />
						</span>
					</AppHeaderText>
				</>
			}
		/>
	</div>
)

export { MissionHeaderSkeleton, type MissionHeaderSkeletonProps }
