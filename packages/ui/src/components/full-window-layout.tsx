import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

type FullWindowLayoutProps = ComponentProps<"div">

const FullWindowLayout = ({ className, ...props }: FullWindowLayoutProps) => (
	<div
		data-slot="full-window-layout"
		className={cn(
			"flex h-svh w-full flex-col overflow-y-auto bg-background",
			className,
		)}
		{...props}
	/>
)

type FullWindowContentProps = ComponentProps<"div">

const FullWindowContent = ({ className, ...props }: FullWindowContentProps) => (
	<div
		data-slot="full-window-content"
		className={cn("my-auto flex flex-col items-center", className)}
		{...props}
	/>
)

export { FullWindowContent, FullWindowLayout }
