"use client"

import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
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

export const MarkdownTable = ({
	node,
	children,
	className,
	...props
}: MarkdownTableProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(tableToTsv(node))

	return (
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
	)
}

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
