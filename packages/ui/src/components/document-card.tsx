"use client"

import { type ReactNode, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import {
	FOCUS_OUTLINE,
	type LibraryDocumentAgent,
} from "@workspace/ui/components/library-document-agents"
import { Button } from "@workspace/ui/components/ui/button"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

const WRITER_AVATAR_SIZE = 18

const CARD_PILL = cn(
	"h-7 gap-1.5 rounded-full font-medium text-compact text-foreground leading-4 transition-none [&_svg:not([class*='size-'])]:size-3.5",
	FOCUS_OUTLINE,
)

type DocumentCardWriter =
	| { kind: "agent"; agent: LibraryDocumentAgent }
	| { kind: "person"; name: string; image?: string }

const DocumentGlyph = () => (
	<span
		aria-hidden="true"
		className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
		data-slot="document-glyph"
	>
		<Icons.File className="size-4" />
	</span>
)

type WriterChipProps = {
	writer: DocumentCardWriter
}

const WriterChip = ({ writer }: WriterChipProps) => {
	const { t } = useTranslation("common")
	const name = writer.kind === "agent" ? writer.agent.name : writer.name

	return (
		<span
			className="flex h-6 min-w-0 max-w-40 shrink-0 items-center gap-1.5 rounded-full bg-foreground/4 ps-0.75 pe-2"
			data-slot="document-card-writer"
		>
			<span aria-hidden="true" className="flex shrink-0">
				{writer.kind === "agent" ? (
					<BotIdentityAvatar
						hue={writer.agent.hue}
						image={writer.agent.image}
						name={writer.agent.name}
						seed={writer.agent.id}
						size={WRITER_AVATAR_SIZE}
					/>
				) : (
					<InitialsAvatar
						image={writer.image}
						name={writer.name}
						size={WRITER_AVATAR_SIZE}
					/>
				)}
			</span>
			<span className="truncate font-medium text-soft-foreground text-xs leading-4">
				{t("library.document.agents.caret", { name })}
			</span>
		</span>
	)
}

type DocumentCardFailure = "deleted" | "unreadable"

const FAILURE_KEY = {
	deleted: "library.card.failure.deleted",
	unreadable: "library.card.failure.unreadable",
} as const satisfies Record<DocumentCardFailure, string>

type FailureLineProps = {
	id: string
	failure: DocumentCardFailure
}

const FailureLine = ({ id, failure }: FailureLineProps) => {
	const { t } = useTranslation("common")

	return (
		<p
			className="flex items-start gap-1.5 break-words text-foreground text-sm leading-5.5"
			data-slot="document-card-failure"
			id={id}
		>
			<Icons.Error
				aria-hidden="true"
				className="my-0.75 size-4 shrink-0 text-destructive"
			/>
			<span className="min-w-0">{t(FAILURE_KEY[failure])}</span>
		</p>
	)
}

type DocumentCardHeadProps = {
	title: string
	writer?: DocumentCardWriter
	isSelected?: boolean
}

type DocumentCardShellProps = DocumentCardHeadProps & {
	detail?: ReactNode
	describedBy?: string
	children: ReactNode
}

const DocumentCardShell = ({
	title,
	writer,
	isSelected = false,
	detail,
	describedBy,
	children,
}: DocumentCardShellProps) => {
	const { t } = useTranslation("common")
	const titleId = useId()
	const shownTitle = libraryDisplayName(title, t)

	return (
		<article
			aria-describedby={describedBy}
			aria-labelledby={titleId}
			className={cn(
				"flex min-w-0 flex-col gap-3 rounded-control border border-border bg-card p-4",
				isSelected && "ring-2 ring-primary",
			)}
			data-selected={isSelected || undefined}
			data-slot="document-card"
		>
			<header className="flex min-w-0 items-center gap-2.5">
				<DocumentGlyph />
				<span className="flex min-w-0 flex-1 flex-col">
					<h3
						className="truncate font-semibold text-foreground text-reading leading-5"
						id={titleId}
						title={shownTitle}
					>
						{shownTitle}
					</h3>
					{detail ? (
						<span className="truncate text-muted-foreground text-xs leading-4 tabular-nums">
							{detail}
						</span>
					) : null}
				</span>
				{writer ? <WriterChip writer={writer} /> : null}
			</header>
			{children}
		</article>
	)
}

type LiveDocumentCardProps = DocumentCardHeadProps & {
	detail: string
	excerpt: string
	onOpen: () => void
	children: ReactNode
	failure?: never
}

type FailedDocumentCardProps = DocumentCardHeadProps & {
	failure: DocumentCardFailure
	detail?: never
	excerpt?: never
	onOpen?: never
	children?: never
}

type DocumentCardProps = LiveDocumentCardProps | FailedDocumentCardProps

const LiveDocumentCard = ({
	detail,
	excerpt,
	onOpen,
	children,
	...head
}: LiveDocumentCardProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setOpen] = useState(false)
	const bodyId = useId()

	return (
		<DocumentCardShell
			{...head}
			detail={isOpen ? t("library.card.live") : detail}
		>
			<div
				className={cn(
					isOpen && "flex flex-col gap-3 border-foreground/7 border-t py-3",
				)}
				data-slot="document-card-body"
				id={bodyId}
			>
				{isOpen ? (
					children
				) : (
					<p className="line-clamp-3 break-words text-soft-foreground text-sm leading-5.5">
						{excerpt}
					</p>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					aria-controls={bodyId}
					aria-expanded={isOpen}
					className={cn(
						CARD_PILL,
						"bg-foreground/6 ps-2 pe-3 hover:bg-foreground/10 active:bg-foreground/14 aria-expanded:bg-foreground/6 aria-expanded:hover:bg-foreground/10 dark:hover:bg-foreground/10",
					)}
					onClick={() => setOpen(!isOpen)}
					variant="ghost"
				>
					{isOpen ? (
						<Icons.Collapse aria-hidden="true" />
					) : (
						<Icons.Expand aria-hidden="true" />
					)}
					{isOpen ? t("library.card.hide") : t("library.card.show")}
				</Button>
				<Button
					className={cn(
						CARD_PILL,
						"border-border px-3 hover:bg-foreground/4 active:bg-foreground/8 dark:hover:bg-foreground/4",
					)}
					onClick={onOpen}
					variant="ghost"
				>
					{t("library.card.open")}
					<Icons.ArrowUpRight aria-hidden="true" />
				</Button>
			</div>
		</DocumentCardShell>
	)
}

const FailedDocumentCard = ({
	title,
	writer,
	isSelected,
	failure,
}: FailedDocumentCardProps) => {
	const failureId = useId()

	return (
		<DocumentCardShell
			describedBy={failureId}
			isSelected={isSelected}
			title={title}
			writer={writer}
		>
			<FailureLine failure={failure} id={failureId} />
		</DocumentCardShell>
	)
}

const DocumentCard = (props: DocumentCardProps) =>
	props.failure ? (
		<FailedDocumentCard {...props} />
	) : (
		<LiveDocumentCard {...props} />
	)

export {
	DocumentCard,
	type DocumentCardProps,
	type DocumentCardWriter,
	DocumentGlyph,
}
