"use client"

import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

const LINE_HEIGHT = 24
const PADDING_Y = 8
const MIN_ROWS = 1
const MAX_ROWS = 8

const rowsIn = (element: HTMLElement) =>
	Math.round(element.scrollHeight / LINE_HEIGHT)

const pixelsIn = (value: string) => Number.parseFloat(value) || 0

const roomBesideControls = (
	form: HTMLElement,
	...controls: (HTMLElement | null)[]
) => {
	const style = getComputedStyle(form)
	const gap = pixelsIn(style.columnGap)
	return controls.reduce(
		(room, control) =>
			control && control.offsetWidth > 0
				? room - control.offsetWidth - gap
				: room,
		form.clientWidth -
			pixelsIn(style.paddingInlineStart) -
			pixelsIn(style.paddingInlineEnd),
	)
}

export type PromptRefs = {
	form: RefObject<HTMLFormElement | null>
	attachments: RefObject<HTMLDivElement | null>
	prompt: RefObject<HTMLDivElement | null>
	singleLine: RefObject<HTMLDivElement | null>
	measurement: RefObject<HTMLDivElement | null>
	leading: RefObject<HTMLDivElement | null>
	controls: RefObject<HTMLDivElement | null>
	textarea: RefObject<HTMLTextAreaElement | null>
}

type PromptLayout = { attachments?: ReactNode; currentValue: string }

const usePromptLayout = ({ attachments, currentValue }: PromptLayout) => {
	const formRef = useRef<HTMLFormElement>(null)
	const attachmentsRef = useRef<HTMLDivElement>(null)
	const promptRef = useRef<HTMLDivElement>(null)
	const singleLineRef = useRef<HTMLDivElement>(null)
	const measurementRef = useRef<HTMLDivElement>(null)
	const leadingRef = useRef<HTMLDivElement>(null)
	const controlsRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const latestResize = useRef(() => {})
	const [isExpanded, setIsExpanded] = useState(false)
	const [hasAttachments, setHasAttachments] = useState(false)

	const resizeTextarea = useCallback(() => {
		const textarea = textareaRef.current
		const form = formRef.current
		const measurement = measurementRef.current
		const singleLine = singleLineRef.current
		const prompt = promptRef.current
		const controls = controlsRef.current
		const isReady =
			textarea && form && measurement && singleLine && prompt && controls
		if (!isReady || textarea.value !== currentValue) return

		const isCarryingFiles =
			Boolean(attachments) &&
			(attachmentsRef.current?.childElementCount ?? 0) > 0
		setHasAttachments(isCarryingFiles)

		const promptWidth = Math.ceil(singleLine.getBoundingClientRect().width)
		const isFillingRow =
			rowsIn(singleLine) > 1 ||
			promptWidth > roomBesideControls(form, leadingRef.current, controls)

		prompt.style.flexBasis = isFillingRow ? "100%" : `${promptWidth}px`
		measurement.style.width = `${textarea.clientWidth}px`

		const rows = Math.min(Math.max(rowsIn(measurement), MIN_ROWS), MAX_ROWS)
		textarea.style.height = `${rows * LINE_HEIGHT + PADDING_Y}px`

		setIsExpanded(isFillingRow)
	}, [attachments, currentValue])

	useLayoutEffect(() => {
		latestResize.current = resizeTextarea
		resizeTextarea()
	}, [resizeTextarea])

	useEffect(() => {
		const prompt = promptRef.current
		if (!prompt || typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(() => latestResize.current())
		observer.observe(prompt)
		return () => observer.disconnect()
	}, [])

	const refs: PromptRefs = {
		form: formRef,
		attachments: attachmentsRef,
		prompt: promptRef,
		singleLine: singleLineRef,
		measurement: measurementRef,
		leading: leadingRef,
		controls: controlsRef,
		textarea: textareaRef,
	}

	return { refs, isExpanded, hasAttachments }
}

export { MIN_ROWS, usePromptLayout }
