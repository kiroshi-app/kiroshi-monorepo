"use client"

import {
	type KeyboardEvent,
	type PointerEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	type ChecklistRow,
	checklistRowsOf,
	checklistSourceOf,
	movedTo,
	rowAfter,
	type SourceEdit,
	toggledRow,
	withRowText,
} from "@workspace/ui/components/library-document-blocks"
import { GrowingField } from "@workspace/ui/components/library-document-editor"
import { cn } from "@workspace/ui/lib/utils"

type LibraryChecklistEditorProps = {
	source: string
	onEdit: SourceEdit
	onLeave: (source: string) => void
	onRemove: () => void
}

type RowFocus = {
	index: number
	on: "field" | "grip"
	caret?: number
}

const DRAG_THRESHOLD = 4

const ROW_SLOT = "library-checklist-row"

const STEPS: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 }

const editRows =
	(change: (rows: ChecklistRow[]) => ChecklistRow[]) => (source: string) =>
		checklistSourceOf(change(checklistRowsOf(source)))

const LibraryChecklistEditor = ({
	source,
	onEdit,
	onLeave,
	onRemove,
}: LibraryChecklistEditorProps) => {
	const { t } = useTranslation("common")
	const { t: tChat } = useTranslation("chat")
	const list = useRef<HTMLUListElement>(null)
	const [rowFocus, setRowFocus] = useState<RowFocus>()
	const [drop, setDrop] = useState<number>()
	const rows = checklistRowsOf(source)

	useLayoutEffect(() => {
		if (!rowFocus) return
		const row = list.current?.querySelectorAll(`[data-slot="${ROW_SLOT}"]`)[
			rowFocus.index
		]
		if (rowFocus.on === "grip") {
			row
				?.querySelector<HTMLElement>('[data-slot="library-checklist-grip"]')
				?.focus()
			return
		}
		const field = row?.querySelector("textarea")
		if (!field) return
		const caret = rowFocus.caret ?? field.value.length
		field.focus()
		field.setSelectionRange(caret, caret)
	}, [rowFocus])

	const move = (from: number, to: number) => {
		if (to < 0 || to >= rows.length || to === from) return
		onEdit(editRows((current) => movedTo(current, from, to)))
		setRowFocus({ index: to, on: "grip" })
	}

	const slotAt = (y: number) =>
		[...(list.current?.querySelectorAll(`[data-slot="${ROW_SLOT}"]`) ?? [])]
			.map((row) => row.getBoundingClientRect())
			.filter(({ top, height }) => top + height / 2 < y).length

	const dropAt = (from: number, to: number) => {
		if (to === from || to === from + 1) return
		move(from, to > from ? to - 1 : to)
	}

	const startDrag = (from: number) => (event: PointerEvent<HTMLElement>) => {
		if (event.button !== 0) return
		const start = { y: event.clientY, isMoving: false }
		const follow = (moved: globalThis.PointerEvent) => {
			if (!start.isMoving && Math.abs(moved.clientY - start.y) < DRAG_THRESHOLD)
				return
			start.isMoving = true
			setDrop(slotAt(moved.clientY))
		}
		const finish = (end: globalThis.PointerEvent) => {
			window.removeEventListener("pointermove", follow)
			window.removeEventListener("pointerup", finish)
			window.removeEventListener("pointercancel", finish)
			setDrop(undefined)
			if (start.isMoving && end.type === "pointerup")
				dropAt(from, slotAt(end.clientY))
		}
		window.addEventListener("pointermove", follow)
		window.addEventListener("pointerup", finish)
		window.addEventListener("pointercancel", finish)
	}

	const moveByKey = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
		const step = STEPS[event.key]
		if (!step || event.altKey || event.metaKey || event.ctrlKey) return
		event.preventDefault()
		event.stopPropagation()
		move(index, index + step)
	}

	const keyInRow =
		(index: number) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.nativeEvent.isComposing) return
			const { value, selectionStart: caret, selectionEnd } = event.currentTarget
			if (caret !== selectionEnd) return
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault()
				if (value === "") {
					onLeave(checklistSourceOf(rows.filter((_, at) => at !== index)))
					return
				}
				onEdit(
					editRows((current) => [
						...current.slice(0, index),
						withRowText(current[index], value.slice(0, caret)),
						rowAfter(current[index], value.slice(caret)),
						...current.slice(index + 1),
					]),
				)
				setRowFocus({ index: index + 1, on: "field", caret: 0 })
				return
			}
			if (event.key === "Backspace" && value === "") {
				event.preventDefault()
				if (rows.length === 1) {
					onRemove()
					return
				}
				onEdit(editRows((current) => current.filter((_, at) => at !== index)))
				setRowFocus({ index: Math.max(index - 1, 0), on: "field" })
			}
		}

	const editRow = (
		index: number,
		change: (row: ChecklistRow) => ChecklistRow,
	) =>
		onEdit(
			editRows((current) =>
				current.map((row, at) => (at === index ? change(row) : row)),
			),
		)

	return (
		<ul
			className={cn(
				"relative flex flex-col gap-1.5",
				drop !== undefined && "select-none",
			)}
			data-slot="library-checklist-editor"
			ref={list}
		>
			{rows.map((row, index) => {
				const position = index + 1
				return (
					<li
						className="group/row relative mt-0! flex items-start gap-2.5 ps-0!"
						data-slot={ROW_SLOT}
						// biome-ignore lint/suspicious/noArrayIndexKey: a row is the line at its position, two rows may read the same
						key={index}
					>
						<button
							aria-label={t("library.editor.blocks.checklist.move", {
								position,
							})}
							className="absolute -start-6.5 top-0.5 grid size-5 cursor-grab touch-none place-items-center rounded-sm text-muted-foreground opacity-0 outline-offset-1 hover:bg-accent hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover/row:opacity-100 [&_svg]:size-4"
							data-slot="library-checklist-grip"
							onKeyDown={moveByKey(index)}
							onPointerDown={startDrag(index)}
							type="button"
						>
							<Icons.Drag aria-hidden="true" />
						</button>
						{row.isDone === undefined ? null : (
							<span className="relative mt-1 grid size-4 shrink-0">
								<input
									aria-label={tChat(row.isDone ? "task.done" : "task.todo")}
									checked={row.isDone}
									className="peer size-4 appearance-none rounded-[5px] border-[1.5px] border-foreground/30 bg-card outline-offset-2 checked:border-primary checked:bg-primary group-focus-within/row:not-checked:border-primary group-focus-within/row:not-checked:bg-primary/8"
									data-slot="library-checklist-box"
									onChange={() => editRow(index, toggledRow)}
									type="checkbox"
								/>
								<Icons.Check
									aria-hidden="true"
									className="pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
								/>
							</span>
						)}
						<GrowingField
							aria-label={t("library.editor.blocks.checklist.item", {
								position,
							})}
							className="min-w-0 flex-1"
							data-slot="library-document-block-field"
							fieldClassName={cn(
								"w-full",
								row.isDone && "text-muted-foreground line-through",
							)}
							onChange={(event) =>
								editRow(index, (current) =>
									withRowText(current, event.target.value),
								)
							}
							onKeyDown={keyInRow(index)}
							value={row.text}
						/>
						{drop === index ||
						(drop === rows.length && index === rows.length - 1) ? (
							<span
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary",
									drop === index ? "-top-1" : "-bottom-1",
								)}
								data-slot="library-checklist-drop-indicator"
							/>
						) : null}
					</li>
				)
			})}
		</ul>
	)
}

export { LibraryChecklistEditor }
