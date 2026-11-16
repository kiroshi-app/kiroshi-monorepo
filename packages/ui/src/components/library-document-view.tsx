"use client"

import {
	type ComponentProps,
	type MouseEvent,
	type ReactNode,
	type Ref,
	type TextareaHTMLAttributes,
	useCallback,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderPathLink,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import { Icons } from "@workspace/ui/components/icons"
import {
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	LibraryPresenceInBar,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	handlersFor,
	LibraryBarMeta,
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
	"break-words font-heading font-semibold text-[1.75rem] text-foreground leading-[2.125rem] tracking-[-0.01em]"

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
		meta?: string
		presence?: ReactNode
		isReadOnly?: boolean
		menuFinalFocus?: () => HTMLElement | boolean
	}

const LibraryDocumentReadOnly = () => {
	const { t } = useTranslation("common")

	return (
		<span
			className="flex h-7 shrink-0 items-center gap-1.5 rounded-header-island-control bg-foreground/5 px-2.5 font-medium text-soft-foreground text-xs leading-4"
			data-slot="library-document-read-only"
		>
			<Icons.Lock aria-hidden="true" className="size-3.25" />
			{t("library.document.readOnly")}
		</span>
	)
}

const LibraryDocumentBar = <Item extends LibraryMenuSubject>({
	item,
	onBack,
	meta,
	presence,
	isReadOnly = false,
	menuFinalFocus,
	...actions
}: LibraryDocumentBarProps<Item>) => {
	const { t } = useTranslation("common")
	const shownName = libraryDisplayName(item.name, t)

	return (
		<AppHeader
			close={
				<LibraryItemBarActions
					actions={handlersFor(actions, item)}
					item={item}
					leading={
						<>
							<LibraryPresenceInBar value={true}>
								{presence}
							</LibraryPresenceInBar>
							{isReadOnly ? <LibraryDocumentReadOnly /> : null}
						</>
					}
					menuFinalFocus={menuFinalFocus}
					onClose={onBack}
					surface="document"
				/>
			}
			leading={
				<nav className="min-w-0">
					<AppHeaderText
						topLine={
							<>
								<AppHeaderPathLink className="shrink-0" onClick={onBack}>
									{t("library.document.back")}
								</AppHeaderPathLink>
								<LibraryBarMeta meta={meta} />
							</>
						}
					>
						<span
							aria-current="page"
							className={APP_HEADER_TITLE}
							title={shownName}
						>
							{shownName}
						</span>
					</AppHeaderText>
				</nav>
			}
		/>
	)
}

const DOCUMENT_PAGE = "size-full min-h-0"

const DOCUMENT_COLUMN_MEASURE =
	"[--document-column-width:794px] max-w-(--document-column-width)"

const useOverflowsBlock = () => {
	const [overflows, setOverflows] = useState(false)

	const scrollerRef = useCallback((scroller: HTMLElement | null) => {
		if (!scroller) return

		const observer = new ResizeObserver(() =>
			setOverflows(scroller.scrollHeight > scroller.clientHeight),
		)
		observer.observe(scroller)
		for (const content of scroller.children) observer.observe(content)

		return () => observer.disconnect()
	}, [])

	return { overflows, scrollerRef }
}

type LibraryDocumentColumnProps = {
	heading: ReactNode
	children: ReactNode
	readOnlyHeadingId?: string
	onColumnMouseDown?: (event: MouseEvent<HTMLDivElement>) => void
}

const LibraryDocumentColumn = ({
	heading,
	children,
	readOnlyHeadingId,
	onColumnMouseDown,
}: LibraryDocumentColumnProps) => {
	const { overflows, scrollerRef } = useOverflowsBlock()
	const keyboardScrollRegion = overflows
		? { role: "region", "aria-labelledby": readOnlyHeadingId, tabIndex: 0 }
		: undefined

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer press only moves focus into a field the keyboard already reaches with Tab */}
			<div
				className={cn(
					"@container min-h-0 flex-1 overflow-y-auto px-10 pt-6 pb-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring",
					onColumnMouseDown && "cursor-text",
				)}
				data-slot="library-document-column"
				onMouseDown={onColumnMouseDown}
				ref={readOnlyHeadingId ? scrollerRef : undefined}
				{...keyboardScrollRegion}
			>
				<article
					className={cn(
						"mx-auto flex w-full flex-col gap-3.5",
						DOCUMENT_COLUMN_MEASURE,
					)}
				>
					<header className="pb-1.5">{heading}</header>
					{children}
				</article>
			</div>
		</div>
	)
}

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
		people?: ComponentProps<typeof LibraryDocumentPresence>["people"]
		onStopAll?: () => void
		resolveImage?: ResolveImage
	}

const LibraryDocumentView = ({
	document,
	onBack,
	writers = [],
	people = [],
	onStopAll,
	onStop,
	onOpenConversation,
	resolveImage,
	...actions
}: LibraryDocumentViewProps) => {
	const { t } = useTranslation("common")
	const isWriting = writers.length > 0
	const headingId = useId()

	return (
		<ScreenLayout
			className={DOCUMENT_PAGE}
			data-slot="library-document-view"
			header={
				<LibraryDocumentBar
					{...actions}
					item={document}
					meta={document.detail}
					onBack={onBack}
					presence={
						isWriting || people.length > 0 ? (
							<LibraryDocumentPresence
								onStopAll={onStopAll}
								people={people}
								writers={writers}
							/>
						) : null
					}
				/>
			}
			scroller={() => (
				<LibraryDocumentColumn
					heading={
						<h1 className={DOCUMENT_TITLE} id={headingId}>
							{libraryDisplayName(document.name, t)}
						</h1>
					}
					readOnlyHeadingId={headingId}
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
