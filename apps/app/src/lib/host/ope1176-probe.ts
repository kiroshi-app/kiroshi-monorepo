const WATCHED: ReadonlySet<string> = new Set([
	"conversation_message_page",
	"mission_list",
])
const WATCHDOG_MS = 2000

type Read = {
	seq: number
	command: string
	conversationId: string
	since: number
	space: string
	active: string
	step: string
	hasBarked: boolean
}

let selectedSpace = "unknown"

export const noteSpace = (rowId: string) => {
	selectedSpace = rowId
}

const reads = new WeakMap<object, Read>()
const unsettled = new Map<number, Read>()
let lastSeq = 0

const now = () => performance.now()

export const ope1176 = (line: string) =>
	console.info(`[ope1176] front mono=${now().toFixed(1)} ${line}`)

const conversationOf = (args: unknown): string => {
	const id = (args as { conversationId?: unknown } | undefined)?.conversationId
	return typeof id === "string" ? id : "-"
}

const isWatched = (command: string) => WATCHED.has(command)

const readOf = (args: unknown): Read | undefined =>
	typeof args === "object" && args !== null ? reads.get(args) : undefined

export const received = (
	command: string,
	args: unknown,
	active: string | null,
) => {
	if (!isWatched(command) || typeof args !== "object" || args === null) return
	lastSeq += 1
	const read: Read = {
		seq: lastSeq,
		command,
		conversationId: conversationOf(args),
		since: now(),
		space: selectedSpace,
		active: active ?? "local",
		step: "received",
		hasBarked: false,
	}
	reads.set(args, read)
	unsettled.set(read.seq, read)
	ope1176(
		`#${read.seq} received command=${command} space ${read.space} conversation ${read.conversationId} active=${read.active}`,
	)
}

export const stepped = (args: unknown, step: string) => {
	const read = readOf(args)
	if (!read) return
	read.step = step
	ope1176(
		`#${read.seq} ${read.command} conversation ${read.conversationId} step=${step} elapsed_ms=${(now() - read.since).toFixed(0)}`,
	)
}

export const settled = <T>(
	args: unknown,
	target: string,
	pending: Promise<T>,
): Promise<T> => {
	const read = readOf(args)
	if (!read) return pending
	const report = (outcome: string) => {
		unsettled.delete(read.seq)
		ope1176(
			`#${read.seq} settled command=${read.command} conversation ${read.conversationId} target=${target} outcome=${outcome} elapsed_ms=${(now() - read.since).toFixed(0)}`,
		)
	}
	pending.then(
		() => report("resolved"),
		(reason: unknown) => report(`rejected(${String(reason)})`),
	)
	return pending
}

const barked = () => {
	for (const read of unsettled.values()) {
		const waited = now() - read.since
		if (read.hasBarked || waited < WATCHDOG_MS) continue
		read.hasBarked = true
		ope1176(
			`watchdog STUCK #${read.seq} command=${read.command} space ${read.space} active=${read.active} conversation ${read.conversationId} last_step=${read.step} unsettled_ms=${waited.toFixed(0)}`,
		)
	}
}

if (typeof window !== "undefined") {
	setInterval(barked, 500)
}

type DrivenSidebar = {
	onSelectConversation: (id: string, modifiers: undefined) => void
	onSelectSpace: (id: string) => void
}

type DrivenRoster = {
	getState: () => {
		spaceRowId: string | null
		conversations: ReadonlyArray<{ id: string }>
	}
}

type Driven = { ope1176Sidebar?: DrivenSidebar; ope1176Roster?: DrivenRoster }

export const ope1176Exposed = <T extends DrivenSidebar>(
	actions: T,
	roster: DrivenRoster,
): T => {
	if (import.meta.env.VITE_OPE1176_DRIVE === "1") {
		;(globalThis as Driven).ope1176Sidebar = actions
		;(globalThis as Driven).ope1176Roster = roster
	}
	return actions
}

export const drivenSidebar = (): DrivenSidebar | undefined =>
	(globalThis as Driven).ope1176Sidebar

export const firstListedConversation = (row: string): string | undefined => {
	const state = (globalThis as Driven).ope1176Roster?.getState()
	if (!state || state.spaceRowId !== row) return undefined
	return state.conversations[0]?.id
}
