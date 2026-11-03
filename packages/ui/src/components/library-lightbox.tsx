"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { IconSwap } from "@workspace/ui/components/icon-swap"
import { Icons } from "@workspace/ui/components/icons"
import { useLibraryOverlayContainer } from "@workspace/ui/components/library-panel"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import {
	Dialog,
	DialogClose,
	DialogPortal,
	DialogTitle,
} from "@workspace/ui/components/ui/dialog"
import { Separator } from "@workspace/ui/components/ui/separator"
import { COPIED_RESET_MS } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

type CopyOutcome = "idle" | "copied" | "failed"

const COPY_ANNOUNCEMENT_KEY = {
	idle: null,
	copied: "library.lightbox.copied",
	failed: "library.lightbox.copyFailed",
} as const satisfies Record<CopyOutcome, string | null>

type LibraryLightboxImage = {
	id: string
	name: string
	src: string
	detail: string
}

const MIN_ZOOM = 0.25

const MAX_ZOOM = 4

const ZOOM_STEPS = [MIN_ZOOM, 0.5, 0.75, 1, 1.5, 2, 3, MAX_ZOOM]

const ROUND = "rounded-full text-foreground transition-none"

const ACTION = cn(ROUND, "size-8 bg-foreground/8 hover:bg-foreground/14")

const STEP = cn(ROUND, "size-10 bg-foreground/10 hover:bg-foreground/16")

const ZOOM_CONTROL = cn(ROUND, "size-7 hover:bg-foreground/8")

const DIVIDER = "bg-foreground/12"

const ZOOM_SLOT = "library-lightbox-zoom"

const isInZoomScroller = (target: EventTarget) =>
	target instanceof Element &&
	target.closest(`[data-slot=${ZOOM_SLOT}]`) !== null

type ZoomStageProps = {
	image: LibraryLightboxImage
	position: number
	count: number
}

const ZoomStage = ({ image, position, count }: ZoomStageProps) => {
	const { t } = useTranslation("common")
	const imageRef = useRef<HTMLImageElement>(null)
	const [zoom, setZoom] = useState<number | null>(null)
	const [naturalWidth, setNaturalWidth] = useState(0)

	const currentZoom = () => {
		if (zoom !== null) return zoom
		const shown = imageRef.current
		if (!shown?.naturalWidth) return 1
		return shown.clientWidth / shown.naturalWidth
	}

	const zoomOut = () => {
		const from = currentZoom()
		setZoom(ZOOM_STEPS.findLast((step) => step < from) ?? MIN_ZOOM)
	}

	const zoomIn = () => {
		const from = currentZoom()
		setZoom(ZOOM_STEPS.find((step) => step > from) ?? MAX_ZOOM)
	}

	const percent = zoom === null ? null : Math.round(zoom * 100)

	return (
		<>
			<div
				className="flex min-h-0 flex-1 overflow-auto rounded-md focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
				data-slot={ZOOM_SLOT}
				tabIndex={zoom === null ? undefined : 0}
			>
				<img
					alt={image.name}
					className={cn(
						"m-auto rounded-md shadow-[0_16px_40px_rgb(0_0_0/0.4)] ring-1 ring-foreground/8",
						zoom === null && "max-h-full max-w-full object-contain",
					)}
					draggable={false}
					onLoad={(event) => setNaturalWidth(event.currentTarget.naturalWidth)}
					ref={imageRef}
					src={image.src}
					style={
						zoom === null
							? undefined
							: { width: naturalWidth * zoom, maxWidth: "none" }
					}
				/>
			</div>
			<div className="absolute inset-x-0 bottom-0 flex h-18 items-center justify-center">
				<div
					className="flex h-9 items-center gap-0.5 rounded-[18px] bg-[#1c1c1e] p-1 shadow-[0_8px_24px_rgb(0_0_0/0.4)] ring-1 ring-foreground/10"
					data-slot="library-lightbox-zoom-bar"
				>
					<TooltipButton
						aria-label={t("library.lightbox.zoomOut")}
						className={ZOOM_CONTROL}
						disabled={zoom === MIN_ZOOM}
						onClick={zoomOut}
						size="icon-sm"
						tooltip={t("library.lightbox.zoomOut")}
						variant="ghost"
					>
						<Icons.Minimize aria-hidden="true" />
					</TooltipButton>
					<TooltipButton
						aria-label={
							percent === null
								? t("library.lightbox.fitToStage")
								: t("library.lightbox.zoomThenFit", { percent })
						}
						className="h-7 w-13 rounded-full px-0 font-medium text-compact text-foreground leading-4 tabular-nums transition-none hover:bg-foreground/8"
						onClick={() => setZoom(null)}
						tooltip={t("library.lightbox.fitToStage")}
						variant="ghost"
					>
						{percent === null
							? t("library.lightbox.fit")
							: t("library.lightbox.zoom", { percent })}
					</TooltipButton>
					<TooltipButton
						aria-label={t("library.lightbox.zoomIn")}
						className={ZOOM_CONTROL}
						disabled={zoom === MAX_ZOOM}
						onClick={zoomIn}
						size="icon-sm"
						tooltip={t("library.lightbox.zoomIn")}
						variant="ghost"
					>
						<Icons.Add aria-hidden="true" />
					</TooltipButton>
					<Separator className={cn(DIVIDER, "h-4.5")} orientation="vertical" />
					<span className="px-2.5 text-compact text-muted-foreground leading-4 tabular-nums">
						{t("library.lightbox.position", { position, count })}
					</span>
				</div>
			</div>
		</>
	)
}

type LibraryLightboxProps = {
	image: LibraryLightboxImage | null
	position: number
	count: number
	onClose: () => void
	onPrevious: () => void
	onNext: () => void
	onDownload: (image: LibraryLightboxImage) => void
	onCopy: (image: LibraryLightboxImage) => void | Promise<void>
	onMore?: (image: LibraryLightboxImage) => void
}

const LibraryLightbox = ({
	image,
	position,
	count,
	onClose,
	onPrevious,
	onNext,
	onDownload,
	onCopy,
	onMore,
}: LibraryLightboxProps) => {
	const { t } = useTranslation("common")
	const container = useLibraryOverlayContainer()
	const surfaceRef = useRef<HTMLDivElement>(null)
	const isFirst = position <= 1
	const isLast = position >= count
	const [copyOutcome, setCopyOutcome] = useState<CopyOutcome>("idle")
	const announcementKey = COPY_ANNOUNCEMENT_KEY[copyOutcome]

	useEffect(() => {
		if (copyOutcome === "idle") return
		const timer = window.setTimeout(
			() => setCopyOutcome("idle"),
			COPIED_RESET_MS,
		)
		return () => window.clearTimeout(timer)
	}, [copyOutcome])

	const copyImage = async (shown: LibraryLightboxImage) => {
		try {
			await onCopy(shown)
			setCopyOutcome("copied")
		} catch {
			setCopyOutcome("failed")
		}
	}

	const stepWithArrows = (event: KeyboardEvent) => {
		if (isInZoomScroller(event.target)) return
		if (event.key === "ArrowLeft" && !isFirst) onPrevious()
		if (event.key === "ArrowRight" && !isLast) onNext()
	}

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
			open={image !== null}
		>
			<DialogPortal container={container ?? undefined}>
				{image ? (
					<DialogPrimitive.Popup
						className={cn(
							"dark inset-0 z-50 flex flex-col bg-[#080809]/93 text-foreground outline-none",
							container ? "absolute" : "fixed",
						)}
						data-slot="library-lightbox"
						initialFocus={surfaceRef}
						onKeyDown={stepWithArrows}
						ref={surfaceRef}
					>
						<div className="flex h-14 shrink-0 items-center justify-between gap-4 ps-5 pe-3">
							<div className="flex min-w-0 items-baseline gap-2.5">
								<DialogTitle
									className="truncate font-medium text-foreground text-sm leading-4.5"
									title={image.name}
								>
									{image.name}
								</DialogTitle>
								<p className="shrink-0 text-compact text-muted-foreground leading-4.5 tabular-nums">
									{image.detail}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<TooltipButton
									aria-label={t("library.lightbox.download")}
									className={ACTION}
									onClick={() => onDownload(image)}
									size="icon"
									tooltip={t("library.lightbox.download")}
									tooltipSide="bottom"
									variant="ghost"
								>
									<Icons.Download aria-hidden="true" />
								</TooltipButton>
								<TooltipButton
									aria-label={t("library.lightbox.copy")}
									className={ACTION}
									onClick={() => copyImage(image)}
									size="icon"
									tooltip={t("library.lightbox.copy")}
									tooltipSide="bottom"
									variant="ghost"
								>
									<IconSwap
										icon={<Icons.Copy aria-hidden="true" />}
										isSwapped={copyOutcome === "copied"}
										swappedIcon={<Icons.Check aria-hidden="true" />}
									/>
								</TooltipButton>
								{onMore ? (
									<TooltipButton
										aria-label={t("library.lightbox.openFolder")}
										className={ACTION}
										onClick={() => onMore(image)}
										size="icon"
										tooltip={t("library.lightbox.openFolder")}
										tooltipSide="bottom"
										variant="ghost"
									>
										<Icons.Folder aria-hidden="true" />
									</TooltipButton>
								) : null}
								<Separator
									className={cn(DIVIDER, "h-5")}
									orientation="vertical"
								/>
								<DialogClose
									render={
										<TooltipButton
											aria-label={t("library.lightbox.close")}
											className={cn(ROUND, "size-8 hover:bg-foreground/8")}
											size="icon"
											tooltip={t("library.lightbox.close")}
											tooltipSide="bottom"
											variant="ghost"
										/>
									}
								>
									<Icons.Close aria-hidden="true" />
								</DialogClose>
							</div>
						</div>
						<div className="relative flex min-h-0 flex-1 items-center gap-5 px-5 pb-18">
							<TooltipButton
								aria-label={t("library.lightbox.previous")}
								className={STEP}
								disabled={isFirst}
								onClick={onPrevious}
								size="icon-lg"
								tooltip={t("library.lightbox.previous")}
								variant="ghost"
							>
								<Icons.Previous aria-hidden="true" className="size-4.5" />
							</TooltipButton>
							<div className="flex h-full min-w-0 flex-1 flex-col">
								<ZoomStage
									count={count}
									image={image}
									key={image.id}
									position={position}
								/>
							</div>
							<TooltipButton
								aria-label={t("library.lightbox.next")}
								className={STEP}
								disabled={isLast}
								onClick={onNext}
								size="icon-lg"
								tooltip={t("library.lightbox.next")}
								variant="ghost"
							>
								<Icons.Next aria-hidden="true" className="size-4.5" />
							</TooltipButton>
						</div>
						<span aria-live="polite" className="sr-only">
							{announcementKey ? t(announcementKey) : ""}
						</span>
					</DialogPrimitive.Popup>
				) : null}
			</DialogPortal>
		</Dialog>
	)
}

export { LibraryLightbox, type LibraryLightboxImage, type LibraryLightboxProps }
