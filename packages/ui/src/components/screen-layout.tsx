import {
	type ComponentProps,
	type CSSProperties,
	type ReactNode,
	useState,
} from "react"

import { cn } from "@workspace/ui/lib/utils"

type ScreenLayoutWidth = "column" | "full"

interface ScreenLayoutProps extends ComponentProps<"div"> {
	header?: ReactNode
	isHeaderFloating?: boolean
	headerFadeStop?: number
	footer?: ReactNode
	width?: ScreenLayoutWidth
	scroller?: (columnClassName: string) => ReactNode
	contentClassName?: string
	footerClassName?: string
}

const ScreenLayout = ({
	header,
	isHeaderFloating = false,
	headerFadeStop = 50,
	footer,
	width = "full",
	scroller,
	children,
	className,
	contentClassName,
	footerClassName,
	...props
}: ScreenLayoutProps) => {
	const [isScrolledFromTop, setIsScrolledFromTop] = useState(false)

	const columnClassName = cn(
		"flex min-h-full w-full flex-col px-6 pt-8 pb-4",
		isHeaderFloating && "pt-20",
		width === "column" && "mx-auto max-w-200",
		contentClassName,
	)

	return (
		<div
			data-slot="screen-layout"
			className={cn(
				"flex h-svh max-h-full flex-col bg-background text-foreground in-data-content-card:bg-card",
				isHeaderFloating && "relative",
				className,
			)}
			{...props}
		>
			{isHeaderFloating ? (
				<>
					{isScrolledFromTop ? (
						<div
							aria-hidden
							className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-linear-to-b from-(percentage:--screen-layout-fade-stop) from-background to-transparent in-data-content-card:from-card"
							data-slot="screen-layout-fade"
							style={
								{
									"--screen-layout-fade-stop": `${headerFadeStop}%`,
								} as CSSProperties
							}
						/>
					) : null}
					<div
						className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between p-2"
						data-slot="screen-layout-floating-header"
					>
						{header}
					</div>
				</>
			) : (
				header
			)}

			{scroller ? (
				scroller(columnClassName)
			) : (
				<div
					className="min-h-0 flex-1 overflow-y-auto"
					data-slot="screen-layout-scroller"
					onScroll={
						isHeaderFloating
							? (event) =>
									setIsScrolledFromTop(event.currentTarget.scrollTop > 0)
							: undefined
					}
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
