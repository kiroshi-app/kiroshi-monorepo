import { useState } from "react"

import {
	type BotMcpServerDraft,
	type BotMcpServerFields,
	isMcpServerDraftUnsaved,
	isSameFieldAnswer,
	MCP_TRANSPORTS,
	parseMcpServerConfig,
	readMcpServerFields,
	readMcpServerTransport,
	toBundleName,
	toMcpServerConfigFor,
	toMcpServerConfigText,
	toMcpServerConfigWith,
	toMcpServerWrittenConfig,
} from "@workspace/ui/components/bot-settings"
import { useFocusFirstInvalid } from "@workspace/ui/hooks/use-focus-first-invalid"
import { usePendingSubmit } from "@workspace/ui/hooks/use-pending-submit"

const FIRST_SECTION = "connection"

type McpServerDraftOptions = {
	draft: BotMcpServerDraft
	onDraftChange: (draft: BotMcpServerDraft) => void
	saved?: BotMcpServerDraft
	onSave: (config: Record<string, unknown>) => unknown
	defaultSection?: string
}

const useMcpServerDraft = ({
	draft,
	onDraftChange,
	saved,
	onSave,
	defaultSection,
}: McpServerDraftOptions) => {
	const [typed, setTyped] = useState<Partial<BotMcpServerFields>>({})
	const [section, setSection] = useState(defaultSection ?? FIRST_SECTION)
	const [hasTriedSaving, setTriedSaving] = useState(false)
	const { root, focusFirstInvalid } = useFocusFirstInvalid<HTMLDivElement>()
	const { isPending, run } = usePendingSubmit()

	const config = parseMcpServerConfig(draft.config)
	const fields = readMcpServerFields(config ?? {})
	const written = config && toMcpServerWrittenConfig(config, draft.transport)
	const isUnsaved = isMcpServerDraftUnsaved(draft, saved)
	const isNameBlank = draft.name.trim().length === 0

	const patch = (next: Partial<BotMcpServerDraft>) =>
		onDraftChange({ ...draft, ...next })

	const shown = (field: keyof BotMcpServerFields) => {
		const raw = typed[field]

		return raw !== undefined && isSameFieldAnswer(field, raw, fields[field])
			? raw
			: fields[field]
	}

	const answer = (field: keyof BotMcpServerFields, value: string) => {
		setTyped({ ...typed, [field]: value })

		if (!config) return

		patch({
			config: toMcpServerConfigText(
				toMcpServerConfigWith(config, field, value),
			),
		})
	}

	const rename = (value: string) => patch({ name: toBundleName(value) })

	const pickTransport = (value: string) => {
		const transport = MCP_TRANSPORTS.find((it) => it === value) ?? "local"

		patch({
			transport,
			config: config
				? toMcpServerConfigText(toMcpServerConfigFor(config, transport))
				: draft.config,
		})
	}

	const editConfig = (value: string) => {
		const next = parseMcpServerConfig(value)

		patch({
			config: value,
			transport: next
				? readMcpServerTransport(next, draft.transport)
				: draft.transport,
		})
	}

	const refuse = (invalidSection: string) => {
		setTriedSaving(true)
		setSection(invalidSection)
		focusFirstInvalid()
	}

	const save = () => {
		if (isNameBlank) refuse(FIRST_SECTION)
		else if (!written) refuse("advanced")
		else if (isUnsaved) run(() => onSave(written))
	}

	return {
		root,
		section,
		setSection,
		isPending,
		config,
		fields,
		isUnsaved,
		isNameRefused: hasTriedSaving && isNameBlank,
		shown,
		answer,
		rename,
		pickTransport,
		editConfig,
		save,
	}
}

export { FIRST_SECTION, useMcpServerDraft }
