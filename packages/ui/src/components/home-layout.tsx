import type { ReactNode } from "react"

type HomeLayoutProps = { stage: "empty"; children: ReactNode }

const HomeLayout = ({ stage, children }: HomeLayoutProps) => (
	<div
		className="flex size-full flex-col items-center overflow-y-auto px-4 pb-24"
		data-slot="home-layout"
		data-stage={stage}
	>
		<div className="my-auto flex w-170 max-w-full flex-col gap-4">
			{children}
		</div>
	</div>
)

export { HomeLayout, type HomeLayoutProps }
