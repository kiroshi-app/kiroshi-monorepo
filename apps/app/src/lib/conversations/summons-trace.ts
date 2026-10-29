const SUMMONS_DROP_REASONS = [
	"selfMention",
	"ranInTurn",
	"interrupted",
	"cancelled",
	"notSeated",
	"startFailed",
	"neverStarted",
] as const

export type SummonsDropReason = (typeof SUMMONS_DROP_REASONS)[number]

export type SummonsRun = {
	conversationId: string
	turnId: string
	botId: string
}

const fieldsOf = ({ conversationId, turnId, botId }: SummonsRun) => [
	`conversation: ${conversationId}`,
	`turn: ${turnId}`,
	`bot: ${botId}`,
]

const lineOf = (step: string, run: SummonsRun, extra: string[]) =>
	[`summons ${step}`, ...fieldsOf(run), ...extra].join(" | ")

export const traceSummonsQueued = (run: SummonsRun, runningTurnId: string) =>
	console.info(
		lineOf("queued", run, [`behind the running turn: ${runningTurnId}`]),
	)

export const traceSummonsStarted = (run: SummonsRun) =>
	console.info(lineOf("started", run, []))

export const traceSummonsDropped = (
	run: SummonsRun,
	reason: SummonsDropReason,
) => console.warn(lineOf("dropped", run, [`reason: ${reason}`]))
