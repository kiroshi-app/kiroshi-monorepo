"use client"

import {
	type ComponentPropsWithRef,
	cloneElement,
	createContext,
	type ReactElement,
	type ReactNode,
	type Ref,
	useCallback,
	useContext,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { MARKDOWN_TYPESET_CLASS } from "@workspace/ui/components/markdown/prose"
import { MessageSideContext } from "@workspace/ui/components/message-side-context"
import { cn, mergeRefs } from "@workspace/ui/lib/utils"

export type MessageBubbleVariant =
	| "solid"
	| "soft"
	| "tint"
	| "outline"
	| "ghost"
	| "bare"
	| "danger"
export type MessageBubbleAlign = "start" | "end"

const MessageBubbleVariantContext = createContext<MessageBubbleVariant>("soft")

export interface MessageBubbleProps
	extends Omit<ComponentPropsWithRef<"div">, "children"> {
	variant?: MessageBubbleVariant
	align?: MessageBubbleAlign
	children?: ReactNode
}

export interface MessageBubbleContentProps
	extends ComponentPropsWithRef<"div"> {
	render?: ReactElement
	foot?: ReactNode
}

export interface MessageBubbleGroupProps extends ComponentPropsWithRef<"div"> {
	spacing?: "compact" | "default"
}

export interface MessageBubbleCollapsibleProps
	extends ComponentPropsWithRef<"div"> {
	open?: boolean
	defaultOpen?: boolean
	onOpenChange?: (open: boolean) => void
	collapsedLines?: 2 | 3 | 4 | 5 | 6
	moreLabel?: ReactNode
	lessLabel?: ReactNode
	contentClassName?: string
	triggerClassName?: string
	children?: ReactNode
}

function hasSurface(variant: MessageBubbleVariant) {
	return variant !== "ghost" && variant !== "bare"
}

export const MESSAGE_BUBBLE_MAX_INLINE_SIZE = "max-w-[85%]"

export function MessageBubble({
	variant = "soft",
	align,
	className,
	children,
	...props
}: MessageBubbleProps) {
	const messageSide = useContext(MessageSideContext)
	const resolvedAlign = align ?? messageSide ?? "start"

	return (
		<MessageBubbleVariantContext.Provider value={variant}>
			<div
				data-slot="message-bubble"
				data-align={resolvedAlign}
				data-variant={variant}
				className={cn(
					"group/bubble flex w-full flex-col",
					hasSurface(variant) && MESSAGE_BUBBLE_MAX_INLINE_SIZE,
					resolvedAlign === "end" ? "items-end" : "items-start",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</MessageBubbleVariantContext.Provider>
	)
}

export const MESSAGE_BUBBLE_INLINE_PADDING = "px-4.5"

export const MESSAGE_BUBBLE_INTERACTIVE =
	"cursor-pointer text-left outline-none transition-[scale] duration-160 ease-out hover:brightness-[0.98] hover:will-change-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"

const BUBBLE_FOCUS_RING =
	"outline-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"

const OWN_BUBBLE_FOCUS_RING = "focus-visible:outline-(--foreground)"

function bubbleContentClass(
	variant: MessageBubbleVariant,
	interactive: boolean,
) {
	return cn(
		"group/bubble-content relative z-0 flex min-w-9 flex-col gap-2 break-words rounded-bubble p-(--bubble-padding) text-bubble-foreground [--bubble-padding:--spacing(4.5)] text-sm leading-6 has-data-[stuck=true]:overflow-clip",
		BUBBLE_FOCUS_RING,
		variant !== "ghost" &&
			"[&_[data-slot=markdown]_:is(p,li,blockquote)]:text-sm [&_[data-slot=markdown]_:is(p,li,blockquote)]:leading-6",
		hasSurface(variant) && "max-w-full",
		MARKDOWN_TYPESET_CLASS,
		variant === "soft" &&
			"[--bubble-surface:var(--bubble)] hover:[--bubble-surface:var(--bubble-hover)] focus-visible:[--bubble-surface:var(--bubble-hover)]",
		variant === "solid" && [
			"on-user-bubble text-user-bubble-foreground [--bubble-surface:var(--user-bubble)] hover:[--bubble-surface:var(--user-bubble-hover)] focus-visible:[--bubble-surface:var(--user-bubble-hover)]",
			OWN_BUBBLE_FOCUS_RING,
		],
		variant === "ghost" &&
			"w-full max-w-full rounded-none px-0 py-0 [--bubble-surface:transparent] has-data-[stuck=true]:overflow-visible",
		variant === "bare" && "w-auto rounded-none px-0 py-1",
		variant === "danger" && "on-destructive text-destructive",
		interactive && MESSAGE_BUBBLE_INTERACTIVE,
	)
}

function bubbleSurfaceClass(variant: MessageBubbleVariant) {
	return cn(
		"pointer-events-none absolute inset-0 -z-10 rounded-[inherit]",
		(variant === "solid" || variant === "soft") && "bg-(--bubble-surface)",
		variant === "tint" && "surface-user-bubble-soft",
		variant === "outline" && "border border-border/70 bg-card",
		variant === "danger" && "bg-destructive/10",
	)
}

export function MessageBubbleContent({
	render,
	foot,
	className,
	children,
	ref,
	...props
}: MessageBubbleContentProps) {
	const variant = useContext(MessageBubbleVariantContext)
	const interactive = render?.type === "button" || render?.type === "a"
	const filled = hasSurface(variant)
	const classes = cn(bubbleContentClass(variant, interactive), className)
	const composedChildren = (
		<>
			{filled ? (
				<span aria-hidden="true" className={bubbleSurfaceClass(variant)} />
			) : null}
			<div data-slot="message-bubble-text" className="relative">
				{children}
			</div>
			{foot}
		</>
	)

	if (render) {
		const child = render as ReactElement<
			Record<string, unknown> & { className?: string; ref?: Ref<HTMLElement> }
		>

		return cloneElement(child, {
			...props,
			ref: mergeRefs(child.props.ref, ref as Ref<HTMLElement> | undefined),
			className: cn(classes, child.props.className),
			children: composedChildren,
			"data-slot": "message-bubble-content",
		})
	}

	return (
		<div
			ref={ref}
			data-slot="message-bubble-content"
			className={classes}
			{...props}
		>
			{composedChildren}
		</div>
	)
}

export function MessageBubbleGroup({
	spacing = "compact",
	className,
	...props
}: MessageBubbleGroupProps) {
	return (
		<div
			data-slot="message-bubble-group"
			className={cn(
				"flex w-full flex-col",
				spacing === "compact" ? "gap-1.5" : "gap-3",
				className,
			)}
			{...props}
		/>
	)
}

const LINE_CLAMP_CLASS = {
	2: "line-clamp-2",
	3: "line-clamp-3",
	4: "line-clamp-4",
	5: "line-clamp-5",
	6: "line-clamp-6",
} as const

export function MessageBubbleCollapsible({
	open,
	defaultOpen = false,
	onOpenChange,
	collapsedLines = 4,
	moreLabel,
	lessLabel,
	contentClassName,
	triggerClassName,
	className,
	children,
	...props
}: MessageBubbleCollapsibleProps) {
	const { t } = useTranslation("chat")
	const contentId = useId()
	const [internalOpen, setInternalOpen] = useState(defaultOpen)
	const currentOpen = open ?? internalOpen
	const triggerLabel = currentOpen
		? (lessLabel ?? t("transcript.showLess"))
		: (moreLabel ?? t("transcript.showMore"))

	const setOpen = useCallback(
		(next: boolean) => {
			if (open === undefined) setInternalOpen(next)
			onOpenChange?.(next)
		},
		[onOpenChange, open],
	)

	return (
		<div
			data-slot="message-bubble-collapsible"
			data-state={currentOpen ? "open" : "closed"}
			className={cn("w-full", className)}
			{...props}
		>
			<div
				id={contentId}
				className={cn(
					!currentOpen && LINE_CLAMP_CLASS[collapsedLines],
					!currentOpen &&
						"[mask-image:linear-gradient(to_bottom_in_oklab,#000_68%,transparent_100%)]",
					contentClassName,
				)}
			>
				{children}
			</div>
			<button
				type="button"
				aria-expanded={currentOpen}
				aria-controls={contentId}
				onClick={() => setOpen(!currentOpen)}
				className={cn(
					"mt-2 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
					triggerClassName,
				)}
			>
				<span>{triggerLabel}</span>
				<Icons.Expand
					aria-hidden="true"
					className={cn(
						"size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none",
						currentOpen && "rotate-180",
					)}
				/>
			</button>
		</div>
	)
}
