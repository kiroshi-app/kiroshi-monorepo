import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import { Icons } from "@workspace/ui/components/icons"
import {
	ImageMenu,
	type ImageMenuActions,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

type GalleryTileLabel = "name" | "open"

type GalleryProps = {
	images: readonly AnswerImage[]
	caption?: string
	tileLabel?: GalleryTileLabel
	onOpen?: (index: number) => void
	imageMenu?: ImageMenuActions<number>
	className?: string
}

type GalleryTileProps = {
	image: AnswerImage
	index: number
	caption: string
	tileLabel: GalleryTileLabel
	hiddenCount: number
	onOpen?: (index: number) => void
	imageMenu?: ImageMenuActions<number>
	className: string
}

const TILE_COUNT = 5

type GridLayout = {
	grid: string
	tiles: readonly string[]
}

const GRID_LAYOUTS: readonly GridLayout[] = [
	{ grid: "grid-cols-1 grid-rows-1", tiles: ["rounded-e-control"] },
	{
		grid: "grid-cols-1 grid-rows-2",
		tiles: ["rounded-se-control", "rounded-ee-control"],
	},
	{
		grid: "grid-cols-2 grid-rows-2",
		tiles: ["col-span-2 rounded-se-control", "", "rounded-ee-control"],
	},
	{
		grid: "grid-cols-2 grid-rows-2",
		tiles: ["", "rounded-se-control", "", "rounded-ee-control"],
	},
]

const GalleryTile = ({
	image,
	index,
	caption,
	tileLabel,
	hiddenCount,
	onOpen,
	imageMenu,
	className,
}: GalleryTileProps) => {
	const { t } = useTranslation("chat")
	const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
	const name = accessibleNameOf(
		image,
		t("answerBlock.gallery.tile", { caption, position: index + 1 }),
	)
	const captionId = useId()
	const imageCaption = hiddenCount === 0 ? image.caption?.trim() : undefined
	const describedBy =
		imageCaption && imageCaption !== name ? captionId : undefined
	const imageDescribedBy = onOpen ? undefined : describedBy
	const openLabel =
		tileLabel === "open" ? t("attachments.open", { name }) : undefined
	const tileClass = cn(
		"relative min-h-0 min-w-0 overflow-hidden rounded-[4px]",
		className,
	)
	const content = (
		<>
			{brokenSrc === image.src ? (
				<span
					aria-label={name}
					aria-describedby={imageDescribedBy}
					className="grid size-full place-items-center bg-foreground/10"
					data-slot="gallery-broken"
					role="img"
				>
					<Icons.Image aria-hidden="true" className="size-5" />
				</span>
			) : (
				<img
					src={image.src}
					alt={openLabel ? "" : name}
					aria-describedby={imageDescribedBy}
					onError={() => setBrokenSrc(image.src)}
					className="image-outline size-full rounded-[inherit] object-cover"
				/>
			)}
			{imageCaption ? (
				<span
					id={captionId}
					aria-hidden="true"
					data-slot="gallery-image-caption"
					className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/65 to-transparent p-3 font-medium text-white text-xs leading-4"
				>
					<span className="line-clamp-2 wrap-break-word">{imageCaption}</span>
				</span>
			) : null}
			{hiddenCount > 0 ? (
				<span
					data-slot="gallery-more"
					className="absolute inset-0 grid place-items-center bg-black/55 text-xl leading-6 font-semibold text-white"
				>
					<span aria-hidden="true">+{hiddenCount}</span>
					<span className="sr-only">
						{t("answerBlock.gallery.more", { count: hiddenCount })}
					</span>
				</span>
			) : null}
		</>
	)

	const tile = onOpen ? (
		<button
			type="button"
			aria-label={openLabel}
			aria-describedby={describedBy}
			className={cn(tileClass, "outline-offset-2")}
			onClick={() => onOpen(index)}
		>
			{content}
		</button>
	) : (
		<div className={tileClass}>{content}</div>
	)

	if (!imageMenu) return tile

	return <ImageMenu {...imageMenu} item={index} name={name} trigger={tile} />
}

const Gallery = ({
	images,
	caption = "",
	tileLabel = "name",
	onOpen,
	imageMenu,
	className,
}: GalleryProps) => {
	const [lead, ...rest] = images
	const gridImages = rest.slice(0, TILE_COUNT - 1)
	const layout = GRID_LAYOUTS[gridImages.length - 1]
	const hiddenCount = Math.max(0, images.length - TILE_COUNT)

	if (!lead) return null

	return (
		<figure
			data-slot="gallery"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			<div className="flex h-75 gap-1.5">
				<GalleryTile
					image={lead}
					index={0}
					caption={caption}
					tileLabel={tileLabel}
					hiddenCount={0}
					onOpen={onOpen}
					imageMenu={imageMenu}
					className={cn(
						"flex-[1.4]",
						layout ? "rounded-s-control" : "rounded-control",
					)}
				/>
				{layout ? (
					<div className={cn("grid min-w-0 flex-1 gap-1.5", layout.grid)}>
						{gridImages.map((image, position) => (
							<GalleryTile
								// biome-ignore lint/suspicious/noArrayIndexKey: a tile is a fixed slot of the layout, two images may share a src
								key={position}
								image={image}
								index={position + 1}
								caption={caption}
								tileLabel={tileLabel}
								hiddenCount={position === TILE_COUNT - 2 ? hiddenCount : 0}
								onOpen={onOpen}
								imageMenu={imageMenu}
								className={layout.tiles[position] ?? ""}
							/>
						))}
					</div>
				) : null}
			</div>
			{caption ? (
				<figcaption className="text-compact leading-4.5 text-muted-foreground wrap-anywhere">
					{caption}
				</figcaption>
			) : null}
		</figure>
	)
}

export { Gallery, type GalleryProps }
