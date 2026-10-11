"use client"

import { useState } from "react"

import { Icons } from "@workspace/ui/components/icons"
import { allowedSvgMark } from "@workspace/ui/lib/svg-mark"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationMarkSize = "md" | "card" | "sm" | "xsm" | "inline" | "xs"

type ApplicationMarkStyle = {
	slot: string
	glyph: string
}

const APPLICATION_MARK_STYLE = {
	md: { slot: "size-9 rounded-md", glyph: "size-4" },
	card: { slot: "size-8 rounded-md", glyph: "size-4" },
	sm: { slot: "size-7 rounded-md", glyph: "size-3.5" },
	xsm: { slot: "size-6 rounded-sm", glyph: "size-3" },
	inline: { slot: "size-5.5 rounded-sm", glyph: "size-3" },
	xs: { slot: "size-5 rounded-sm", glyph: "size-3" },
} as const satisfies Record<ApplicationMarkSize, ApplicationMarkStyle>

const isDrawing = (mark: string) => mark.trimStart().startsWith("<svg")

type ApplicationMarkProps = {
	mark?: string
	size?: ApplicationMarkSize
	isBlank?: boolean
}

const ApplicationMark = ({
	mark,
	size = "md",
	isBlank = false,
}: ApplicationMarkProps) => {
	const style = APPLICATION_MARK_STYLE[size]
	const [unreachableMark, setUnreachableMark] = useState<string>()
	const drawing =
		mark !== undefined && isDrawing(mark) ? allowedSvgMark(mark) : null
	const isDrawn = drawing !== null
	const isGlyph =
		mark === undefined ||
		unreachableMark === mark ||
		(isDrawing(mark) && drawing === null)

	const content = () => {
		if (isGlyph) {
			return isBlank ? null : <Icons.Server className={style.glyph} />
		}

		if (isDrawn) {
			return (
				<span
					className={cn(style.glyph, "[&>svg]:size-full")}
					dangerouslySetInnerHTML={{ __html: drawing }}
				/>
			)
		}

		return (
			<img
				alt=""
				className="image-outline size-full object-cover"
				onError={() => setUnreachableMark(mark)}
				src={mark}
			/>
		)
	}

	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden",
				style.slot,
				(isDrawn || isGlyph) && "border border-border bg-muted",
				isDrawn && "text-foreground",
				isGlyph && "text-muted-foreground",
			)}
			data-slot="application-mark"
		>
			{content()}
		</span>
	)
}

export { ApplicationMark }
