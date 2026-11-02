import { useTranslation } from "react-i18next"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import { cn } from "@workspace/ui/lib/utils"

type GalleryProps = {
	images: readonly AnswerImage[]
	caption: string
	onOpen?: (index: number) => void
	className?: string
}

type GalleryTileProps = {
	image: AnswerImage
	index: number
	caption: string
	hiddenCount: number
	onOpen?: (index: number) => void
	className: string
}

const TILE_COUNT = 5

const GRID_CORNERS = [
	"",
	"rounded-se-control",
	"",
	"rounded-ee-control",
] as const

const GalleryTile = ({
	image,
	index,
	caption,
	hiddenCount,
	onOpen,
	className,
}: GalleryTileProps) => {
	const { t } = useTranslation("chat")
	const tileClass = cn(
		"relative min-h-0 min-w-0 overflow-hidden rounded-[4px]",
		className,
	)
	const content = (
		<>
			<img
				src={image.src}
				alt={accessibleNameOf(image, caption)}
				className="size-full object-cover"
			/>
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

	if (!onOpen) return <div className={tileClass}>{content}</div>

	return (
		<button
			type="button"
			className={cn(tileClass, "outline-offset-2")}
			onClick={() => onOpen(index)}
		>
			{content}
		</button>
	)
}

const Gallery = ({ images, caption, onOpen, className }: GalleryProps) => {
	const [lead, ...rest] = images
	const gridImages = rest.slice(0, TILE_COUNT - 1)
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
					hiddenCount={0}
					onOpen={onOpen}
					className={cn(
						"flex-[1.4]",
						gridImages.length > 0 ? "rounded-s-control" : "rounded-control",
					)}
				/>
				{gridImages.length > 0 ? (
					<div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5">
						{gridImages.map((image, position) => (
							<GalleryTile
								key={image.src}
								image={image}
								index={position + 1}
								caption={caption}
								hiddenCount={position === TILE_COUNT - 2 ? hiddenCount : 0}
								onOpen={onOpen}
								className={GRID_CORNERS[position] ?? ""}
							/>
						))}
					</div>
				) : null}
			</div>
			<figcaption className="text-compact leading-4.5 text-muted-foreground wrap-anywhere">
				{caption}
			</figcaption>
		</figure>
	)
}

export { Gallery, type GalleryProps }
