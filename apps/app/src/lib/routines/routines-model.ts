import type {
	RoutineRunModel,
	RoutineRunOutcome,
} from "@workspace/ui/components/routine-detail"
import type {
	RoutineFilterRow,
	RoutineFilterValues,
	RoutineFormRefusal,
	RoutineFormValues,
	RoutineTriggerKind,
	RoutineTriggerSource,
	RoutineWebhook,
} from "@workspace/ui/components/routine-form"
import type { RoutineRowModel } from "@workspace/ui/components/routine-row"

import {
	FIELD_TYPES,
	FILTER_OPERATORS,
	type FieldType,
	OPERATOR_TAKES_VALUE,
} from "./filter-vocabulary"
import type {
	Routine,
	RoutineError,
	RoutineKey,
	RoutineRun,
	RunOutcome,
} from "./routine-contract"
import type {
	Filter,
	FilterRow,
	PayloadField,
	TriggerSource,
} from "./trigger-contract"

import type { Json } from "@/lib/bindings"

export type KnownSources = ReadonlyMap<string, TriggerSource>

export const sourceKeyOf = (botId: string, triggerSourceId: string) =>
	`${botId}/${triggerSourceId}`

export const toKnownSources = (
	declared: { botId: string; sources: TriggerSource[] }[],
): KnownSources =>
	new Map(
		declared.flatMap(({ botId, sources }) =>
			sources.map((source) => [sourceKeyOf(botId, source.id), source] as const),
		),
	)

const triggerSourceTitleOf = (routine: Routine, known: KnownSources): string =>
	known.get(sourceKeyOf(routine.botId, routine.triggerSourceId))?.title ??
	routine.triggerSourceId

export const toRoutineRows = (
	routines: Routine[],
	known: KnownSources,
): RoutineRowModel[] =>
	routines.map((routine) => ({
		id: routine.id,
		title: routine.title,
		triggerSourceTitle: triggerSourceTitleOf(routine, known),
		isEnabled: routine.isEnabled,
		hasStoppedItself: !routine.isEnabled && routine.consecutiveFailures > 0,
	}))

export type ReportedRunRead = {
	id: string
	routineTitle: string
	triggerSourceTitle: string
	botId: string
	at: number
}

type RoutineRuns = {
	routine: Routine
	runs: RoutineRun[]
}

export const toReportedRuns = (
	read: RoutineRuns[],
	known: KnownSources,
): ReportedRunRead[] =>
	read.flatMap(({ routine, runs }) =>
		runs
			.filter((run) => run.outcome === "ok")
			.map((run) => ({
				id: run.id,
				routineTitle: routine.title,
				triggerSourceTitle: triggerSourceTitleOf(routine, known),
				botId: routine.botId,
				at: run.endedAt ?? run.startedAt,
			})),
	)

const RUN_OUTCOME_NAMES: Record<RunOutcome, RoutineRunOutcome> = {
	ok: "reported",
	nothing: "nothing",
	skipped: "skipped",
	failed: "failed",
}

export const toRunModels = (runs: RoutineRun[]): RoutineRunModel[] =>
	runs.map((run) => ({
		id: run.id,
		startedAt: run.startedAt,
		outcome: run.outcome ? RUN_OUTCOME_NAMES[run.outcome] : null,
		reason: run.reason ?? undefined,
	}))

const KINDS_BY_SOURCE_ID: Record<string, RoutineTriggerKind> = {
	schedule: "schedule",
	"file-watch": "fileWatch",
	"local-webhook": "localWebhook",
}

export const triggerKindOf = (triggerSourceId: string): RoutineTriggerKind =>
	KINDS_BY_SOURCE_ID[triggerSourceId] ?? "plain"

export const toTriggerSource = ({
	id,
	title,
	payload,
}: TriggerSource): RoutineTriggerSource => ({
	id,
	title,
	payload,
	kind: triggerKindOf(id),
})

export const toTriggerSources = (
	declared: TriggerSource[],
): RoutineTriggerSource[] => declared.map(toTriggerSource)

const typeOf = (fields: PayloadField[], field: string) =>
	fields.find((declared) => declared.name === field)?.type

const asNumber = (value: string) => {
	const held = Number(value)
	return value.trim() === "" || Number.isNaN(held) ? value : held
}

const written = (value: string, fieldType: FieldType | undefined) => {
	if (fieldType === "number") {
		return asNumber(value)
	}

	return fieldType === "boolean" ? value === "true" : value
}

const toFilterRow = (
	row: RoutineFilterRow,
	fields: PayloadField[],
): FilterRow => {
	const { field, operator } = row
	const fieldType = typeOf(fields, field) ?? row.readAs?.fieldType

	return OPERATOR_TAKES_VALUE[operator]
		? { field, operator, value: written(row.value, fieldType) }
		: { field, operator }
}

const asRead = (row: RoutineFilterRow, read: FilterRow[]) =>
	read.find((held) => isSameRow(row, toFormRow(held)))

export const toFilter = (
	filter: RoutineFilterValues,
	fields: PayloadField[],
	read?: Filter,
): Filter => ({
	matchMode: filter.matchMode,
	rows: filter.rows.map(
		(row) => asRead(row, read?.rows ?? []) ?? toFilterRow(row, fields),
	),
})

const readTypeOf = (value: FilterRow["value"]): FieldType | undefined => {
	if (typeof value === "number") return "number"
	if (typeof value === "boolean") return "boolean"

	return typeof value === "string" ? "string" : undefined
}

const toFormRow = ({
	field,
	operator,
	value,
}: FilterRow): RoutineFilterRow => ({
	field,
	operator,
	value: value === undefined ? "" : String(value),
	readAs: { operator, fieldType: readTypeOf(value) },
})

const isSameRow = (row: RoutineFilterRow, held: RoutineFilterRow) =>
	row.field === held.field &&
	row.operator === held.operator &&
	row.value === held.value

export const toFormFilter = (filter: Filter): RoutineFilterValues => ({
	matchMode: filter.matchMode,
	rows: filter.rows.map(toFormRow),
})

const textIn = (triggerConfig: unknown, field: string): string => {
	if (typeof triggerConfig !== "object" || triggerConfig === null) {
		return ""
	}

	const held = (triggerConfig as Record<string, unknown>)[field]
	return typeof held === "string" ? held : ""
}

export const toFormValues = (routine: Routine): RoutineFormValues => ({
	title: routine.title,
	instruction: routine.instruction,
	triggerSourceId: routine.triggerSourceId,
	expression: textIn(routine.triggerConfig, "expression"),
	path: textIn(routine.triggerConfig, "path"),
	filter: toFormFilter(routine.filter),
})

export const toTriggerConfig = (values: RoutineFormValues): Json => {
	const kind = triggerKindOf(values.triggerSourceId)
	if (kind === "schedule") {
		return { expression: values.expression }
	}

	return kind === "fileWatch" ? { path: values.path } : {}
}

const REFUSALS_BY_BLANK_FIELD: Record<string, RoutineFormRefusal> = {
	title: "blankTitle",
	instruction: "blankInstruction",
}

const refusalIn = (reason: unknown): RoutineError | null =>
	typeof reason === "object" && reason !== null && "kind" in reason
		? (reason as RoutineError)
		: null

const toOperatorRefusal = ({
	row,
	operator,
	fieldType,
}: Extract<
	RoutineError,
	{ kind: "unsupportedOperator" }
>): RoutineFormRefusal | null => {
	const refusedOperator = FILTER_OPERATORS.find((held) => held === operator)
	const refusedType = FIELD_TYPES.find((held) => held === fieldType)

	return refusedOperator && refusedType
		? { row, operator: refusedOperator, fieldType: refusedType }
		: null
}

export const toFormRefusal = (reason: unknown): RoutineFormRefusal | null => {
	const refused = refusalIn(reason)
	if (!refused) {
		return null
	}

	if (refused.kind === "unsupportedOperator") {
		return toOperatorRefusal(refused)
	}

	if (refused.kind === "unreadableExpression") {
		return "unreadableExpression"
	}

	return refused.kind === "blankField"
		? (REFUSALS_BY_BLANK_FIELD[refused.field] ?? null)
		: null
}

export const toWebhook = ({
	url,
	key,
	header,
}: RoutineKey): RoutineWebhook => ({
	url: url ?? "",
	key,
	header: header ?? "",
})
