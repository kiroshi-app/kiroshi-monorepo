import {
	MessageScroller as MessageScrollerPrimitive,
	useMessageScroller,
	useMessageScrollerScrollable,
} from "@shadcn/react/message-scroller"
import type * as React from "react"
import { useEffect, useState } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

function MessageScrollerProvider(
	props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>,
) {
	return <MessageScrollerPrimitive.Provider {...props} />
}

function MessageScroller({
	className,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
	return (
		<MessageScrollerPrimitive.Root
			data-slot="message-scroller"
			className={cn(
				"group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden",
				className,
			)}
			{...props}
		/>
	)
}

const releaseFollowOnScrollbarPress = (
	event: React.PointerEvent<HTMLDivElement>,
) => {
	const viewport = event.currentTarget
	if (event.target !== viewport) return
	if (viewport.scrollHeight <= viewport.clientHeight) return
	viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))
}

function MessageScrollerViewport({
	className,
	onPointerDown,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
	return (
		<MessageScrollerPrimitive.Viewport
			data-slot="message-scroller-viewport"
			onPointerDown={(event) => {
				releaseFollowOnScrollbarPress(event)
				onPointerDown?.(event)
			}}
			className={cn(
				"size-full min-h-0 min-w-0 scroll-fade-b [overflow-anchor:none] scrollbar-thin scrollbar-gutter-stable overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent data-pending-scroll:invisible",
				className,
			)}
			{...props}
		/>
	)
}

type HeldReader = {
	element: Element
	offset: number
	scrollTop: number
}

const firstStartingInView = (
	parent: Element,
	top: number,
	bottom: number,
): Element | null => {
	for (const child of parent.children) {
		const box = child.getBoundingClientRect()
		if (box.bottom <= top || box.top >= bottom) continue
		if (box.top >= top) return child
		const inner = firstStartingInView(child, top, bottom)
		if (inner) return inner
	}
	return null
}

const holdReaderInPlace = (content: HTMLDivElement | null) => {
	const viewport = content?.closest<HTMLElement>(
		'[data-slot="message-scroller-viewport"]',
	)
	if (!content || !viewport) return
	let held: HeldReader | null = null

	const pickReader = () => {
		const { top, bottom } = viewport.getBoundingClientRect()
		const element = firstStartingInView(content, top, bottom)
		held = element
			? {
					element,
					offset: element.getBoundingClientRect().top - top,
					scrollTop: viewport.scrollTop,
				}
			: null
	}

	const restoreReader = () => {
		if (held?.element.isConnected && viewport.scrollTop === held.scrollTop) {
			const offset =
				held.element.getBoundingClientRect().top -
				viewport.getBoundingClientRect().top
			viewport.scrollTop += offset - held.offset
		}
		pickReader()
	}

	const resizes = new ResizeObserver(restoreReader)
	resizes.observe(content)
	viewport.addEventListener("scroll", pickReader, { passive: true })
	return () => {
		resizes.disconnect()
		viewport.removeEventListener("scroll", pickReader)
	}
}

function MessageScrollerContent({
	className,
	...props
}: Omit<React.ComponentProps<typeof MessageScrollerPrimitive.Content>, "ref">) {
	const [content, setContent] = useState<HTMLDivElement | null>(null)

	useEffect(() => holdReaderInPlace(content), [content])

	return (
		<MessageScrollerPrimitive.Content
			data-slot="message-scroller-content"
			className={cn("flex h-max min-h-full flex-col gap-8", className)}
			ref={setContent}
			{...props}
		/>
	)
}

function MessageScrollerItem({
	className,
	scrollAnchor = false,
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
	return (
		<MessageScrollerPrimitive.Item
			data-slot="message-scroller-item"
			scrollAnchor={scrollAnchor}
			className={cn("min-w-0 shrink-0", className)}
			{...props}
		/>
	)
}

function MessageScrollerButton({
	direction = "end",
	className,
	children,
	render,
	variant = "secondary",
	size = "icon-sm",
	...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button> &
	Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
	return (
		<MessageScrollerPrimitive.Button
			data-slot="message-scroller-button"
			data-direction={direction}
			data-variant={variant}
			data-size={size}
			direction={direction}
			className={cn(
				"absolute left-1/2 -translate-x-1/2 border-border bg-card text-foreground transition-[translate,scale,opacity] duration-200 ease-out hover:bg-muted hover:text-foreground motion-reduce:transition-none data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=false]:duration-150 data-[active=true]:translate-y-0 data-[active=true]:scale-100 data-[active=true]:opacity-100 data-[direction=end]:bottom-4 data-[direction=end]:data-[active=false]:translate-y-full data-[direction=start]:top-4 data-[direction=start]:data-[active=false]:-translate-y-full data-[direction=start]:[&_svg]:rotate-180",
				className,
			)}
			render={render ?? <Button variant={variant} size={size} />}
			{...props}
		>
			{children ?? (
				<>
					<Icons.ArrowDown />
					<span className="sr-only">
						{direction === "end" ? "Scroll to end" : "Scroll to start"}
					</span>
				</>
			)}
		</MessageScrollerPrimitive.Button>
	)
}

export {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
	useMessageScroller,
	useMessageScrollerScrollable,
}
