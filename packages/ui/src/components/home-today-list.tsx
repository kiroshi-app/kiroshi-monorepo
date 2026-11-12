"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { MISSION_AVATAR_SIZE } from "@workspace/ui/components/mission"
import {
	TextShimmer,
	WORKING_SHIMMER_DURATION,
} from "@workspace/ui/components/motion/text-shimmer"
import {
	ACTIVITY_ROW_CLASS,
	RowAnatomy,
} from "@workspace/ui/components/row-anatomy"
import { cn } from "@workspace/ui/lib/utils"

type HomeTodayRow = {
	id: string
	title: string
	timestamp: string
	icon?: string
	hue?: number | null
} & (
	| { state: "working"; preview: string }
	| { state: "needs-you"; question: string }
	| { state: "done"; preview: string }
)

type HomeTodayListProps = {
	agentName: string
	rows: HomeTodayRow[]
	onOpenRow: (id: string) => void
}

type HomeTodayRowButtonProps = {
	row: HomeTodayRow
	onOpenRow: (id: string) => void
}

const TODAY_ROW_LIMIT = 3

const HEADER =
	"py-2 ps-1.5 pe-3 font-medium text-muted-foreground text-xs leading-4 wrap-break-word"

const ROW = cn(
	ACTIVITY_ROW_CLASS,
	"-outline-offset-2 hover:bg-mission-list-hover active:bg-title-bar-highlight",
)

const PREVIEW = "min-w-0 truncate"

const previewOf = (row: HomeTodayRow) => {
	if (row.state === "needs-you") return undefined
	if (row.state === "done")
		return <span className={PREVIEW}>{row.preview}</span>

	return (
		<TextShimmer className={PREVIEW} duration={WORKING_SHIMMER_DURATION}>
			{row.preview}
		</TextShimmer>
	)
}

const HomeTodayRowButton = ({ row, onOpenRow }: HomeTodayRowButtonProps) => {
	const timeId = useId()
	const previewId = useId()

	return (
		<button
			aria-describedby={`${timeId} ${previewId}`}
			aria-label={row.title}
			className={ROW}
			data-slot="home-today-row"
			data-state={row.state}
			onClick={() => onOpenRow(row.id)}
			type="button"
		>
			<RowAnatomy
				geometry="activity"
				media={
					<ConversationSubjectIcon
						hue={row.hue}
						icon={row.icon}
						side={MISSION_AVATAR_SIZE}
					/>
				}
				name={row.title}
				nameSlot="home-today-row-title"
				pendingQuestion={row.state === "needs-you" ? row.question : undefined}
				preview={previewOf(row)}
				previewId={previewId}
				previewSlot="home-today-row-preview"
				timestamp={row.timestamp}
				timestampId={timeId}
				timestampSlot="home-today-row-time"
			/>
		</button>
	)
}

const HomeTodayList = ({ agentName, rows, onOpenRow }: HomeTodayListProps) => {
	const { t } = useTranslation("chat")
	const headerId = useId()

	if (rows.length === 0) return null

	return (
		<div className="flex flex-col gap-1 ps-2" data-slot="home-today-list">
			<h2 className={HEADER} id={headerId}>
				{t("home.today", { name: agentName })}
			</h2>
			<ul aria-labelledby={headerId} className="flex flex-col gap-1">
				{rows.slice(0, TODAY_ROW_LIMIT).map((row) => (
					<li key={row.id}>
						<HomeTodayRowButton onOpenRow={onOpenRow} row={row} />
					</li>
				))}
			</ul>
		</div>
	)
}

export { HomeTodayList, type HomeTodayListProps, type HomeTodayRow }
