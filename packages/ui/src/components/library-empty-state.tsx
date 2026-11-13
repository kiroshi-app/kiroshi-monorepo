"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BoardDotGrid } from "@workspace/ui/components/board-canvas"
import { Icons } from "@workspace/ui/components/icons"
import { LibraryPage } from "@workspace/ui/components/library-grid"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type LibraryTemplate = "brief" | "meetingNotes" | "checklist"

const LIBRARY_TEMPLATES: LibraryTemplate[] = [
	"brief",
	"meetingNotes",
	"checklist",
]

const OUTLINED_PILL =
	"h-8 rounded-full border-input bg-transparent font-medium text-compact text-foreground leading-4 transition-none hover:bg-foreground/5 dark:bg-transparent dark:hover:bg-foreground/5"

const DASHED = "border-[1.5px] border-input border-dashed"

const BLANK_BOARD_GRID_PITCH = 12

const CARD_FOCUS =
	"focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2"

type LibrarySectionProps = {
	title: string
	children: ReactNode
}

const LibrarySection = ({ title, children }: LibrarySectionProps) => (
	<section className="flex flex-col gap-3.5">
		<h2 className="font-semibold text-foreground text-reading leading-5">
			{title}
		</h2>
		{children}
	</section>
)

type TemplateCardProps = {
	name: string
	thumbnail: ReactNode
	thumbnailClassName: string
	onPress: () => void
}

const TemplateCard = ({
	name,
	thumbnail,
	thumbnailClassName,
	onPress,
}: TemplateCardProps) => (
	<button
		className={cn(
			"group/template flex w-50 flex-col gap-2.5 rounded-control text-start",
			CARD_FOCUS,
		)}
		data-slot="library-template"
		onClick={onPress}
		type="button"
	>
		<span
			className={cn(
				"relative flex h-37.5 items-center justify-center overflow-hidden rounded-control",
				thumbnailClassName,
			)}
		>
			{thumbnail}
		</span>
		<span className="truncate font-medium text-compact text-foreground leading-4.5">
			{name}
		</span>
	</button>
)

const BlankBoardThumbnail = () => (
	<>
		<BoardDotGrid pitch={BLANK_BOARD_GRID_PITCH} />
		<span
			aria-hidden="true"
			className="pointer-events-none relative size-10 -rotate-4 rounded-[3px] bg-board-sticky-yellow shadow-board-hint-sticky group-hover/template:shadow-board-hint-sticky-raised"
			data-slot="library-blank-board-sticky"
		/>
	</>
)

type LibraryEmptyStateProps = {
	onNewDocument?: () => void
	onNewBoard?: () => void
	onStartTemplate?: (template: LibraryTemplate) => void
	onImport?: () => void
}

const LibraryEmptyState = ({
	onNewDocument,
	onNewBoard,
	onStartTemplate,
	onImport,
}: LibraryEmptyStateProps) => {
	const { t } = useTranslation("common")
	const canStart = Boolean(onNewDocument || onNewBoard || onStartTemplate)

	if (!canStart && !onImport) return null

	return (
		<div className="flex flex-col gap-8" data-slot="library-empty-state">
			{canStart ? (
				<LibrarySection title={t("library.start")}>
					<div className="flex flex-wrap gap-4">
						{onNewDocument ? (
							<TemplateCard
								name={t("library.templates.blank.name")}
								onPress={onNewDocument}
								thumbnail={
									<Icons.Add
										aria-hidden="true"
										className="size-5.5 text-primary"
									/>
								}
								thumbnailClassName={cn(
									DASHED,
									"group-hover/template:bg-foreground/3",
								)}
							/>
						) : null}
						{onNewBoard ? (
							<TemplateCard
								name={t("library.blankBoard")}
								onPress={onNewBoard}
								thumbnail={<BlankBoardThumbnail />}
								thumbnailClassName="border border-input border-dashed bg-board-surface"
							/>
						) : null}
						{onStartTemplate
							? LIBRARY_TEMPLATES.map((template) => (
									<TemplateCard
										key={template}
										name={t(`library.templates.${template}.name`)}
										onPress={() => onStartTemplate(template)}
										thumbnail={
											<LibraryPage
												className="start-7.5 top-4 w-35"
												excerpt={t(`library.templates.${template}.preview`)}
											/>
										}
										thumbnailClassName="border border-shell-border bg-(--document-ground) group-hover/template:border-input"
									/>
								))
							: null}
					</div>
				</LibrarySection>
			) : null}
			{onImport ? (
				<LibrarySection title={t("library.bringIn.title")}>
					<div
						className={cn(
							"flex w-212 max-w-full items-center gap-3.5 rounded-xl px-4.5 py-4",
							DASHED,
						)}
						data-slot="library-import-strip"
					>
						<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/6">
							<Icons.Import
								aria-hidden="true"
								className="size-4.5 text-muted-foreground"
							/>
						</span>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium text-foreground text-sm leading-5">
								{t("library.bringIn.drop")}
							</span>
							<span className="text-compact text-muted-foreground leading-4.5">
								{t("library.bringIn.formats")}
							</span>
						</span>
						<Button
							className={cn(OUTLINED_PILL, "px-3.5")}
							onClick={onImport}
							variant="outline"
						>
							{t("library.bringIn.action")}
						</Button>
					</div>
				</LibrarySection>
			) : null}
		</div>
	)
}

export {
	LIBRARY_TEMPLATES,
	LibraryEmptyState,
	type LibraryEmptyStateProps,
	type LibraryTemplate,
}
