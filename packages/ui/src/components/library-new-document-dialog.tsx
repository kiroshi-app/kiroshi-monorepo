"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { Icons } from "@workspace/ui/components/icons"
import {
	LIBRARY_TEMPLATES,
	type LibraryTemplate,
} from "@workspace/ui/components/library-empty-state"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogTitle,
} from "@workspace/ui/components/ui/dialog"
import { RadioGroup } from "@workspace/ui/components/ui/radio-group"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocumentTemplate = "blank" | LibraryTemplate

const LIBRARY_DOCUMENT_TEMPLATES: LibraryDocumentTemplate[] = [
	"blank",
	...LIBRARY_TEMPLATES,
]

const PILL =
	"h-9 rounded-full px-4 font-medium text-sm leading-4.5 transition-none"

type SketchSection = {
	heading?: string
	lines: number
}

type SketchLineProps = {
	isShort: boolean
}

const SketchLine = ({ isShort }: SketchLineProps) => (
	<span
		className={cn("block h-1 rounded-xs bg-sketch-line", isShort && "w-2/3")}
	/>
)

type SketchPageProps = {
	title: string
	className: string
	children: ReactNode
}

const SketchPage = ({ title, className, children }: SketchPageProps) => (
	<span
		className={cn(
			"absolute inset-x-0 top-4 bottom-0 mx-auto flex w-35 flex-col overflow-hidden rounded-t-sm bg-card-raised p-3",
			className,
		)}
	>
		<span className="font-semibold text-[0.625rem] text-foreground leading-[0.8125rem]">
			{title}
		</span>
		{children}
	</span>
)

type SectionedSketchProps = {
	title: string
	sections: SketchSection[]
}

const SectionedSketch = ({ title, sections }: SectionedSketchProps) => (
	<SketchPage className="gap-2.5" title={title}>
		{sections.map(({ heading, lines }) => (
			<span className="flex flex-col gap-1.5" key={heading ?? "lead"}>
				{heading ? (
					<span className="font-semibold text-[0.5rem] text-foreground leading-[0.6875rem]">
						{heading}
					</span>
				) : null}
				{Array.from({ length: lines }, (_, line) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a line is a fixed slot of the sketch
					<SketchLine isShort={line > 0 && line === lines - 1} key={line} />
				))}
			</span>
		))}
	</SketchPage>
)

const CHECKLIST_LINES = 3

type ChecklistSketchProps = {
	title: string
}

const ChecklistSketch = ({ title }: ChecklistSketchProps) => (
	<SketchPage className="gap-1.75" title={title}>
		{Array.from({ length: CHECKLIST_LINES }, (_, line) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: a line is a fixed slot of the sketch
			<span className="flex items-center gap-1.25" key={line}>
				<span className="size-1.75 shrink-0 rounded-xs border border-sketch-mark" />
				<span className="flex-1">
					<SketchLine isShort={line === CHECKLIST_LINES - 1} />
				</span>
			</span>
		))}
	</SketchPage>
)

type TemplateSketchProps = {
	template: LibraryTemplate
}

const TemplateSketch = ({ template }: TemplateSketchProps) => {
	const { t } = useTranslation("common")
	const title = t(`library.templates.${template}.name`)

	switch (template) {
		case "brief":
			return (
				<SectionedSketch
					sections={[
						{ lines: 2 },
						{ heading: t("library.templates.brief.goal.heading"), lines: 1 },
						{
							heading: t("library.templates.brief.doneWhen.heading"),
							lines: 1,
						},
					]}
					title={title}
				/>
			)
		case "meetingNotes":
			return (
				<SectionedSketch
					sections={[
						{
							heading: t("library.templates.meetingNotes.decisions.heading"),
							lines: 2,
						},
						{
							heading: t("library.templates.meetingNotes.nextSteps.heading"),
							lines: 1,
						},
					]}
					title={title}
				/>
			)
		case "checklist":
			return <ChecklistSketch title={title} />
	}
}

type TemplateTileProps = {
	template: LibraryDocumentTemplate
}

const TemplateTile = ({ template }: TemplateTileProps) => {
	const { t } = useTranslation("common")

	return (
		<RadioPrimitive.Root
			className="group/tile flex w-39 flex-col gap-2.5 rounded-control text-start focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 focus-visible:outline-solid"
			data-slot="library-template-tile"
			value={template}
		>
			<span
				aria-hidden="true"
				className={cn(
					"pointer-events-none relative flex h-37.5 items-center justify-center overflow-hidden rounded-control ring-offset-2 ring-offset-popover group-data-checked/tile:ring-2 group-data-checked/tile:ring-primary",
					template === "blank"
						? "border-[1.5px] border-input border-dashed group-hover/tile:bg-foreground/3"
						: "border border-shell-border bg-(--bot-avatar-ground) group-hover/tile:border-input",
				)}
				data-slot="library-template-preview"
			>
				{template === "blank" ? (
					<Icons.Add className="size-5.5 text-primary" />
				) : (
					<TemplateSketch template={template} />
				)}
			</span>
			<span className="truncate font-medium text-compact text-foreground leading-4.5">
				{t(`library.templates.${template}.name`)}
			</span>
		</RadioPrimitive.Root>
	)
}

type TemplatePickerProps = {
	defaultTemplate: LibraryDocumentTemplate
	onCreate: (template: LibraryDocumentTemplate) => void
}

const TemplatePicker = ({ defaultTemplate, onCreate }: TemplatePickerProps) => {
	const { t } = useTranslation("common")
	const [template, setTemplate] = useState(defaultTemplate)

	return (
		<div className="flex flex-col gap-6">
			<RadioGroup
				aria-label={t("library.picker.templates")}
				className="flex w-auto gap-4"
				onValueChange={(value) => setTemplate(value as LibraryDocumentTemplate)}
				value={template}
			>
				{LIBRARY_DOCUMENT_TEMPLATES.map((each) => (
					<TemplateTile key={each} template={each} />
				))}
			</RadioGroup>
			<div className="flex items-center justify-between gap-4">
				<p className="min-w-0 text-compact text-muted-foreground leading-4.5">
					{t(`library.templates.${template}.description`)}
				</p>
				<div className="flex shrink-0 gap-2">
					<DialogClose
						render={
							<Button
								className={cn(
									PILL,
									"border-input bg-transparent hover:bg-foreground/5 dark:bg-transparent dark:hover:bg-foreground/5",
								)}
								variant="outline"
							/>
						}
					>
						{t("library.picker.cancel")}
					</DialogClose>
					<Button className={PILL} onClick={() => onCreate(template)}>
						{t("library.picker.create")}
					</Button>
				</div>
			</div>
		</div>
	)
}

type LibraryNewDocumentDialogProps = {
	open: boolean
	defaultTemplate?: LibraryDocumentTemplate
	spaceTint?: number | null
	onCreate: (template: LibraryDocumentTemplate) => void
	onDismiss: () => void
}

const LibraryNewDocumentDialog = ({
	open,
	defaultTemplate = "blank",
	spaceTint,
	onCreate,
	onDismiss,
}: LibraryNewDocumentDialogProps) => {
	const { t } = useTranslation("common")

	return (
		<Dialog
			onOpenChange={(isOpen) => {
				if (!isOpen) onDismiss()
			}}
			open={open}
		>
			<DialogSurface
				className="w-180 gap-5 dark:ring-foreground/8"
				data-hue={spaceTint ?? undefined}
				data-slot="library-new-document-dialog"
				style={spaceTint == null ? undefined : hueStyle(spaceTint)}
			>
				<div className="flex flex-col gap-1">
					<DialogTitle className="font-semibold text-lg text-popover-foreground leading-6 tracking-[-0.01em]">
						{t("library.newDocument")}
					</DialogTitle>
					<DialogDescription className="text-compact leading-4.5">
						{t("library.picker.subtitle")}
					</DialogDescription>
				</div>
				<TemplatePicker defaultTemplate={defaultTemplate} onCreate={onCreate} />
			</DialogSurface>
		</Dialog>
	)
}

export {
	LIBRARY_DOCUMENT_TEMPLATES,
	type LibraryDocumentTemplate,
	LibraryNewDocumentDialog,
	type LibraryNewDocumentDialogProps,
}
