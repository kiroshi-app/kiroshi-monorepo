"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { useCallback, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Dialog,
	DialogClose,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from "@workspace/ui/components/ui/dialog"
import { cn } from "@workspace/ui/lib/utils"

type WhatsNewDialogVariant = "first-launch" | "from-about"

type WhatsNewDialogChannel = "stable" | "beta"

type WhatsNewDialogVisual = {
	src: string
	alt: string
}

type WhatsNewDialogProps = {
	version: string
	visual?: WhatsNewDialogVisual
	headline: string
	subline: string
	notes: string[]
	releaseNotesUrl: string
	variant: WhatsNewDialogVariant
	channel: WhatsNewDialogChannel
	open: boolean
	onOpenChange: (open: boolean) => void
	onOpenReleaseNotes: (url: string) => void
}

type NotesListProps = {
	legend: string
	notes: string[]
}

const COPY_OF = {
	"first-launch": "firstLaunch",
	"from-about": "fromAbout",
} as const satisfies Record<WhatsNewDialogVariant, string>

const SURFACE_CLASS =
	"fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-140 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl bg-popover text-popover-foreground text-sm shadow-xl outline-none ring-1 ring-foreground/5 duration-100 motion-reduce:duration-[0.01ms]! data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 dark:ring-foreground/10"

const BACKDROP_CLASS_OF = {
	"first-launch": undefined,
	"from-about": "bg-black/18",
} as const satisfies Record<WhatsNewDialogVariant, string | undefined>

const useOverflowOf = () => {
	const [overflows, setOverflows] = useState(false)

	const listRef = useCallback((list: HTMLUListElement | null) => {
		const box = list?.parentElement
		if (!list || !box) return

		const observer = new ResizeObserver(() =>
			setOverflows(list.offsetHeight > box.clientHeight),
		)
		observer.observe(list)
		observer.observe(box)

		return () => observer.disconnect()
	}, [])

	return { overflows, listRef }
}

const NotesList = ({ legend, notes }: NotesListProps) => {
	const legendId = useId()
	const { overflows, listRef } = useOverflowOf()

	return (
		<section className="flex flex-col gap-2 border-border border-t pt-4">
			<p className="font-medium text-muted-foreground text-xs" id={legendId}>
				{legend}
			</p>
			<div
				className="max-h-59 overflow-y-auto pe-3.5 focus-visible:outline-offset-2"
				data-slot="whats-new-notes"
				{...(overflows && {
					role: "region",
					"aria-labelledby": legendId,
					tabIndex: 0,
				})}
			>
				<ul
					aria-labelledby={overflows ? undefined : legendId}
					className="flex flex-col gap-1.5"
					ref={listRef}
				>
					{notes.map((note, index) => (
						<li
							className="flex gap-2.5 text-foreground text-sm"
							// biome-ignore lint/suspicious/noArrayIndexKey: notes never reorder, and two notes may read the same
							key={index}
						>
							<span
								aria-hidden="true"
								className="flex h-5 w-1.5 shrink-0 items-center justify-center"
							>
								<span className="size-1.25 rounded-full bg-muted-foreground" />
							</span>
							<span className="min-w-0 wrap-break-word">{note}</span>
						</li>
					))}
				</ul>
				{overflows && (
					<div
						aria-hidden="true"
						className="pointer-events-none sticky bottom-0 h-10 bg-linear-to-b from-transparent to-popover"
					/>
				)}
			</div>
		</section>
	)
}

const WhatsNewDialog = ({
	version,
	visual,
	headline,
	subline,
	notes,
	releaseNotesUrl,
	variant,
	channel,
	open,
	onOpenChange,
	onOpenReleaseNotes,
}: WhatsNewDialogProps) => {
	const { t } = useTranslation("common")
	const copy = COPY_OF[variant]
	const surfaceRef = useRef<HTMLDivElement>(null)

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogPortal>
				<DialogOverlay className={BACKDROP_CLASS_OF[variant]} />
				<DialogPrimitive.Popup
					className={SURFACE_CLASS}
					data-slot="dialog-content"
					initialFocus={surfaceRef}
					ref={surfaceRef}
				>
					<DialogClose
						aria-label={t("dialog.close")}
						data-slot="whats-new-close"
						render={
							<Button
								className={cn(
									"absolute end-3 top-3 rounded-md",
									visual && "bg-popover/70 dark:bg-popover/60",
								)}
								size="icon-sm"
								variant="ghost"
							/>
						}
					>
						<Icons.Close aria-hidden="true" className="size-4" />
					</DialogClose>
					{visual && (
						<div className="h-41 shrink-0 overflow-hidden border-border border-b bg-primary/12 dark:bg-primary/14">
							<img
								alt={visual.alt}
								className="size-full object-cover"
								src={visual.src}
							/>
						</div>
					)}
					<div className="flex flex-col gap-4 p-6">
						<div className="flex flex-col gap-1.5 pe-8">
							<div className="flex items-center gap-2">
								<p className="text-muted-foreground text-xs tabular-nums">
									{t(`whatsNew.${copy}.eyebrow`, { version })}
								</p>
								{channel === "beta" && (
									<span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 font-medium text-foreground text-xs">
										{t("whatsNew.beta")}
									</span>
								)}
							</div>
							<DialogTitle className="font-semibold text-foreground text-lg leading-6 tracking-[-0.01em]">
								{headline}
							</DialogTitle>
							<DialogDescription>{subline}</DialogDescription>
						</div>
						{notes.length > 0 && (
							<NotesList legend={t(`whatsNew.${copy}.legend`)} notes={notes} />
						)}
						<div className="flex items-center justify-between pt-1">
							<Button
								className="-ms-3 gap-1 rounded-lg ps-3 pe-2 text-muted-foreground"
								onClick={() => onOpenReleaseNotes(releaseNotesUrl)}
								variant="ghost"
							>
								{t("whatsNew.releaseNotes")}
								<Icons.ExternalLink aria-hidden="true" className="size-4" />
							</Button>
							<DialogClose render={<Button className="rounded-lg px-3.5" />}>
								{t(`whatsNew.${copy}.dismiss`)}
							</DialogClose>
						</div>
					</div>
				</DialogPrimitive.Popup>
			</DialogPortal>
		</Dialog>
	)
}

export { WhatsNewDialog, type WhatsNewDialogProps, type WhatsNewDialogVisual }
