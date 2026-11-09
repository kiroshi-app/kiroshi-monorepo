import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type HomeStage = "empty" | "conversation"

type HomeLayoutProps =
	| { stage: "empty"; children: ReactNode }
	| { stage: "conversation"; transcript: ReactNode; composer: ReactNode }

const PANEL = "flex size-full flex-col items-center px-4"

const COLUMN = "flex w-170 max-w-full flex-col gap-4"

const HomeLayout = (props: HomeLayoutProps) => {
	if (props.stage === "empty") {
		return (
			<div
				className={cn(PANEL, "overflow-y-auto pb-24")}
				data-slot="home-layout"
				data-stage="empty"
			>
				<div className={cn(COLUMN, "my-auto")}>{props.children}</div>
			</div>
		)
	}

	return (
		<div
			className={cn(PANEL, "pb-4")}
			data-slot="home-layout"
			data-stage="conversation"
		>
			<div className={cn(COLUMN, "min-h-0 flex-1")}>
				<div
					className="flex min-h-0 flex-1 flex-col"
					data-slot="home-layout-transcript"
				>
					{props.transcript}
				</div>
				<div className="shrink-0" data-slot="home-layout-composer">
					{props.composer}
				</div>
			</div>
		</div>
	)
}

export { HomeLayout, type HomeLayoutProps, type HomeStage }
