import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

const HeaderIsland = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		data-slot="header-island"
		className={cn(
			"pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-control border border-selection-toolbar-border bg-card p-0.75 text-foreground shadow-selection-toolbar dark:bg-card-raised",
			className,
		)}
		{...props}
	/>
)

interface HeaderIslandButtonProps extends ComponentProps<"button"> {
	"aria-label": string
}

const HeaderIslandButton = ({
	className,
	...props
}: HeaderIslandButtonProps) => (
	<button
		type="button"
		data-slot="header-island-button"
		className={cn(
			"flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-soft-foreground outline-hidden hover:bg-header-island-control-hover hover:text-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 active:translate-y-px active:bg-header-island-control-pressed active:text-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
			className,
		)}
		{...props}
	/>
)

export { HeaderIsland, HeaderIslandButton }
