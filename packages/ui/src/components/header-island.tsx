import { type ComponentProps, createContext, useContext } from "react"

import { cn } from "@workspace/ui/lib/utils"

const HeaderIslandContext = createContext(false)

const useIsInHeaderIsland = () => useContext(HeaderIslandContext)

const HEADER_ISLAND_CONTROL =
	"rounded-md border border-transparent text-soft-foreground outline-hidden hover:bg-header-island-control-hover hover:text-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 active:translate-y-px active:bg-header-island-control-pressed active:text-foreground aria-expanded:bg-header-island-control-hover aria-expanded:text-foreground"

const HeaderIsland = ({
	className,
	children,
	...props
}: ComponentProps<"div">) => (
	<div
		data-slot="header-island"
		className={cn(
			"pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-control border border-selection-toolbar-border bg-card p-0.75 text-foreground shadow-selection-toolbar dark:bg-card-raised",
			className,
		)}
		{...props}
	>
		<HeaderIslandContext.Provider value={true}>
			{children}
		</HeaderIslandContext.Provider>
	</div>
)

const HeaderIslandCell = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		data-slot="header-island-cell"
		className={cn("flex h-8 min-w-0 items-center gap-2 p-2", className)}
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
			"flex size-8 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
			HEADER_ISLAND_CONTROL,
			className,
		)}
		{...props}
	/>
)

export {
	HEADER_ISLAND_CONTROL,
	HeaderIsland,
	HeaderIslandButton,
	HeaderIslandCell,
	useIsInHeaderIsland,
}
