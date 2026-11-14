"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { HeaderIsland } from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import {
	ImageMenu,
	type ImageMenuActions,
	type ImageMenuProps,
} from "@workspace/ui/components/image-menu"
import {
	handlersFor,
	LIBRARY_BAR_DIVIDER,
	LIBRARY_BAR_ROUND,
	LIBRARY_ISLAND_CONTEXT,
	LIBRARY_ISLAND_TITLE,
	LIBRARY_OVERLAY_ISLAND,
	LibraryIslandButton,
	type LibraryItemActions,
	LibraryItemBarActions,
} from "@workspace/ui/components/library-item-menu"
import { useLibraryOverlayContainer } from "@workspace/ui/components/library-panel"
import { FLOATING_HEADER } from "@workspace/ui/components/screen-layout"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import {
	Dialog,
	DialogClose,
	DialogPortal,
	DialogTitle,
} from "@workspace/ui/components/ui/dialog"
import { Separator } from "@workspace/ui/components/ui/separator"
import { cn } from "@workspace/ui/lib/utils"

type LibraryLightboxImage = {
	id: string
	name: string
	src: string
	detail: string
}

const MIN_ZOOM = 0.25

const MAX_ZOOM = 4

const ZOOM_STEPS = [MIN_ZOOM, 0.5, 0.75, 1, 1.5, 2, 3, MAX_ZOOM]

const STEP = cn(
	LIBRARY_BAR_ROUND,
	LIBRARY_OVERLAY_ISLAND,
	"size-10 border border-selection-toolbar-border shadow-selection-toolbar hover:bg-header-island-control-hover dark:hover:bg-header-island-control-hover",
)

const STEP_OVER_STAGE =
	"absolute top-[calc(50%_+_--spacing(5))] flex -translate-y-1/2"

const ZOOMED_CLEAR_OF_CONTROLS = "px-10 pb-10"

const LIGHTBOX_SURFACE = "dark bg-lightbox-surface text-foreground"

const ZOOM_CONTROL = cn(LIBRARY_BAR_ROUND, "size-7 hover:bg-foreground/8")

const ZOOM_SLOT = "library-lightbox-zoom"

const isInZoomScroller = (target: EventTarget) =>
	target instanceof Element &&
	target.closest(`[data-slot=${ZOOM_SLOT}]`) !== null

const isBackdrop = (target: EventTarget) =>
	target instanceof HTMLElement && "lightboxBackdrop" in target.dataset

const SCROLLBAR_SIZE = 16

const scrollbarStart = (
	client: number,
	extent: number,
	isScrolling: boolean,
) => (isScrolling ? Math.min(client, extent - SCROLLBAR_SIZE) : client)

const isOnScrollbar = (event: PointerEvent) => {
	const { target } = event
	if (!(target instanceof HTMLElement)) return false
	const box = target.getBoundingClientRect()
	const x = event.clientX - box.left - target.clientLeft
	const y = event.clientY - box.top - target.clientTop
	const verticalBarStart = scrollbarStart(
		target.clientWidth,
		box.width - target.clientLeft,
		target.scrollHeight > target.clientHeight,
	)
	const horizontalBarStart = scrollbarStart(
		target.clientHeight,
		box.height - target.clientTop,
		target.scrollWidth > target.clientWidth,
	)
	return x < 0 || y < 0 || x >= verticalBarStart || y >= horizontalBarStart
}

type ZoomStageProps = {
	image: LibraryLightboxImage
	position: number
	count: number
	menu: Omit<ImageMenuProps<LibraryLightboxImage>, "trigger">
}

const ZoomStage = ({ image, position, count, menu }: ZoomStageProps) => {
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
				className={cn(
					"flex min-h-0 flex-1 overflow-auto rounded-md pt-14 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring",
					zoom !== null && ZOOMED_CLEAR_OF_CONTROLS,
				)}
				data-lightbox-backdrop
				data-slot={ZOOM_SLOT}
				tabIndex={zoom === null ? undefined : 0}
			>
				<ImageMenu
					{...menu}
					trigger={
						<img
							alt={image.name}
							className={cn(
								"m-auto rounded-[4px] shadow-[0_16px_40px_rgb(0_0_0/0.4)] ring-1 ring-foreground/8",
								zoom === null && "max-h-full max-w-full object-contain",
							)}
							draggable={false}
							onLoad={(event) =>
								setNaturalWidth(event.currentTarget.naturalWidth)
							}
							ref={imageRef}
							src={image.src}
							style={
								zoom === null
									? undefined
									: { width: naturalWidth * zoom, maxWidth: "none" }
							}
						/>
					}
				/>
			</div>
			<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-18 items-center justify-center">
				<div
					className="pointer-events-auto flex h-9 items-center gap-0.5 rounded-[18px] bg-[#1c1c1e] p-1 shadow-[0_8px_24px_rgb(0_0_0/0.4)] ring-1 ring-foreground/10"
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
					<Separator
						className={cn(LIBRARY_BAR_DIVIDER, "h-4.5")}
						orientation="vertical"
					/>
					<span className="px-2.5 text-compact text-muted-foreground leading-4 tabular-nums">
						{t("library.lightbox.position", { position, count })}
					</span>
				</div>
			</div>
		</>
	)
}

type LibraryLightboxProps = LibraryItemActions<LibraryLightboxImage> &
	Pick<
		ImageMenuActions<LibraryLightboxImage>,
		"onSaveToLibrary" | "onCopyImage"
	> & {
		image: LibraryLightboxImage | null
		position: number
		count: number
		onClose: () => void
		onPrevious: () => void
		onNext: () => void
		isSavingToLibrary?: boolean
	}

const LibraryLightbox = ({
	image,
	position,
	count,
	onClose,
	onPrevious,
	onNext,
	onSaveToLibrary,
	onCopyImage,
	isSavingToLibrary,
	...actions
}: LibraryLightboxProps) => {
	const { t } = useTranslation("common")
	const container = useLibraryOverlayContainer()
	const surfaceRef = useRef<HTMLDivElement>(null)
	const pressedRef = useRef<EventTarget | null>(null)
	const lastMenuToggleRef = useRef<Event | undefined>(undefined)
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const isFirst = position <= 1
	const isLast = position >= count
	const handlers = image ? handlersFor(actions, image) : {}
	const recordMenuToggle = (_open: boolean, details: { event?: Event }) => {
		lastMenuToggleRef.current = details.event
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
							LIGHTBOX_SURFACE,
							"inset-0 z-50 flex flex-col outline-none",
							container ? "absolute" : "fixed",
						)}
						data-lightbox-backdrop
						data-slot="library-lightbox"
						initialFocus={surfaceRef}
						onClick={(event) => {
							if (
								event.target === pressedRef.current &&
								isBackdrop(event.target)
							)
								onClose()
						}}
						onKeyDown={stepWithArrows}
						onPointerDown={(event) => {
							pressedRef.current =
								isConfirmingDelete ||
								event.nativeEvent === lastMenuToggleRef.current ||
								isOnScrollbar(event)
									? null
									: event.target
						}}
						ref={surfaceRef}
					>
						<div className={FLOATING_HEADER}>
							<HeaderIsland
								className={cn(LIBRARY_OVERLAY_ISLAND, LIBRARY_ISLAND_CONTEXT)}
							>
								<DialogClose
									render={
										<LibraryIslandButton
											aria-label={t("library.lightbox.back")}
										/>
									}
								>
									<Icons.Previous aria-hidden="true" />
								</DialogClose>
								<div className="flex h-8 min-w-0 flex-wrap content-start overflow-hidden">
									<DialogTitle
										className={LIBRARY_ISLAND_TITLE}
										title={image.name}
									>
										{image.name}
									</DialogTitle>
									<p
										className="whitespace-nowrap py-2 pe-2 text-muted-foreground text-sm leading-4 tabular-nums"
										data-slot="library-lightbox-meta"
									>
										{image.detail}
									</p>
								</div>
							</HeaderIsland>
							<LibraryItemBarActions
								actions={handlers}
								item={image}
								onClose={onClose}
								onConfirmingDeleteChange={setConfirmingDelete}
								onMenuOpenChange={recordMenuToggle}
								surface="lightbox"
							/>
						</div>
						<div
							className="relative flex min-h-0 flex-1 px-4 pb-4"
							data-lightbox-backdrop
						>
							<span className={cn(STEP_OVER_STAGE, "start-4")}>
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
							</span>
							<div
								className="flex h-full min-w-0 flex-1 flex-col"
								data-lightbox-backdrop
							>
								<ZoomStage
									count={count}
									image={image}
									key={image.id}
									menu={{
										...handlers,
										isSavingToLibrary,
										item: image,
										name: image.name,
										onConfirmingDeleteChange: setConfirmingDelete,
										onCopyImage,
										onOpenChange: recordMenuToggle,
										onSaveToLibrary,
										surface: "viewer",
									}}
									position={position}
								/>
							</div>
							<span className={cn(STEP_OVER_STAGE, "end-4")}>
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
							</span>
						</div>
					</DialogPrimitive.Popup>
				) : null}
			</DialogPortal>
		</Dialog>
	)
}

export {
	LIGHTBOX_SURFACE,
	LibraryLightbox,
	type LibraryLightboxImage,
	type LibraryLightboxProps,
}
