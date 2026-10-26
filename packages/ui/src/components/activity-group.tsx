import { type ReactNode, useId } from "react"

import { Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { cn } from "@workspace/ui/lib/utils"

type MissionGroupKey = "waiting" | "inProgress"

type OpenMissionGroup = {
	key: MissionGroupKey
	states: MissionState[]
}

const OPEN_MISSION_GROUPS: OpenMissionGroup[] = [
	{ key: "waiting", states: ["waiting_human", "ready_to_merge"] },
	{ key: "inProgress", states: ["working", "waiting_bot", "failed"] },
]

const GROUP_HEAD_CLASS = "flex h-7 items-center gap-1.5 px-1.5"

const GROUP_FOLD_CLASS =
	"w-full rounded-lg text-start outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30"

type ActivityGroupFold = {
	isOpen: boolean
	onToggle: () => void
}

type ActivityGroupProps = {
	slot: string
	title: string
	count: number
	fold?: ActivityGroupFold
	children: ReactNode
}

const ActivityGroup = ({
	slot,
	title,
	count: held,
	fold,
	children,
}: ActivityGroupProps) => {
	const titleId = useId()
	const listId = useId()
	const isUnfolded = fold ? fold.isOpen : true

	const count = (
		<span className="text-muted-foreground text-xs tabular-nums">{held}</span>
	)

	return (
		<section
			aria-labelledby={titleId}
			className="flex min-w-0 flex-col gap-0.5"
			data-slot={slot}
		>
			{fold ? (
				<h3 id={titleId}>
					<button
						aria-controls={listId}
						aria-expanded={isUnfolded}
						className={cn(GROUP_HEAD_CLASS, GROUP_FOLD_CLASS)}
						onClick={fold.onToggle}
						type="button"
					>
						<Icons.Expand
							aria-hidden="true"
							className={cn(
								"size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
								isUnfolded || "-rotate-90 rtl:rotate-90",
							)}
						/>
						<span className="font-medium text-foreground text-xs">{title}</span>
						{count}
					</button>
				</h3>
			) : (
				<div className={GROUP_HEAD_CLASS}>
					<h3 className="font-medium text-foreground text-xs" id={titleId}>
						{title}
					</h3>
					{count}
				</div>
			)}
			<ul className="flex flex-col gap-0.5" hidden={!isUnfolded} id={listId}>
				{children}
			</ul>
		</section>
	)
}

export { ActivityGroup, OPEN_MISSION_GROUPS }
