import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { FillIcons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type VideoMarker = {
	time: number
	label?: string
}

type VideoPlayerProps = {
	src: string
	title: string
	duration: number
	source?: string
	poster?: string
	marker?: VideoMarker
	className?: string
}

const twoDigits = (value: number) => `${value}`.padStart(2, "0")

const formatClockTime = (totalSeconds: number) => {
	const whole = Math.floor(totalSeconds)
	const hours = Math.floor(whole / 3600)
	const minutes = Math.floor((whole % 3600) / 60)
	const seconds = twoDigits(whole % 60)

	return hours > 0
		? `${hours}:${twoDigits(minutes)}:${seconds}`
		: `${minutes}:${seconds}`
}

const VideoPlayer = ({
	src,
	title,
	duration,
	source,
	poster,
	marker,
	className,
}: VideoPlayerProps) => {
	const { t } = useTranslation("chat")
	const videoRef = useRef<HTMLVideoElement>(null)
	const [isPlaying, setIsPlaying] = useState(false)
	const [hasFailed, setHasFailed] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const PlaybackGlyph = isPlaying ? FillIcons.Pause : FillIcons.Play

	const togglePlayback = () => {
		const video = videoRef.current
		if (!video) return
		if (isPlaying) {
			video.pause()
			return
		}
		setHasFailed(false)
		video.play().catch(() => setHasFailed(true))
	}

	const seekTo = (time: number) => {
		if (videoRef.current) videoRef.current.currentTime = time
		setCurrentTime(time)
	}

	const caption = [title, source, marker?.label].filter(Boolean).join(" · ")

	return (
		<figure
			data-slot="video-player"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			<div className="relative h-89.5 w-full overflow-hidden rounded-control bg-linear-to-br from-slate-700 to-orange-900">
				{/* biome-ignore lint/a11y/useMediaCaption: a video answer block carries no caption track to point at */}
				<video
					ref={videoRef}
					className="absolute inset-0 size-full object-cover"
					playsInline
					poster={poster}
					preload="none"
					src={src}
					onError={() => setHasFailed(true)}
					onPause={() => setIsPlaying(false)}
					onPlay={() => setIsPlaying(true)}
					onTimeUpdate={(event) =>
						setCurrentTime(event.currentTarget.currentTime)
					}
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 bottom-0 h-30 bg-linear-to-b from-transparent to-black/65"
				/>
				<button
					type="button"
					aria-label={t(
						isPlaying ? "answerBlock.video.pause" : "answerBlock.video.play",
						{ title },
					)}
					className="absolute top-1/2 left-1/2 grid size-16 -translate-1/2 place-items-center rounded-full bg-white/92 text-black outline-offset-2 hover:bg-white active:bg-white/80"
					onClick={togglePlayback}
				>
					<PlaybackGlyph aria-hidden="true" className="size-5.5" />
				</button>
				<div className="absolute inset-x-3 bottom-3 flex items-center gap-3 text-xs text-white tabular-nums">
					<span>{formatClockTime(currentTime)}</span>
					<div className="relative h-1 min-w-0 flex-1 rounded-xs bg-white/25">
						{marker ? (
							<button
								type="button"
								aria-label={t("answerBlock.video.seek", {
									time: formatClockTime(marker.time),
								})}
								className="group absolute top-1/2 grid size-6 -translate-1/2 place-items-center outline-offset-2"
								style={{ left: `${(marker.time / duration) * 100}%` }}
								onClick={() => seekTo(marker.time)}
							>
								<span className="h-2.5 w-0.5 rounded-full bg-primary-strong group-hover:bg-white group-active:bg-white/70" />
							</button>
						) : null}
					</div>
					<span>{formatClockTime(duration)}</span>
				</div>
			</div>
			<figcaption className="truncate text-compact leading-4.5 text-muted-foreground">
				{caption}
			</figcaption>
			<p
				role="status"
				className="text-compact leading-4.5 text-destructive empty:hidden"
			>
				{hasFailed ? t("answerBlock.video.failed") : null}
			</p>
		</figure>
	)
}

export { VideoPlayer, type VideoPlayerProps }
