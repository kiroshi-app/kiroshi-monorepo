import { clsx } from "clsx"
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
	headerFadeClassName?: string
	footer?: ReactNode
	width?: ScreenLayoutWidth
	scroller?: (columnClassName: string) => ReactNode
	contentClassName?: string
	footerClassName?: string
}

const FLOATING_HEADER =
	"pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between gap-2 p-2"

const SCROLL_CONTAINER = /auto|scroll/

const publishHeaderHeight = (header: HTMLDivElement) => {
	const observer = new ResizeObserver(([entry]) => {
		header.parentElement?.style.setProperty(
			"--screen-layout-header-height",
			`${entry.borderBoxSize[0].blockSize}px`,
		)
	})
	observer.observe(header)

	return () => observer.disconnect()
}

const HEADER_FADE_UNMERGEABLE =
	"pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-linear-to-b from-(percentage:--screen-layout-fade-stop) from-background to-transparent in-data-content-card:from-card"

const isNestedScroller = (scrolled: Element, region: Element) => {
	for (
		let ancestor = scrolled.parentElement;
		ancestor && ancestor !== region;
		ancestor = ancestor.parentElement
	)
		if (SCROLL_CONTAINER.test(getComputedStyle(ancestor).overflowY)) return true

	return false
}

const ScreenLayout = ({
	header,
	isHeaderFloating = false,
	headerFadeStop = 50,
	headerFadeClassName,
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

	const scrollArea = scroller ? (
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
							className={clsx(HEADER_FADE_UNMERGEABLE, headerFadeClassName)}
							data-slot="screen-layout-fade"
							style={
								{
									"--screen-layout-fade-stop": `${headerFadeStop}%`,
								} as CSSProperties
							}
						/>
					) : null}
					<div
						className={FLOATING_HEADER}
						data-slot="screen-layout-floating-header"
						ref={publishHeaderHeight}
					>
						{header}
					</div>
				</>
			) : (
				header
			)}

			{isHeaderFloating ? (
				<div
					className="contents"
					data-slot="screen-layout-scroll-region"
					onScrollCapture={({ target, currentTarget }) => {
						if (!(target instanceof Element)) return
						if (isNestedScroller(target, currentTarget)) return
						setIsScrolledFromTop(target.scrollTop > 0)
					}}
				>
					{scrollArea}
				</div>
			) : (
				scrollArea
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

export { FLOATING_HEADER, ScreenLayout, type ScreenLayoutWidth }
