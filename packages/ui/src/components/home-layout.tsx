import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type HomeLayoutProps = {
	stage: "empty"
	children: ReactNode
	above?: ReactNode
	below?: ReactNode
}

const EVENS_SCREEN_COLUMN_PADDING = "pb-4"

const RESTING_CARD_BASIS = "basis-31.5"

const HomeLayout = ({ stage, children, above, below }: HomeLayoutProps) => (
	<div
		className={cn(
			"flex size-full flex-1 flex-col items-center px-4 pt-5",
			EVENS_SCREEN_COLUMN_PADDING,
		)}
		data-slot="home-layout"
		data-stage={stage}
	>
		<div className="flex w-170 max-w-full grow flex-col">
			<div className="flex grow basis-0 flex-col justify-end">
				<div className="flex flex-col gap-4 pb-4" data-slot="home-layout-above">
					{above}
				</div>
			</div>
			<div
				className={cn("min-h-0 shrink-0 grow", RESTING_CARD_BASIS)}
				data-slot="home-layout-card"
			>
				<div className={EVENS_SCREEN_COLUMN_PADDING}>
					<div className="flex flex-col gap-4">{children}</div>
					<div className="pt-5 empty:hidden" data-slot="home-layout-below">
						{below}
					</div>
				</div>
			</div>
		</div>
	</div>
)

export { HomeLayout, type HomeLayoutProps }
