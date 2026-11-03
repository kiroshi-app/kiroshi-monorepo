"use client"

import {
	type KeyboardEvent,
	type ReactNode,
	type SyntheticEvent,
	useEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	SELECTION_TOOLBAR_SLOT,
	SelectionToolbar,
	type SelectionToolbarAnchor,
} from "@workspace/ui/components/selection-toolbar"
import { cn } from "@workspace/ui/lib/utils"

type MessageSelectionProps = {
	children: ReactNode
	onReply: (text: string) => void
	onCopy: (text: string) => void
	className?: string
}

type HeldSelection = {
	text: string
	anchor: SelectionToolbarAnchor
}

const rangeWithin = (root: HTMLElement) => {
	const selection = root.ownerDocument.getSelection()
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return undefined
	}

	const range = selection.getRangeAt(0)
	if (
		!root.contains(range.startContainer) ||
		!root.contains(range.endContainer)
	) {
		return undefined
	}

	return range
}

const selectedTextWithin = (root: HTMLElement) =>
	rangeWithin(root)
		? (root.ownerDocument.getSelection()?.toString().trim() ?? "")
		: ""

const SCROLLING_OVERFLOW = new Set(["auto", "scroll"])

const scrollingAncestorOf = (element: HTMLElement) => {
	for (
		let parent = element.parentElement;
		parent;
		parent = parent.parentElement
	) {
		if (SCROLLING_OVERFLOW.has(getComputedStyle(parent).overflowY)) {
			return parent
		}
	}
	return undefined
}

const anchorOf = (range: Range, root: HTMLElement): SelectionToolbarAnchor => {
	const selected = range.getBoundingClientRect()
	const framed = root.getBoundingClientRect()
	const viewportTop =
		scrollingAncestorOf(root)?.getBoundingClientRect().top ?? 0
	return {
		centre: (selected.left + selected.right) / 2 - framed.left,
		top: selected.top - framed.top,
		bottom: selected.bottom - framed.top,
		roomAbove: selected.top - viewportTop,
	}
}

const isInToolbar = (target: EventTarget) =>
	target instanceof Element &&
	target.closest(`[data-slot="${SELECTION_TOOLBAR_SLOT}"]`) !== null

const MessageSelection = ({
	children,
	onReply,
	onCopy,
	className,
}: MessageSelectionProps) => {
	const { t } = useTranslation("chat")
	const [held, setHeld] = useState<HeldSelection>()
	const root = useRef<HTMLDivElement>(null)
	const isHeld = held !== undefined

	useEffect(() => {
		const element = root.current
		if (!isHeld || !element) return
		const page = element.ownerDocument
		const releaseWhenGone = () => {
			if (!rangeWithin(element)) setHeld(undefined)
		}
		const releaseOnEscape = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") setHeld(undefined)
		}
		page.addEventListener("selectionchange", releaseWhenGone)
		page.addEventListener("keydown", releaseOnEscape)
		return () => {
			page.removeEventListener("selectionchange", releaseWhenGone)
			page.removeEventListener("keydown", releaseOnEscape)
		}
	}, [isHeld])

	const holdSelection = (event: SyntheticEvent<HTMLDivElement>) => {
		if (isInToolbar(event.target)) return
		const element = event.currentTarget
		const range = rangeWithin(element)
		const text = range && selectedTextWithin(element)
		setHeld(
			range && text ? { text, anchor: anchorOf(range, element) } : undefined,
		)
	}

	const holdOnShiftRelease = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Shift") holdSelection(event)
	}

	const pass = (callback: (text: string) => void) => () => {
		if (held) callback(held.text)
		setHeld(undefined)
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the listeners only read a text selection the browser already grants
		<div
			className={cn("relative selection:bg-primary/30", className)}
			data-slot="message-selection"
			onKeyUp={holdOnShiftRelease}
			onPointerUp={holdSelection}
			ref={root}
		>
			{children}
			{held ? (
				<SelectionToolbar
					actions={[
						{ name: "reply", onPress: pass(onReply) },
						{ name: "copy", onPress: pass(onCopy) },
					]}
					anchor={held.anchor}
					label={t("turn.selection")}
				/>
			) : null}
		</div>
	)
}

export { MessageSelection, type MessageSelectionProps, selectedTextWithin }
