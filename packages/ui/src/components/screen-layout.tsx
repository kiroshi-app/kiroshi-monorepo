import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type ScreenLayoutWidth = "column" | "full"

interface ScreenLayoutProps extends ComponentProps<"div"> {
	header?: ReactNode
	footer?: ReactNode
	width?: ScreenLayoutWidth
	scroller?: (columnClassName: string) => ReactNode
	contentClassName?: string
	footerClassName?: string
}

const ScreenLayout = ({
	header,
	footer,
	width = "full",
	scroller,
	children,
	className,
	contentClassName,
	footerClassName,
	...props
}: ScreenLayoutProps) => {
	const columnClassName = cn(
		"flex min-h-full w-full flex-col px-6 pt-8 pb-4",
		width === "column" && "mx-auto max-w-200",
		contentClassName,
	)

	return (
		<div
			data-slot="screen-layout"
			className={cn(
				"flex h-svh max-h-full flex-col bg-background text-foreground in-data-content-card:bg-card",
				className,
			)}
			{...props}
		>
			{header}

			{scroller ? (
				scroller(columnClassName)
			) : (
				<div
					className="min-h-0 flex-1 overflow-y-auto"
					data-slot="screen-layout-scroller"
				>
					<div className={columnClassName} data-slot="screen-layout-column">
						{children}
					</div>
				</div>
			)}

			{footer ? (
				<div
					className={cn(
						"flex w-full shrink-0 flex-col gap-3 px-(--shell-inset) pb-(--shell-inset)",
						footerClassName,
					)}
				>
					{footer}
				</div>
			) : null}
		</div>
	)
}

export { ScreenLayout, type ScreenLayoutWidth }
