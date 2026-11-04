import type { ReactNode } from "react"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import {
	type ImageMenuActions,
	PressableImageMenu,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

type IllustratedListItem = {
	id: string
	title: string
	image: AnswerImage
	badge?: string
	description?: ReactNode
	meta?: string
}

type IllustratedListProps = {
	items: readonly IllustratedListItem[]
	imageMenu?: ImageMenuActions<number>
	className?: string
}

const IllustratedList = ({
	items,
	imageMenu,
	className,
}: IllustratedListProps) => (
	<ol
		data-slot="illustrated-list"
		className={cn(
			"flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-shell-divider bg-card-raised",
			className,
		)}
	>
		{items.map((item, index) => (
			<li
				key={item.id}
				className="flex gap-3.5 p-4 not-last:border-b not-last:border-shell-divider"
			>
				<PressableImageMenu
					{...imageMenu}
					className="flex shrink-0 rounded-lg outline-offset-2"
					item={index}
					name={accessibleNameOf(item.image, item.title)}
					picture={
						<img
							src={item.image.src}
							alt={item.image.alt ?? ""}
							className="h-18 w-24 shrink-0 rounded-lg object-cover"
						/>
					}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<p className="min-w-0 text-reading font-semibold wrap-anywhere">
							<span aria-hidden="true">{`${index + 1}. `}</span>
							{item.title}
						</p>
						{item.badge ? (
							<span className="max-w-full truncate rounded-full bg-primary-strong/12 p-1.5 text-xs font-medium text-primary-strong">
								{item.badge}
							</span>
						) : null}
					</div>
					{item.description ? (
						<p className="text-sm leading-5.25 text-muted-foreground wrap-anywhere [&_strong]:font-semibold">
							{item.description}
						</p>
					) : null}
					{item.meta ? (
						<p className="text-compact leading-4.5 text-muted-foreground wrap-anywhere">
							{item.meta}
						</p>
					) : null}
				</div>
			</li>
		))}
	</ol>
)

export { IllustratedList, type IllustratedListItem, type IllustratedListProps }
