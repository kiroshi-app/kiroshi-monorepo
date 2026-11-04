"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { FOCUS_OUTLINE } from "@workspace/ui/components/library-document-agents"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const START_KINDS = ["checklist", "gallery", "table", "template"] as const

type LibraryDocumentStartKind = (typeof START_KINDS)[number]

const START_ICONS = {
	checklist: Icons.Checklist,
	gallery: Icons.Gallery,
	table: Icons.Table,
	template: Icons.Template,
} satisfies Record<LibraryDocumentStartKind, typeof Icons.Checklist>

const SMALL_PILL = cn(
	"h-6 rounded-full font-medium text-xs leading-4 transition-none",
	FOCUS_OUTLINE,
)

const FAILURE_CARD =
	"flex min-w-0 flex-col justify-center gap-2 border border-foreground/17 border-dashed bg-foreground/4 p-3"

const FAILURE_LINE =
	"flex min-w-0 items-center gap-1.5 font-semibold text-foreground text-xs leading-4"

const FAILURE_PRIMARY_PILL = cn(
	SMALL_PILL,
	"bg-card px-2.5 text-foreground ring-1 ring-foreground/8 hover:bg-muted active:bg-foreground/8 dark:hover:bg-muted",
)

type LibraryDocumentStartProps = {
	onStart: (kind: LibraryDocumentStartKind) => void
}

const LibraryDocumentStart = ({ onStart }: LibraryDocumentStartProps) => {
	const { t } = useTranslation("common")
	const labelId = useId()

	return (
		<div
			aria-labelledby={labelId}
			className="flex flex-wrap items-center gap-1.5 pt-4.5"
			data-slot="library-document-start"
			role="group"
		>
			<span
				className="font-medium text-muted-foreground text-xs leading-4"
				id={labelId}
			>
				{t("library.document.start.label")}
			</span>
			{START_KINDS.map((kind) => {
				const StartIcon = START_ICONS[kind]
				return (
					<Button
						className={cn(
							"h-7 gap-1.5 rounded-full border-border ps-2 pe-2.5 font-medium text-compact text-foreground leading-4 transition-none hover:bg-foreground/4 active:bg-foreground/8 dark:hover:bg-foreground/4",
							FOCUS_OUTLINE,
						)}
						key={kind}
						onClick={() => onStart(kind)}
						variant="ghost"
					>
						<StartIcon aria-hidden="true" className="size-3.5" />
						{t(`library.document.start.${kind}`)}
					</Button>
				)
			})}
		</div>
	)
}

type LibraryDocumentDropLineProps = {
	top: number
	imageCount: number
}

const LibraryDocumentDropLine = ({
	top,
	imageCount,
}: LibraryDocumentDropLineProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			className="pointer-events-none absolute inset-x-0 z-10"
			data-slot="library-document-drop-line"
			style={{ top }}
		>
			<span
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-0.5 -translate-y-1/2 rounded-full bg-primary"
			/>
			<span
				aria-hidden="true"
				className="absolute start-0 top-0 size-2.5 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
			/>
			<span className="absolute inset-x-0 top-0 flex -translate-y-1/2 justify-center px-4">
				<span
					className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-primary px-3 font-medium text-compact text-primary-foreground leading-4 shadow-drop-pill"
					data-slot="library-document-drop-pill"
					role="status"
				>
					<Icons.Import aria-hidden="true" className="size-3.5 shrink-0" />
					<span className="truncate">
						{t("library.document.drop", { count: imageCount })}
					</span>
				</span>
			</span>
		</div>
	)
}

type LibraryFailedImageProps = {
	name: string
	onChooseAnother: () => void
	onRemove: () => void
}

const LibraryFailedImage = ({
	name,
	onChooseAnother,
	onRemove,
}: LibraryFailedImageProps) => {
	const { t } = useTranslation("common")
	const lineId = useId()
	const line = t("library.failure.import.title", { name })

	return (
		<div
			aria-labelledby={lineId}
			className={cn(FAILURE_CARD, "size-full rounded-[inherit]")}
			data-slot="library-failed-image"
			role="group"
		>
			<p className={FAILURE_LINE}>
				<Icons.Error
					aria-hidden="true"
					className="size-4 shrink-0 text-destructive"
				/>
				<span className="truncate" id={lineId} title={line}>
					{line}
				</span>
			</p>
			<div className="flex flex-wrap items-center gap-1.5">
				<Button
					className={FAILURE_PRIMARY_PILL}
					onClick={onChooseAnother}
					variant="ghost"
				>
					{t("library.document.failedImport.choose")}
				</Button>
				<Button
					className={cn(
						SMALL_PILL,
						"px-2 text-soft-foreground hover:bg-foreground/6 hover:text-foreground active:bg-foreground/10 dark:hover:bg-foreground/6",
					)}
					onClick={onRemove}
					variant="ghost"
				>
					{t("library.document.failedImport.remove")}
				</Button>
			</div>
		</div>
	)
}

export {
	FAILURE_CARD,
	FAILURE_LINE,
	FAILURE_PRIMARY_PILL,
	LibraryDocumentDropLine,
	type LibraryDocumentDropLineProps,
	LibraryDocumentStart,
	type LibraryDocumentStartKind,
	type LibraryDocumentStartProps,
	LibraryFailedImage,
	type LibraryFailedImageProps,
}
