import type { ComponentProps, ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

interface ScreenLayoutProps extends Omit<ComponentProps<"div">, "children"> {
	header?: ReactNode
	footer?: ReactNode
	centered?: boolean
	scroller?: (columnClassName: string) => ReactNode
	children?: ReactNode
	contentClassName?: string
	footerClassName?: string
}

const ScreenLayout = ({
	header,
	footer,
	centered = false,
	scroller,
	children,
	className,
	contentClassName,
	footerClassName,
	...props
}: ScreenLayoutProps) => {
	const columnClassName = cn(
		"flex min-h-full w-full flex-col px-6 pt-8 pb-4",
		centered && "mx-auto max-w-160",
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

export { ScreenLayout }
