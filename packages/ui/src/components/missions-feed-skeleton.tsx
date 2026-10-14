import {
	ListSkeleton,
	SkeletonBar,
	SkeletonRow,
	type SkeletonRowProps,
} from "@workspace/ui/components/list-skeleton"
import { cn } from "@workspace/ui/lib/utils"

type MissionRowWidths = Pick<
	SkeletonRowProps,
	"titleClassName" | "previewClassName"
>

type MissionsGroupShape = {
	headerClassName: string
	rows: MissionRowWidths[]
}

const MISSIONS_GROUP_CYCLE: MissionsGroupShape[] = [
	{
		headerClassName: "w-23",
		rows: [
			{ titleClassName: "w-37.5", previewClassName: "w-42.5" },
			{ titleClassName: "w-31", previewClassName: "w-37.5" },
		],
	},
	{
		headerClassName: "w-17.5",
		rows: [
			{ titleClassName: "w-42", previewClassName: "w-46" },
			{ titleClassName: "w-33", previewClassName: "w-24" },
			{ titleClassName: "w-36", previewClassName: "w-40" },
		],
	},
]

const MissionSkeletonRow = (widths: MissionRowWidths) => (
	<SkeletonRow hexagonClassName="size-8" stampClassName="w-7" {...widths} />
)

const MissionsFeedRow = () => (
	<MissionSkeletonRow {...MISSIONS_GROUP_CYCLE[0].rows[0]} />
)

const missionsGroupAt = (index: number) => {
	const { headerClassName, rows } =
		MISSIONS_GROUP_CYCLE[index % MISSIONS_GROUP_CYCLE.length]

	return (
		<div className="flex flex-col">
			<div className="flex h-7 items-center px-1.5">
				<SkeletonBar className={cn("h-2.25", headerClassName)} />
			</div>
			<div className="flex flex-col gap-0.5">
				{rows.map((widths) => (
					<MissionSkeletonRow key={widths.titleClassName} {...widths} />
				))}
			</div>
		</div>
	)
}

const MissionsFeedSkeleton = () => (
	<ListSkeleton className="gap-3" row={missionsGroupAt} />
)

export { MissionsFeedRow, MissionsFeedSkeleton }
