import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type HomeStage = "empty" | "conversation"

type HomeLayoutProps = {
	stage: HomeStage
	children: ReactNode
}

const STAGE = {
	empty: { panel: "pb-24", column: "my-auto" },
	conversation: { panel: "pb-4", column: "mt-auto" },
} as const satisfies Record<HomeStage, { panel: string; column: string }>

const HomeLayout = ({ stage, children }: HomeLayoutProps) => (
	<div
		className={cn(
			"flex size-full flex-col items-center overflow-y-auto px-4",
			STAGE[stage].panel,
		)}
		data-slot="home-layout"
		data-stage={stage}
	>
		<div
			className={cn(
				"flex w-170 max-w-full flex-col gap-4",
				STAGE[stage].column,
			)}
		>
			{children}
		</div>
	</div>
)

export { HomeLayout, type HomeLayoutProps, type HomeStage }
