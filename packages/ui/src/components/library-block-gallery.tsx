"use client"

import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { accessibleNameOf } from "@workspace/ui/components/answer-blocks/answer-image"
import {
	Gallery,
	type GalleryImageStatus,
	GallerySurface,
	TILE_COUNT,
} from "@workspace/ui/components/answer-blocks/gallery"
import { Icons } from "@workspace/ui/components/icons"
import {
	type BlockRecord,
	galleryItemsOf,
	movedTo,
	type SourceEdit,
	withCaption,
	withGalleryItems,
} from "@workspace/ui/components/library-document-blocks"
import { cn } from "@workspace/ui/lib/utils"

type LibraryGalleryImage = {
	src: string
	alt: string
	caption?: string
}

type ResolveImage = (src: string) => Promise<string>

type LibraryGalleryEditorProps = {
	source: string
	onEdit: SourceEdit
	onRemove: () => void
	onAddImages?: () => Promise<LibraryGalleryImage[]>
	resolveImage?: ResolveImage
}

type ShownImage = {
	src: string
	status?: GalleryImageStatus
}

type TileDrag = {
	from: number
	to: number
	x: number
	y: number
}

type TileFocus = {
	index: number
}

const DRAG_THRESHOLD = 4

const TILE_SLOT = "library-gallery-tile"

const DROP_SLOT = "library-gallery-slot"

const STEPS: Readonly<Record<string, number>> = {
	ArrowLeft: -1,
	ArrowUp: -1,
	ArrowRight: 1,
	ArrowDown: 1,
}

const recordOf = ({ src, alt, caption = "" }: LibraryGalleryImage) =>
	withCaption({ image: src, alt }, caption)

const editItems =
	(change: (items: BlockRecord[]) => BlockRecord[]) => (source: string) =>
		withGalleryItems(source, change(galleryItemsOf(source)))

const useShownImages = (
	sources: readonly string[],
	resolveImage: ResolveImage | undefined,
) => {
	const [settled, setSettled] = useState<ReadonlyMap<string, ShownImage>>(
		() => new Map(),
	)
	const requested = useRef(new Set<string>())
	const present = useRef(new Set<string>())

	useEffect(() => {
		present.current = new Set(sources)
		const leave = () => {
			present.current = new Set()
		}
		if (!resolveImage) return leave
		const settle = (source: string, shown: ShownImage) => {
			if (!present.current.has(source)) {
				requested.current.delete(source)
				return
			}
			setSettled((current) => new Map(current).set(source, shown))
		}
		for (const source of present.current) {
			if (requested.current.has(source)) continue
			requested.current.add(source)
			resolveImage(source).then(
				(src) => settle(source, { src }),
				() => settle(source, { src: source, status: "broken" }),
			)
		}
		return leave
	})

	return (source: string): ShownImage =>
		resolveImage
			? (settled.get(source) ?? { src: source, status: "resolving" })
			: { src: source }
}

const LibraryGalleryEditor = ({
	source,
	onEdit,
	onRemove,
	onAddImages,
	resolveImage,
}: LibraryGalleryEditorProps) => {
	const { t } = useTranslation(["common", "chat"])
	const hintId = useId()
	const frame = useRef<HTMLDivElement>(null)
	const [drag, setDrag] = useState<TileDrag>()
	const [tileFocus, setTileFocus] = useState<TileFocus>()
	const [hasAddFailed, setAddFailed] = useState(false)
	const items = galleryItemsOf(source)
	const count = items.length
	const shown = drag ? movedTo(items, drag.from, drag.to) : items
	const shownImageOf = useShownImages(
		items.map(({ image }) => image),
		resolveImage,
	)

	useLayoutEffect(() => {
		if (!tileFocus) return
		frame.current
			?.querySelectorAll<HTMLElement>(`[data-slot="${TILE_SLOT}"]`)
			[tileFocus.index]?.focus()
	}, [tileFocus])

	const move = (from: number, to: number) => {
		if (to < 0 || to >= count || to === from) return
		onEdit(editItems((current) => movedTo(current, from, to)))
		setTileFocus({ index: to })
	}

	const remove = (index: number) => {
		if (count === 1) {
			onRemove()
			return
		}
		onEdit(editItems((current) => current.filter((_, at) => at !== index)))
		setTileFocus({ index: Math.min(index, count - 2) })
	}

	const caption = (index: number, value: string) =>
		onEdit(
			editItems((current) =>
				current.map((item, at) =>
					at === index ? withCaption(item, value) : item,
				),
			),
		)

	const add = () => {
		if (!onAddImages) return
		setAddFailed(false)
		onAddImages().then(
			(images) => {
				if (images.length > 0)
					onEdit(editItems((current) => [...current, ...images.map(recordOf)]))
			},
			() => setAddFailed(true),
		)
	}

	const slotAt = (x: number, y: number) => {
		const tiles = [
			...(frame.current?.querySelectorAll(
				`[data-slot="${TILE_SLOT}"], [data-slot="${DROP_SLOT}"]`,
			) ?? []),
		]
		let nearest = 0
		let shortest = Number.POSITIVE_INFINITY
		tiles.forEach((tile, index) => {
			const { left, top, width, height } = tile.getBoundingClientRect()
			const distance = Math.hypot(left + width / 2 - x, top + height / 2 - y)
			if (distance < shortest) {
				shortest = distance
				nearest = index
			}
		})
		return nearest
	}

	const startDrag = (from: number) => (event: PointerEvent<HTMLElement>) => {
		if (event.button !== 0) return
		const start = { x: event.clientX, y: event.clientY, isMoving: false }
		const follow = (moved: globalThis.PointerEvent) => {
			if (
				!start.isMoving &&
				Math.hypot(moved.clientX - start.x, moved.clientY - start.y) <
					DRAG_THRESHOLD
			)
				return
			start.isMoving = true
			setDrag({
				from,
				to: slotAt(moved.clientX, moved.clientY),
				x: moved.clientX,
				y: moved.clientY,
			})
		}
		const finish = (end: globalThis.PointerEvent) => {
			window.removeEventListener("pointermove", follow)
			window.removeEventListener("pointerup", finish)
			window.removeEventListener("pointercancel", finish)
			setDrag(undefined)
			if (start.isMoving && end.type === "pointerup")
				move(from, slotAt(end.clientX, end.clientY))
		}
		window.addEventListener("pointermove", follow)
		window.addEventListener("pointerup", finish)
		window.addEventListener("pointercancel", finish)
	}

	const moveByKey = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
		const step = STEPS[event.key]
		if (!step || event.altKey || event.metaKey || event.ctrlKey) return
		event.preventDefault()
		event.stopPropagation()
		move(index, index + step)
	}

	const tileSlot = (index: number) => {
		if (drag?.to === index)
			return (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 rounded-[inherit] bg-card"
					data-slot={DROP_SLOT}
				>
					<span className="absolute inset-0 rounded-[inherit] border-2 border-primary border-dashed bg-primary/6" />
				</span>
			)
		const position = index + 1
		return (
			<>
				<button
					aria-describedby={hintId}
					aria-label={t("library.editor.blocks.gallery.tile", {
						position,
						count,
					})}
					className="absolute inset-0 cursor-grab touch-none rounded-[inherit] -outline-offset-2 active:cursor-grabbing"
					data-slot={TILE_SLOT}
					onKeyDown={moveByKey(index)}
					onPointerDown={startDrag(index)}
					type="button"
				/>
				<button
					aria-label={t("library.editor.blocks.gallery.remove", { position })}
					className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-black/60 text-white outline-offset-2 hover:bg-black/72 active:bg-black/80"
					data-slot="library-gallery-remove"
					onClick={() => remove(index)}
					type="button"
				>
					<Icons.Close aria-hidden="true" className="size-3" />
				</button>
				<input
					aria-label={t("library.editor.blocks.gallery.caption", { position })}
					className="absolute inset-x-2 bottom-2 min-w-0 rounded-sm bg-card/92 p-1.5 font-medium text-foreground text-xs leading-4 outline-offset-2 placeholder:text-placeholder-foreground"
					data-slot="library-document-block-field"
					onChange={(event) => caption(index, event.target.value)}
					placeholder={t("library.editor.blocks.gallery.captionPlaceholder")}
					type="text"
					value={shown[index]?.caption ?? ""}
				/>
			</>
		)
	}

	const lifted = drag ? items[drag.from] : undefined
	const liftedImage = lifted ? shownImageOf(lifted.image) : undefined

	return (
		<div
			className={cn("flex flex-col gap-2", drag && "select-none")}
			data-slot="library-gallery-editor"
			ref={frame}
		>
			<div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
				{onAddImages ? (
					<button
						className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-foreground/6 p-1.5 font-medium text-compact text-foreground leading-4 outline-offset-2 hover:bg-foreground/10 active:bg-foreground/14"
						data-slot="library-gallery-add"
						onClick={add}
						type="button"
					>
						<Icons.Add aria-hidden="true" className="size-3.5" />
						{t("library.editor.blocks.gallery.add")}
					</button>
				) : null}
				<p
					aria-live="polite"
					className={cn(
						"min-w-0 text-xs leading-4",
						hasAddFailed ? "text-destructive" : "text-muted-foreground",
					)}
					id={hintId}
				>
					{hasAddFailed
						? t("library.editor.blocks.gallery.addFailed")
						: t("library.editor.blocks.gallery.hint")}
				</p>
			</div>
			{count > 0 ? (
				<div
					className="flex flex-col gap-1.5 rounded-[calc(var(--radius-control)+4px)] ring-2 ring-primary ring-offset-4 ring-offset-card"
					data-slot="library-gallery-grid"
				>
					<Gallery
						images={shown
							.slice(0, TILE_COUNT)
							.map(({ image, alt }) => ({ ...shownImageOf(image), alt }))}
						tileSlot={tileSlot}
					/>
					{count > TILE_COUNT ? (
						<div
							className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5"
							data-slot="library-gallery-overflow"
						>
							{shown.slice(TILE_COUNT).map(({ image, alt }, at) => {
								const { src, status } = shownImageOf(image)
								return (
									<span
										className="relative h-28 min-w-0 overflow-hidden rounded-[4px]"
										// biome-ignore lint/suspicious/noArrayIndexKey: a tile is the slot at its position, two images may share a src
										key={at}
									>
										{status ? (
											<GallerySurface
												name={accessibleNameOf(
													{ src, alt },
													t("chat:answerBlock.gallery.tile", {
														caption: "",
														position: TILE_COUNT + at + 1,
													}),
												)}
												status={status}
											/>
										) : (
											<img
												alt={alt}
												className="image-outline size-full object-cover"
												src={src}
											/>
										)}
										{tileSlot(TILE_COUNT + at)}
									</span>
								)
							})}
						</div>
					) : null}
				</div>
			) : null}
			{drag && liftedImage ? (
				<span
					aria-hidden="true"
					className="pointer-events-none fixed z-50 h-[170px] w-60 -rotate-2 rounded-xl bg-muted bg-center bg-cover shadow-lifted-tile"
					data-slot="library-gallery-lifted"
					style={{
						left: drag.x - 120,
						top: drag.y - 85,
						backgroundImage: liftedImage.status
							? undefined
							: `url("${resolveImage ? liftedImage.src : encodeURI(liftedImage.src)}")`,
					}}
				/>
			) : null}
		</div>
	)
}

export { LibraryGalleryEditor, type LibraryGalleryImage }
