"use client"

import {
	type KeyboardEvent,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { Icons } from "@workspace/ui/components/icons"
import {
	LibraryBlockText,
	selectInField,
} from "@workspace/ui/components/library-block-text"
import {
	type SourceEdit,
	tableCellRangesOf,
	tableRowsOf,
	tableSourceOf,
	withCell,
	withColumn,
	withRow,
} from "@workspace/ui/components/library-document-blocks"
import type { SourceRange } from "@workspace/ui/components/library-document-inline"
import type { MarkdownRunRenderer } from "@workspace/ui/components/markdown/run"
import type { MarkdownRun } from "@workspace/ui/components/markdown/runs"
import { MarkdownTable } from "@workspace/ui/components/markdown/table"

type LibraryTableEditorProps = {
	source: string
	onEdit: SourceEdit
	runs?: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
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

const FIELD_SLOT = "library-document-block-field"

const DELIMITER_ROWS = 1

const NO_RUNS: MarkdownRun[] = []

const runsWithin = (runs: MarkdownRun[], cell: SourceRange | undefined) =>
	cell
		? runs.flatMap(({ id, start, end }) => {
				const run = {
					id,
					start: Math.max(start, cell.from) - cell.from,
					end: Math.min(end, cell.to) - cell.from,
				}
				return run.start < run.end ? [run] : []
			})
		: NO_RUNS

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

const LibraryTableEditor = ({
	source,
	onEdit,
	runs = NO_RUNS,
	renderRun,
}: LibraryTableEditorProps) => {
	const { t } = useTranslation("common")
	const frame = useRef<HTMLDivElement>(null)
	const [cellFocus, setCellFocus] = useState<CellFocus>()
	const [grip, setGrip] = useState<ColumnGrip>()
	const [header = [], , ...body] = tableRowsOf(source)
	const columns = header.length
	const shown = [header, ...body].map((cells) =>
		Array.from({ length: columns }, (_, column) => cells[column] ?? ""),
	)
	const [headerRanges = [], , ...bodyRanges] = tableCellRangesOf(source)
	const ranges = [headerRanges, ...bodyRanges]

	useLayoutEffect(() => {
		if (!cellFocus) return
		const field = frame.current?.querySelectorAll<HTMLElement>(
			`[data-slot="${CELL_SLOT}"] [data-slot="${FIELD_SLOT}"]`,
		)[cellFocus.index]
		if (!field) return
		field.focus()
		selectInField(field)
	}, [cellFocus])

	const sourceRowOf = (row: number) => (row === 0 ? 0 : row + DELIMITER_ROWS)

	const write = (row: number, column: number, value: string) =>
		onEdit(editTable((rows) => withCell(rows, sourceRowOf(row), column, value)))

	const keyInCell =
		(index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
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

	const placeGrip = () => {
		const focused = frame.current?.querySelector(
			`[data-slot="${CELL_SLOT}"]:focus-within`,
		)
		const container = frame.current?.getBoundingClientRect()
		const viewport = frame.current
			?.querySelector('[data-slot="markdown-table"] > [role="group"]')
			?.getBoundingClientRect()
		if (!focused || !container || !viewport) {
			setGrip(undefined)
			return
		}
		const cell = focused.getBoundingClientRect()
		const centre = cell.left + cell.width / 2
		const isShown = centre >= viewport.left && centre <= viewport.right
		setGrip(
			isShown
				? { left: centre - container.left, top: viewport.top - container.top }
				: undefined,
		)
	}

	const followLayout = useEffectEvent(placeGrip)

	useEffect(() => {
		const editor = frame.current
		if (!editor) return
		const observer = new ResizeObserver(() => followLayout())
		observer.observe(editor)
		return () => observer.disconnect()
	}, [])

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
				onFocus={placeGrip}
			>
				<LibraryBlockText
					aria-label={t("library.editor.blocks.table.cell", {
						row: row + 1,
						column: column + 1,
					})}
					className="min-w-6 [&_[data-slot=library-document-placeholder]]:before:text-faint-foreground"
					data-slot={FIELD_SLOT}
					hint={t("library.editor.blocks.table.empty")}
					onEdit={(text) => write(row, column, text)}
					onKeyDown={keyInCell(index)}
					renderRun={renderRun}
					runs={runsWithin(runs, ranges[row]?.[column])}
					source={value}
					type="line"
				/>
			</Cell>
		)
	}

	return (
		<div
			className="relative grid w-fit max-w-full grid-cols-[minmax(0,auto)_1.5rem] gap-x-3 gap-y-1 *:data-[slot=markdown-table]:mt-0"
			data-slot="library-table-editor"
			onScrollCapture={placeGrip}
			ref={frame}
		>
			<MarkdownTable
				className="[&_td]:p-2.5 [&_th]:p-2.5"
				node={tableNodeOf(shown)}
			>
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
				className="mb-2 grid place-items-center rounded-sm bg-foreground/4 text-muted-foreground outline-offset-2 hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12"
				data-slot="library-table-add-column"
				onClick={addColumn}
				type="button"
			>
				<Icons.Add aria-hidden="true" className="size-3" />
			</button>
			<button
				className="flex h-6 items-center justify-center gap-1 rounded-sm bg-foreground/4 font-medium text-muted-foreground text-xs leading-4 outline-offset-2 hover:bg-foreground/8 hover:text-foreground active:bg-foreground/12"
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
