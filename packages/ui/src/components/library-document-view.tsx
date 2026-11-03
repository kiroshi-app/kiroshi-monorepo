"use client"

import type { MouseEvent, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	type LibraryDocumentEdit,
	type LibraryDocumentFinished,
	LibraryDocumentFinishedBar,
	LibraryDocumentFinishedRun,
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	handlersFor,
	LIBRARY_BAR,
	type LibraryItemActions,
	LibraryItemBarActions,
	type LibraryMenuSubject,
} from "@workspace/ui/components/library-item-menu"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocument = {
	id: string
	name: string
	detail: string
	body: string
}

const DOCUMENT_TYPE = cn(
	"max-w-none text-reading text-soft-foreground leading-6 [--typeset-flow:0.875rem] [&>:first-child]:mt-0",
	"[&_h2]:mt-6 [&_h2]:text-[1.0625rem] [&_h2]:leading-6 [&_:is(h1,h2,h3)+*]:mt-3.5",
	"[&_li]:mt-1.5 [&_li]:ps-1",
)

const DOCUMENT_TITLE =
	"break-words font-heading font-semibold text-[1.75rem] text-foreground leading-[2.125rem] tracking-[-0.02em]"

type LibraryDocumentBarProps<Item extends LibraryMenuSubject> =
	LibraryItemActions<Item> & {
		item: Item
		onBack: () => void
		presence?: ReactNode
	}

const LibraryDocumentBar = <Item extends LibraryMenuSubject>({
	item,
	onBack,
	presence,
	...actions
}: LibraryDocumentBarProps<Item>) => {
	const { t } = useTranslation("common")

	return (
		<div className={LIBRARY_BAR}>
			<nav className="flex min-w-0 items-center gap-1.5">
				<Button
					className="h-7 shrink-0 gap-1 rounded-full ps-1.5 pe-2.5 font-medium text-compact text-muted-foreground leading-4 transition-none hover:bg-foreground/6 hover:text-foreground dark:hover:bg-foreground/6"
					onClick={onBack}
					variant="ghost"
				>
					<Icons.Previous aria-hidden="true" />
					{t("library.document.back")}
				</Button>
				<span
					aria-hidden="true"
					className="text-compact text-muted-foreground leading-4"
				>
					/
				</span>
				<span
					aria-current="page"
					className="truncate ps-1 font-medium text-compact text-foreground leading-4"
					title={item.name}
				>
					{item.name}
				</span>
			</nav>
			<LibraryItemBarActions
				actions={handlersFor(actions, item)}
				item={item}
				leading={presence}
				onClose={onBack}
				surface="document"
			/>
		</div>
	)
}

type LibraryDocumentColumnProps = {
	heading: ReactNode
	detail: string
	children: ReactNode
	footer?: ReactNode
	onColumnMouseDown?: (event: MouseEvent<HTMLDivElement>) => void
}

const LibraryDocumentColumn = ({
	heading,
	detail,
	children,
	footer,
	onColumnMouseDown,
}: LibraryDocumentColumnProps) => (
	<div className="relative flex min-h-0 flex-1 flex-col">
		{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer press only moves focus into a field the keyboard already reaches with Tab */}
		<div
			className={cn(
				"min-h-0 flex-1 overflow-y-auto px-10 pt-10 pb-10",
				footer && "pb-24",
				onColumnMouseDown && "cursor-text",
			)}
			data-slot="library-document-column"
			onMouseDown={onColumnMouseDown}
		>
			<article className="mx-auto flex w-full max-w-160 flex-col gap-3.5">
				<header className="flex flex-col gap-1.5 pb-1.5">
					{heading}
					<p className="text-compact text-muted-foreground leading-4.5 tabular-nums">
						{detail}
					</p>
				</header>
				{children}
			</article>
		</div>
		{footer ? (
			<div className="pointer-events-none absolute inset-x-10 bottom-6 flex justify-center *:pointer-events-auto">
				{footer}
			</div>
		) : null}
	</div>
)

type LibraryDocumentViewProps = WriterActions &
	LibraryItemActions<LibraryDocument> & {
		document: LibraryDocument
		onBack: () => void
		writers?: LibraryDocumentWriter[]
		finished?: LibraryDocumentFinished
		onStopAll?: () => void
		onUndoAll?: () => void
		onDone?: () => void
	}

const runsOf = (edits: LibraryDocumentEdit[]) =>
	edits.map(({ agent, start, end }) => ({ id: agent.id, start, end }))

const LibraryDocumentView = ({
	document,
	onBack,
	writers = [],
	finished,
	onStopAll,
	onStop,
	onOpenConversation,
	onUndoAll,
	onDone,
	...actions
}: LibraryDocumentViewProps) => {
	const isWriting = writers.length > 0
	const shownFinished = isWriting ? undefined : finished
	const edits = isWriting ? writers : (shownFinished?.edits ?? [])

	const renderRun = ({ id, isEnd, children }: MarkdownRunRenderProps) => {
		const writer = writers.find(({ agent }) => agent.id === id)
		if (writer)
			return (
				<LibraryDocumentWrittenRun
					isEnd={isEnd}
					onOpenConversation={onOpenConversation}
					onStop={onStop}
					writer={writer}
				>
					{children}
				</LibraryDocumentWrittenRun>
			)
		const edit = edits.find(({ agent }) => agent.id === id)
		return edit ? (
			<LibraryDocumentFinishedRun agent={edit.agent}>
				{children}
			</LibraryDocumentFinishedRun>
		) : (
			children
		)
	}

	return (
		<div
			className="flex size-full min-h-0 flex-col"
			data-slot="library-document-view"
		>
			<LibraryDocumentBar
				{...actions}
				item={document}
				onBack={onBack}
				presence={
					isWriting ? (
						<LibraryDocumentPresence onStopAll={onStopAll} writers={writers} />
					) : null
				}
			/>
			<LibraryDocumentColumn
				detail={document.detail}
				footer={
					shownFinished ? (
						<LibraryDocumentFinishedBar
							finished={shownFinished}
							onDone={onDone}
							onUndoAll={onUndoAll}
						/>
					) : null
				}
				heading={<h1 className={DOCUMENT_TITLE}>{document.name}</h1>}
			>
				<Markdown
					className={DOCUMENT_TYPE}
					renderRun={edits.length > 0 ? renderRun : undefined}
					runs={edits.length > 0 ? runsOf(edits) : undefined}
				>
					{document.body}
				</Markdown>
			</LibraryDocumentColumn>
		</div>
	)
}

export {
	DOCUMENT_TITLE,
	type LibraryDocument,
	LibraryDocumentBar,
	LibraryDocumentColumn,
	LibraryDocumentView,
	type LibraryDocumentViewProps,
}
