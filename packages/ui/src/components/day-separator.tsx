import { useTranslation } from "react-i18next"

import { formatDateTime } from "@workspace/ui/lib/time-format"

type DaySeparatorProps = {
	at: number
	now: number
	note?: string
}

const localDayOf = (at: number) => new Date(at).toDateString()

const dayBefore = (at: number) => {
	const before = new Date(at)
	before.setDate(before.getDate() - 1)
	return before.getTime()
}

const isSameYear = (at: number, now: number) =>
	new Date(at).getFullYear() === new Date(now).getFullYear()

const DaySeparator = ({ at, now, note }: DaySeparatorProps) => {
	const { t } = useTranslation("chat")
	const day = localDayOf(at)
	const label =
		day === localDayOf(now)
			? t("transcript.day.today")
			: day === localDayOf(dayBefore(now))
				? t("transcript.day.yesterday")
				: formatDateTime(at, {
						day: "numeric",
						month: "long",
						...(isSameYear(at, now) ? {} : { year: "numeric" }),
					})

	return (
		<div
			data-slot="day-separator"
			className="flex items-center justify-center gap-1 font-medium text-muted-foreground text-xs"
		>
			<span className="shrink-0">{label}</span>
			{note ? (
				<>
					<span aria-hidden="true">{t("working.line.separator")}</span>
					<span className="min-w-0 wrap-break-word">{note}</span>
				</>
			) : null}
		</div>
	)
}

export { DaySeparator }
