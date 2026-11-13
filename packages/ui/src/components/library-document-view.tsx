"use client"

import type { MouseEvent, ReactNode, Ref, TextareaHTMLAttributes } from "react"
import { useTranslation } from "react-i18next"

import { HeaderIsland } from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import {
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	handlersFor,
	LIBRARY_ISLAND_CONTEXT,
	LIBRARY_ISLAND_TITLE,
	LibraryIslandButton,
	type LibraryItemActions,
	LibraryItemBarActions,
	type LibraryMenuSubject,
} from "@workspace/ui/components/library-item-menu"
import { Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
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

const PLACEHOLDER_LOOK =
	"pointer-events-none before:text-placeholder-foreground before:content-[attr(data-placeholder)]"

type GrowingFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
	value: string
	placeholder?: string
	hint?: string
	className: string
	fieldClassName: string
	fieldRef?: Ref<HTMLTextAreaElement>
}

const GrowingField = ({
	value,
	placeholder,
	hint,
	className,
	fieldClassName,
	fieldRef,
	...props
}: GrowingFieldProps) => (
	<span className={cn("grid break-words", className)}>
		<span
			aria-hidden="true"
			className="pointer-events-none invisible col-start-1 row-start-1 whitespace-pre-wrap"
		>
			{`${value || placeholder || ""}​`}
		</span>
		{hint ? (
			<span
				aria-hidden="true"
				className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap"
			>
				<span className="invisible">{value}</span>
				<span
					className={PLACEHOLDER_LOOK}
					data-placeholder={hint}
					data-slot="library-document-placeholder"
				/>
			</span>
		) : null}
		<textarea
			className={cn(
				"col-start-1 row-start-1 resize-none overflow-hidden bg-transparent outline-none",
				fieldClassName,
			)}
			placeholder={placeholder}
			ref={fieldRef}
			rows={1}
			value={value}
			{...props}
		/>
	</span>
)

type LibraryDocumentBarProps<Item extends LibraryMenuSubject> =
	LibraryItemActions<Item> & {
		item: Item
		onBack: () => void
		presence?: ReactNode
		isReadOnly?: boolean
		menuFinalFocus?: () => HTMLElement | boolean
	}

const LibraryDocumentReadOnly = () => {
	const { t } = useTranslation("common")

	return (
		<span
			className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 font-medium text-soft-foreground text-xs leading-4"
			data-slot="library-document-read-only"
		>
			<Icons.Lock aria-hidden="true" className="size-3.25" />
			{t("library.document.readOnly")}
		</span>
	)
}

const BAR_ROW =
	"flex shrink-0 justify-between gap-2 p-2 in-data-[slot=screen-layout-floating-header]:contents"

const LibraryDocumentBar = <Item extends LibraryMenuSubject>({
	item,
	onBack,
	presence,
	isReadOnly = false,
	menuFinalFocus,
	...actions
}: LibraryDocumentBarProps<Item>) => {
	const { t } = useTranslation("common")
	const shownName = libraryDisplayName(item.name, t)

	return (
		<div className={BAR_ROW} data-slot="library-document-bar">
			<HeaderIsland className={LIBRARY_ISLAND_CONTEXT}>
				<nav className="flex min-w-0 items-center gap-0.5">
					<LibraryIslandButton
						aria-label={t("library.document.back")}
						onClick={onBack}
					>
						<Icons.Previous aria-hidden="true" />
					</LibraryIslandButton>
					<span
						aria-current="page"
						className={LIBRARY_ISLAND_TITLE}
						title={shownName}
					>
						{shownName}
					</span>
				</nav>
			</HeaderIsland>
			<LibraryItemBarActions
				actions={handlersFor(actions, item)}
				item={item}
				leading={
					<>
						{presence}
						{isReadOnly ? <LibraryDocumentReadOnly /> : null}
					</>
				}
				menuFinalFocus={menuFinalFocus}
				onClose={onBack}
				surface="document"
			/>
		</div>
	)
}

const DOCUMENT_PAGE = "size-full min-h-0"

const DOCUMENT_COLUMN_MEASURE =
	"[--document-column-width:794px] max-w-(--document-column-width)"

type LibraryDocumentColumnProps = {
	heading: ReactNode
	detail: string
	children: ReactNode
	onColumnMouseDown?: (event: MouseEvent<HTMLDivElement>) => void
}

const LibraryDocumentColumn = ({
	heading,
	detail,
	children,
	onColumnMouseDown,
}: LibraryDocumentColumnProps) => (
	<div className="relative flex min-h-0 flex-1 flex-col">
		{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer press only moves focus into a field the keyboard already reaches with Tab */}
		<div
			className={cn(
				"@container min-h-0 flex-1 overflow-y-auto px-10 pt-14 pb-10",
				onColumnMouseDown && "cursor-text",
			)}
			data-slot="library-document-column"
			onMouseDown={onColumnMouseDown}
		>
			<article
				className={cn(
					"mx-auto flex w-full flex-col gap-3.5",
					DOCUMENT_COLUMN_MEASURE,
				)}
			>
				<header className="flex flex-col gap-1.5 pb-1.5">
					{heading}
					<p className="text-compact text-muted-foreground leading-4.5 tabular-nums">
						{detail}
					</p>
				</header>
				{children}
			</article>
		</div>
	</div>
)

type LibraryDocumentBodyProps = WriterActions & {
	body: string
	writers?: LibraryDocumentWriter[]
	resolveImage?: ResolveImage
}

const runsOf = (writers: LibraryDocumentWriter[]) =>
	writers.map(({ agent, start, end }) => ({ id: agent.id, start, end }))

const LibraryDocumentBody = ({
	body,
	writers = [],
	onStop,
	onOpenConversation,
	resolveImage,
}: LibraryDocumentBodyProps) => {
	const isWriting = writers.length > 0

	const renderRun = ({ id, isEnd, children }: MarkdownRunRenderProps) => {
		const writer = writers.find(({ agent }) => agent.id === id)
		return writer ? (
			<LibraryDocumentWrittenRun
				isEnd={isEnd}
				onOpenConversation={onOpenConversation}
				onStop={onStop}
				writer={writer}
			>
				{children}
			</LibraryDocumentWrittenRun>
		) : (
			children
		)
	}

	return (
		<Markdown
			className={DOCUMENT_TYPE}
			renderRun={isWriting ? renderRun : undefined}
			resolveImage={resolveImage}
			runs={isWriting ? runsOf(writers) : undefined}
		>
			{body}
		</Markdown>
	)
}

type LibraryDocumentViewProps = WriterActions &
	LibraryItemActions<LibraryDocument> & {
		document: LibraryDocument
		onBack: () => void
		writers?: LibraryDocumentWriter[]
		onStopAll?: () => void
		resolveImage?: ResolveImage
	}

const LibraryDocumentView = ({
	document,
	onBack,
	writers = [],
	onStopAll,
	onStop,
	onOpenConversation,
	resolveImage,
	...actions
}: LibraryDocumentViewProps) => {
	const { t } = useTranslation("common")
	const isWriting = writers.length > 0

	return (
		<ScreenLayout
			className={DOCUMENT_PAGE}
			data-slot="library-document-view"
			header={
				<LibraryDocumentBar
					{...actions}
					item={document}
					onBack={onBack}
					presence={
						isWriting ? (
							<LibraryDocumentPresence
								onStopAll={onStopAll}
								writers={writers}
							/>
						) : null
					}
				/>
			}
			isHeaderFloating
			scroller={() => (
				<LibraryDocumentColumn
					detail={document.detail}
					heading={
						<h1 className={DOCUMENT_TITLE}>
							{libraryDisplayName(document.name, t)}
						</h1>
					}
				>
					<LibraryDocumentBody
						body={document.body}
						onOpenConversation={onOpenConversation}
						onStop={onStop}
						resolveImage={resolveImage}
						writers={writers}
					/>
				</LibraryDocumentColumn>
			)}
		/>
	)
}

export {
	DOCUMENT_COLUMN_MEASURE,
	DOCUMENT_PAGE,
	DOCUMENT_TITLE,
	DOCUMENT_TYPE,
	GrowingField,
	type LibraryDocument,
	LibraryDocumentBar,
	LibraryDocumentBody,
	LibraryDocumentColumn,
	LibraryDocumentView,
	type LibraryDocumentViewProps,
	PLACEHOLDER_LOOK,
}
