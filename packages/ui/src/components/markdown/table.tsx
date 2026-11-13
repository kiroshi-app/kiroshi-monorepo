"use client"

import { type ComponentPropsWithoutRef, useContext } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { useMarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import {
	AnswerCard,
	AnswerCardAction,
	AnswerCardHeader,
} from "@workspace/ui/components/markdown/answer-card"
import { useBoardCards } from "@workspace/ui/components/markdown/board-link"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { MarkdownSizeContext } from "@workspace/ui/components/markdown/size"
import { Button } from "@workspace/ui/components/ui/button"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

export type MarkdownTableProps = ComponentPropsWithoutRef<"table"> & ExtraProps

interface TableNode {
	tagName?: string
	value?: string
	properties?: Record<string, unknown>
	children?: TableNode[]
}

const textOf = (node: TableNode): string => {
	if (node.tagName === "img") return String(node.properties?.alt ?? "")

	return node.value ?? (node.children ?? []).map(textOf).join("")
}

const rowsOf = (node: TableNode): TableNode[] =>
	node.tagName === "tr" ? [node] : (node.children ?? []).flatMap(rowsOf)

const cellsOf = (row: TableNode) =>
	(row.children ?? []).filter(
		({ tagName }) => tagName === "th" || tagName === "td",
	)

const WHITESPACE_RUN = /\s+/g

const fieldOf = (cell: TableNode) =>
	textOf(cell).replace(WHITESPACE_RUN, " ").trim()

const tableToTsv = (node?: TableNode) =>
	(node ? rowsOf(node) : [])
		.map((row) => cellsOf(row).map(fieldOf).join("\t"))
		.join("\n")

const CSV_FIELD_TO_QUOTE = /[",]/

const csvFieldOf = (cell: TableNode) => {
	const field = fieldOf(cell)

	return CSV_FIELD_TO_QUOTE.test(field)
		? `"${field.replaceAll('"', '""')}"`
		: field
}

const tableToCsv = (node?: TableNode) =>
	(node ? rowsOf(node) : [])
		.map((row) => cellsOf(row).map(csvFieldOf).join(","))
		.join("\r\n")

const bodyRowCountOf = (node?: TableNode) =>
	Math.max(0, (node ? rowsOf(node).length : 0) - 1)

const CELL_CLASS =
	"[&_td]:border-foreground/10 [&_td]:border-r [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border-foreground/10 [&_th]:border-r [&_th]:border-b [&_th]:bg-foreground/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_tbody_tr:last-child>*]:border-b-0 [&_tr>*:last-child]:border-r-0"

const TABLE_CLASS = `w-max border-collapse tabular-nums ${CELL_CLASS}`

const FRAME_CLASS = `${MARKDOWN_ESCAPED_BLOCK_CLASS} group/markdown-table relative my-2 w-fit max-w-full`

const VIEWPORT_CLASS =
	"overflow-x-auto rounded-xl border border-foreground/15 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

const STATIC_VIEWPORT_CLASS =
	"overflow-hidden rounded-xl border border-foreground/15"

const COPY_CLASS =
	"absolute top-1.5 right-1.5 bg-foreground/10 text-foreground opacity-0 hover:bg-foreground/20 focus-visible:opacity-100 group-focus-within/markdown-table:opacity-100 group-hover/markdown-table:opacity-100"

const ANSWER_CELL_CLASS =
	"[&_td]:h-11 [&_td]:border-muted [&_td]:border-b [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:text-sm [&_td]:leading-5 [&_th]:h-10 [&_th]:border-answer-card-divider [&_th]:border-b [&_th]:px-3.5 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold [&_th]:text-compact [&_th]:leading-5 [&_tbody_tr:last-child>*]:border-b-0"

const ANSWER_TABLE_CLASS = `w-max min-w-full border-separate border-spacing-0 tabular-nums ${ANSWER_CELL_CLASS}`

const ANSWER_VIEWPORT_CLASS =
	"overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset"

const AnswerTable = ({
	node,
	children,
	className,
	...props
}: MarkdownTableProps) => {
	const { t } = useTranslation("chat")
	const onDownloadTable = useMarkdownAnswerActions()?.onDownloadTable
	const { copied, copy } = useCopyText(tableToTsv(node))
	const cards = useBoardCards(node)

	return (
		<>
			<AnswerCard slot="markdown-table">
				<AnswerCardHeader
					label={t("table.counted", { count: bodyRowCountOf(node) })}
				>
					<AnswerCardAction
						icon={<Icons.Copy className="size-3.5" />}
						isDone={copied}
						doneAnnouncement={t("table.copyAnnounced")}
						name={t("table.copy")}
						onPress={() => {
							void copy()
						}}
					>
						{t("table.copyAction")}
					</AnswerCardAction>
					{onDownloadTable ? (
						<AnswerCardAction
							icon={<Icons.Download className="size-3.5" />}
							onPress={() => onDownloadTable(tableToCsv(node))}
						>
							{t("table.downloadCsv")}
						</AnswerCardAction>
					) : null}
				</AnswerCardHeader>
				<div
					// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing table must be keyboard scrollable
					tabIndex={0}
					role="group"
					aria-label={t("table.label")}
					className={ANSWER_VIEWPORT_CLASS}
				>
					<table {...props} className={cn(ANSWER_TABLE_CLASS, className)}>
						{children}
					</table>
				</div>
			</AnswerCard>
			{cards}
		</>
	)
}

const ChatTable = ({
	node,
	children,
	className,
	...props
}: MarkdownTableProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(tableToTsv(node))
	const cards = useBoardCards(node)

	return (
		<>
			<div data-slot="markdown-table" className={FRAME_CLASS}>
				<div
					// biome-ignore lint/a11y/noNoninteractiveTabindex: an overflowing table must be keyboard scrollable
					tabIndex={0}
					role="group"
					aria-label={t("table.label")}
					className={VIEWPORT_CLASS}
				>
					<table {...props} className={cn(TABLE_CLASS, className)}>
						{children}
					</table>
				</div>

				<Button
					aria-label={t("table.copy")}
					variant="ghost"
					size="icon-xs"
					className={COPY_CLASS}
					onClick={() => {
						void copy()
					}}
				>
					<IconSwap
						icon={<Icons.Copy />}
						isSwapped={copied}
						swappedIcon={<Icons.Check />}
					/>
				</Button>

				<span aria-live="polite" className="sr-only">
					{copied ? t("table.copyAnnounced") : ""}
				</span>
			</div>
			{cards}
		</>
	)
}

export const MarkdownTable = (props: MarkdownTableProps) =>
	useContext(MarkdownSizeContext) === "answer" ? (
		<AnswerTable {...props} />
	) : (
		<ChatTable {...props} />
	)

export const MarkdownStaticTable = ({
	node,
	children,
	className,
	...props
}: MarkdownTableProps) => (
	<div data-slot="markdown-table" className={FRAME_CLASS}>
		<div className={STATIC_VIEWPORT_CLASS}>
			<table {...props} className={cn(TABLE_CLASS, className)}>
				{children}
			</table>
		</div>
	</div>
)
