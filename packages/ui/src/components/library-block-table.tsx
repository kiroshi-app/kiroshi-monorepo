"use client"

import {
	type FocusEvent,
	type KeyboardEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { Icons } from "@workspace/ui/components/icons"
import {
	type SourceEdit,
	tableRowsOf,
	tableSourceOf,
	withCell,
	withColumn,
	withRow,
} from "@workspace/ui/components/library-document-blocks"
import { GrowingField } from "@workspace/ui/components/library-document-editor"
import { MarkdownTable } from "@workspace/ui/components/markdown/table"

type LibraryTableEditorProps = {
	source: string
	onEdit: SourceEdit
}

type CellFocus = {
	index: number
}

type ColumnGrip = {
	left: number
	top: number
}

type TableNode = NonNullable<ExtraProps["node"]>

const CELL_SLOT = "library-table-cell"

const DELIMITER_ROWS = 1

const tableNodeOf = (rows: string[][]): TableNode => ({
	type: "element",
	tagName: "table",
	properties: {},
	children: rows.map((cells, row) => ({
		type: "element",
		tagName: "tr",
		properties: {},
		children: cells.map((value) => ({
			type: "element",
			tagName: row === 0 ? "th" : "td",
			properties: {},
			children: [{ type: "text", value }],
		})),
	})),
})

const editTable =
	(change: (rows: string[][]) => string[][]) => (source: string) =>
		tableSourceOf(change(tableRowsOf(source)))

const LibraryTableEditor = ({ source, onEdit }: LibraryTableEditorProps) => {
	const { t } = useTranslation("common")
	const frame = useRef<HTMLDivElement>(null)
	const [cellFocus, setCellFocus] = useState<CellFocus>()
	const [grip, setGrip] = useState<ColumnGrip>()
	const [header = [], , ...body] = tableRowsOf(source)
	const columns = header.length
	const shown = [header, ...body].map((cells) =>
		Array.from({ length: columns }, (_, column) => cells[column] ?? ""),
	)

	useLayoutEffect(() => {
		if (!cellFocus) return
		frame.current
			?.querySelectorAll<HTMLTextAreaElement>(
				`[data-slot="${CELL_SLOT}"] textarea`,
			)
			[cellFocus.index]?.focus()
	}, [cellFocus])

	const sourceRowOf = (row: number) => (row === 0 ? 0 : row + DELIMITER_ROWS)

	const write = (row: number, column: number, value: string) =>
		onEdit(editTable((rows) => withCell(rows, sourceRowOf(row), column, value)))

	const keyInCell =
		(index: number) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.nativeEvent.isComposing) return
			if (event.key === "Enter") {
				event.preventDefault()
				return
			}
			if (event.key !== "Tab") return
			const next = index + (event.shiftKey ? -1 : 1)
			if (next < 0 || next >= shown.length * columns) return
			event.preventDefault()
			setCellFocus({ index: next })
		}

	const showGrip = (event: FocusEvent<HTMLElement>) => {
		const container = frame.current?.getBoundingClientRect()
		const table = frame.current?.querySelector("table")?.getBoundingClientRect()
		if (!container || !table) return
		const cell = event.currentTarget.getBoundingClientRect()
		setGrip({
			left: cell.left - container.left + cell.width / 2,
			top: table.top - container.top,
		})
	}

	const addRow = () => {
		onEdit(editTable(withRow))
		setCellFocus({ index: shown.length * columns })
	}

	const addColumn = () => {
		onEdit(editTable(withColumn))
		setCellFocus({ index: columns })
	}

	const cellOf = (row: number) => (value: string, column: number) => {
		const index = row * columns + column
		const Cell = row === 0 ? "th" : "td"
		return (
			<Cell
				className="focus-within:bg-card focus-within:inset-ring-2 focus-within:inset-ring-primary"
				data-slot={CELL_SLOT}
				key={column}
				onBlur={() => setGrip(undefined)}
				onFocus={showGrip}
			>
				<GrowingField
					aria-label={t("library.editor.blocks.table.cell", {
						row: row + 1,
						column: column + 1,
					})}
					className="min-w-6"
					data-slot="library-document-block-field"
					fieldClassName="w-full placeholder:text-faint-foreground"
					onChange={(event) => write(row, column, event.target.value)}
					onKeyDown={keyInCell(index)}
					placeholder={t("library.editor.blocks.table.empty")}
					value={value}
				/>
			</Cell>
		)
	}

	return (
		<div
			className="relative grid w-fit max-w-full grid-cols-[minmax(0,auto)_1.5rem] gap-x-3 gap-y-1 *:data-[slot=markdown-table]:mt-0"
			data-slot="library-table-editor"
			ref={frame}
		>
			<MarkdownTable node={tableNodeOf(shown)}>
				<thead>
					<tr>{shown[0].map(cellOf(0))}</tr>
				</thead>
				{shown.length > 1 ? (
					<tbody>
						{shown.slice(1).map((cells, row) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a row is the slot at its position
							<tr key={row}>{cells.map(cellOf(row + 1))}</tr>
						))}
					</tbody>
				) : null}
			</MarkdownTable>
			<button
				aria-label={t("library.editor.blocks.table.addColumn")}
				className="mb-2 grid place-items-center rounded-[6px] bg-foreground/4 text-muted-foreground outline-offset-2 hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12"
				data-slot="library-table-add-column"
				onClick={addColumn}
				type="button"
			>
				<Icons.Add aria-hidden="true" className="size-3" />
			</button>
			<button
				className="flex h-6 items-center justify-center gap-1 rounded-[6px] bg-foreground/4 font-medium text-muted-foreground text-xs leading-4 outline-offset-2 hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12"
				data-slot="library-table-add-row"
				onClick={addRow}
				type="button"
			>
				<Icons.Add aria-hidden="true" className="size-3" />
				{t("library.editor.blocks.table.addRow")}
			</button>
			{grip ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute flex h-3.5 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-[4px] bg-primary"
					data-slot="library-table-column-grip"
					style={{ left: grip.left, top: grip.top }}
				>
					<span className="size-0.75 rounded-full bg-primary-foreground" />
					<span className="size-0.75 rounded-full bg-primary-foreground" />
					<span className="size-0.75 rounded-full bg-primary-foreground" />
				</span>
			) : null}
		</div>
	)
}

export { LibraryTableEditor }
