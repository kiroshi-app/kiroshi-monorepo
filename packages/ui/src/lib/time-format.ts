import { i18n } from "@workspace/ui/lib/i18n"

const UNITS = [
	["year", 31_536_000_000],
	["month", 2_592_000_000],
	["week", 604_800_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
] as const satisfies readonly (readonly [Intl.RelativeTimeFormatUnit, number])[]

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>()

const keptOrMade = <Formatter>(
	kept: Map<string, Formatter>,
	key: string,
	make: () => Formatter,
) => {
	const found = kept.get(key)
	if (found) return found

	const made = make()
	kept.set(key, made)
	return made
}

const dateTimeFormatterFor = (options: Intl.DateTimeFormatOptions) => {
	const language = i18n.language

	return keptOrMade(
		dateTimeFormatters,
		`${language}|${JSON.stringify(options)}`,
		() => new Intl.DateTimeFormat(language, options),
	)
}

const relativeTimeFormatter = () => {
	const language = i18n.language

	return keptOrMade(
		relativeTimeFormatters,
		language,
		() => new Intl.RelativeTimeFormat(language, { numeric: "auto" }),
	)
}

const formatDateTime = (
	at: number | Date,
	options: Intl.DateTimeFormatOptions,
) => dateTimeFormatterFor(options).format(at)

const SHORT_MONTH_AND_DAY: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
}

const formatShortMonthAndDay = (at: number) =>
	formatDateTime(at, SHORT_MONTH_AND_DAY)

const toRelativeTime = (at: number, now: number) => {
	const format = relativeTimeFormatter()
	const elapsed = at - now

	for (const [unit, span] of UNITS) {
		if (Math.abs(elapsed) >= span) {
			return format.format(Math.round(elapsed / span), unit)
		}
	}

	return format.format(0, "second")
}

export { formatDateTime, formatShortMonthAndDay, toRelativeTime }
