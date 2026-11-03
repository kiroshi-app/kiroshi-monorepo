import { useTranslation } from "react-i18next"

import { FillIcons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type MapCardPlace = {
	id: string
	name: string
	latitude: number
	longitude: number
}

type MapCardProps = {
	title: string
	places: MapCardPlace[]
	subtitle?: string
	area?: string
	link?: string
	className?: string
}

type MapPoint = {
	x: number
	y: number
}

const PLOT_SPAN = 60

const centreOf = (values: number[]) =>
	(Math.min(...values) + Math.max(...values)) / 2

const spanOf = (values: number[]) => Math.max(...values) - Math.min(...values)

const projectPlaces = (places: MapCardPlace[]): MapPoint[] => {
	const latitudes = places.map(({ latitude }) => latitude)
	const eastwardScale = Math.cos((centreOf(latitudes) * Math.PI) / 180)
	const xs = places.map(({ longitude }) => longitude * eastwardScale)
	const ys = latitudes.map((latitude) => -latitude)
	const span = Math.max(spanOf(xs), spanOf(ys))
	const percentOf = (value: number, centre: number) =>
		span === 0 ? 50 : 50 + ((value - centre) / span) * PLOT_SPAN

	return xs.map((x, index) => ({
		x: percentOf(x, centreOf(xs)),
		y: percentOf(ys[index], centreOf(ys)),
	}))
}

const MapCard = ({
	title,
	places,
	subtitle,
	area,
	link,
	className,
}: MapCardProps) => {
	const { t } = useTranslation("chat")
	const points = projectPlaces(places)
	const lastIndex = places.length - 1
	const hasRoute = places.length > 1

	return (
		<article
			aria-label={title}
			data-slot="map-card"
			className={cn(
				"flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-shell-divider bg-card-raised",
				className,
			)}
		>
			<div className="relative h-75 w-full overflow-hidden bg-background">
				{hasRoute ? (
					<svg
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 size-full text-primary-strong"
					>
						{points.slice(1).map((point, index) => (
							<line
								key={places[index].id}
								stroke="currentColor"
								strokeDasharray="2 7"
								strokeLinecap="round"
								strokeWidth={3}
								x1={`${points[index].x}%`}
								x2={`${point.x}%`}
								y1={`${points[index].y}%`}
								y2={`${point.y}%`}
							/>
						))}
					</svg>
				) : null}
				<ol>
					{places.map((place, index) => {
						const { x, y } = points[index]
						const isDestination = index === lastIndex
						const Glyph =
							index === 0 && hasRoute ? FillIcons.Navigation : FillIcons.MapPin

						return (
							<li
								key={place.id}
								className={cn(
									"absolute flex w-max -translate-1/2 items-center gap-1.5 rounded-full p-1.5 text-xs font-semibold",
									isDestination
										? "bg-primary-strong text-primary-foreground"
										: "bg-foreground text-on-foreground",
								)}
								style={{
									left: `${x}%`,
									top: `${y}%`,
									maxWidth: `calc(2 * min(${x}%, ${100 - x}%))`,
								}}
							>
								<span className="grid size-4 shrink-0 place-items-center rounded-full bg-on-foreground text-foreground">
									<Glyph aria-hidden="true" className="size-2.5" />
								</span>
								<span className="min-w-0 truncate">{place.name}</span>
							</li>
						)
					})}
				</ol>
				{area ? (
					<p className="absolute start-5 bottom-4 max-w-[calc(100%-2.5rem)] truncate text-xs tracking-[0.06em] text-muted-foreground uppercase">
						{area}
					</p>
				) : null}
			</div>
			<div className="flex items-center gap-3 border-t border-shell-border p-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<p className="truncate text-sm font-semibold">{title}</p>
					{subtitle ? (
						<p className="truncate text-xs text-muted-foreground">{subtitle}</p>
					) : null}
				</div>
				{link ? (
					<a
						href={link}
						target="_blank"
						rel="noreferrer noopener"
						className="shrink-0 rounded-md border border-foreground/12 p-2 text-compact leading-4.5 font-medium outline-offset-2 hover:bg-foreground/8 active:bg-foreground/12"
					>
						{t("answerBlock.map.open")}
					</a>
				) : null}
			</div>
		</article>
	)
}

export { MapCard, type MapCardProps }
