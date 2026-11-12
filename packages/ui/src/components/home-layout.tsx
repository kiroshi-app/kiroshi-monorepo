import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type HomeLayoutProps = {
	stage: "empty"
	children: ReactNode
	below?: ReactNode
}

const EVENS_SCREEN_COLUMN_PADDING = "pb-4"

const HomeLayout = ({ stage, children, below }: HomeLayoutProps) => (
	<div
		className={cn(
			"flex size-full flex-1 flex-col items-center px-4",
			EVENS_SCREEN_COLUMN_PADDING,
		)}
		data-slot="home-layout"
		data-stage={stage}
	>
		<div className="relative my-auto flex w-170 max-w-full flex-col gap-4">
			{children}
			<div
				className={cn(
					"absolute inset-x-0 top-full pt-5 empty:hidden",
					EVENS_SCREEN_COLUMN_PADDING,
				)}
				data-slot="home-layout-below"
			>
				{below}
			</div>
		</div>
	</div>
)

export { HomeLayout, type HomeLayoutProps }
