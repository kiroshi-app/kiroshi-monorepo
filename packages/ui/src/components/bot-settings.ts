import permissionModes from "@workspace/shared/permission-modes.json"
import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"

type BotIdentity = {
	blot?: BotAvatarBlot
	image?: string
}

type BotEffort = (typeof BOT_EFFORTS)[number]

const BOT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const

const readBotEffort = (value: string): BotEffort | null =>
	BOT_EFFORTS.find((effort) => effort === value) ?? null

type BotModelOption = {
	label: string
	value: string
	supportedEfforts: BotEffort[]
}

type BotOutputStyle = (typeof BOT_OUTPUT_STYLES)[number]

const BOT_OUTPUT_STYLES = ["Concise", "default"] as const

const DEFAULT_BOT_OUTPUT_STYLE: BotOutputStyle = "Concise"

const readBotOutputStyle = (value: string): BotOutputStyle =>
	BOT_OUTPUT_STYLES.find((style) => style === value) ?? DEFAULT_BOT_OUTPUT_STYLE

type BotPermissionMode = (typeof BOT_PERMISSION_MODES)[number]

const BOT_PERMISSION_MODES = permissionModes.modes

const DEFAULT_BOT_PERMISSION_MODE: BotPermissionMode = permissionModes.fallback

const readBotPermissionMode = (value: string): BotPermissionMode =>
	BOT_PERMISSION_MODES.find((mode) => mode === value) ??
	DEFAULT_BOT_PERMISSION_MODE

type BotPermissions = {
	defaultMode: BotPermissionMode
	allow: string[]
	ask: string[]
	deny: string[]
}

const BOT_PERMISSION_RULE_LISTS = ["allow", "ask", "deny"] as const

type BotPermissionRuleList = (typeof BOT_PERMISSION_RULE_LISTS)[number]

const BLANK_BOT_PERMISSIONS: BotPermissions = {
	defaultMode: DEFAULT_BOT_PERMISSION_MODE,
	allow: [],
	ask: [],
	deny: [],
}

const PERMISSION_RULE = /^[A-Za-z_][A-Za-z0-9_-]*(\(.+\))?$/

const isPermissionRule = (rule: string): boolean =>
	PERMISSION_RULE.test(rule.trim())

type BotSkillEffort = (typeof SKILL_EFFORTS)[number]

const SKILL_EFFORTS = ["low", "medium", "high"] as const

type BotSkillContext = (typeof SKILL_CONTEXTS)[number]

const SKILL_CONTEXTS = ["shared", "fork"] as const

type BotSkillDraft = {
	name: string
	description: string
	body: string
	whenToUse?: string
	argumentHint?: string
	arguments?: string
	isPreloaded?: boolean
	isModelInvocationDisabled?: boolean
	isUserInvocable?: boolean
	paths?: string
	model?: string
	effort?: BotSkillEffort
	context?: BotSkillContext
	shell?: string
	agent?: string
	isBackground?: boolean
	allowedTools?: string
	disallowedTools?: string
	hooks?: string
	license?: string
	compatibility?: string
	metadata?: string
}

const SKILL_FLAG_DEFAULTS = {
	isModelInvocationDisabled: false,
	isUserInvocable: true,
	isBackground: true,
} as const

const BLANK_SKILL_DRAFT: BotSkillDraft = {
	name: "",
	description: "",
	body: "",
	isPreloaded: false,
	...SKILL_FLAG_DEFAULTS,
}

const SKILL_DESCRIPTION_LIMIT = 1536

const toSkillDescriptionLength = (draft: BotSkillDraft) =>
	draft.description.length + (draft.whenToUse?.length ?? 0)

const isSkillFieldAnswered = (value: unknown) =>
	value !== undefined && value !== ""

const isSameSkillDraft = (a: BotSkillDraft, b: BotSkillDraft) => {
	const left = toAnsweredFields(a)
	const right = toAnsweredFields(b)
	const fields = Object.keys(left)

	return (
		fields.length === Object.keys(right).length &&
		fields.every((field) => left[field] === right[field])
	)
}

const isSkillDraftUnsaved = (draft: BotSkillDraft, saved?: BotSkillDraft) =>
	!isSameSkillDraft(draft, saved ?? BLANK_SKILL_DRAFT)

const toAnsweredFields = (draft: BotSkillDraft): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(draft).filter(([, value]) => isSkillFieldAnswered(value)),
	)

const toBundleName = (value: string) =>
	value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")

type BotSkillItem = BotSkillDraft & {
	id: string
	isPreloaded: boolean
	isSystem: boolean
}

type BotCommitAuthor = "user" | "bot"

type BotMcpConnectionState = (typeof MCP_CONNECTION_STATES)[number]

const MCP_CONNECTION_STATES = [
	"connected",
	"needsAuthorization",
	"connecting",
	"failed",
] as const

type BotMcpConnectionReason =
	| {
			kind:
				| "alreadyRunning"
				| "store"
				| "transport"
				| "refusedUrl"
				| "browserRefused"
				| "timedOut"
	  }
	| { kind: "unknown"; detail: string }

type BotMcpServerItem = {
	name: string
	config: Record<string, unknown>
	connection?: BotMcpConnectionState
	reason?: BotMcpConnectionReason
	displayName?: string
	mark?: string
}

type BotMcpTransport = (typeof MCP_TRANSPORTS)[number]

const MCP_TRANSPORTS = ["local", "remote"] as const

const MCP_TRANSPORT_KEYS = {
	local: ["command", "args"],
	remote: ["url", "type", "headers"],
} as const satisfies Record<BotMcpTransport, readonly string[]>

type BotMcpEndpointKind = (typeof MCP_ENDPOINT_KINDS)[number]

const MCP_ENDPOINT_KINDS = ["http", "sse", "ws"] as const

const MCP_ENDPOINT_TYPES = [...MCP_ENDPOINT_KINDS, "streamable-http"]

const isMcpEndpointType = (value: unknown) =>
	MCP_ENDPOINT_TYPES.some((type) => type === readConfigText(value))

const readMcpEndpointKind = (value: unknown): BotMcpEndpointKind =>
	MCP_ENDPOINT_KINDS.find((kind) => kind === readConfigText(value)) ?? "http"

type BotMcpServerDraft = {
	name: string
	transport: BotMcpTransport
	config: string
}

const BLANK_MCP_SERVER_DRAFT: BotMcpServerDraft = {
	name: "",
	transport: "local",
	config: "{}",
}

const isConfigObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)

const parseMcpServerConfig = (text: string): Record<string, unknown> | null => {
	try {
		const parsed: unknown = JSON.parse(text)
		return isConfigObject(parsed) ? parsed : null
	} catch {
		return null
	}
}

const toMcpServerConfigText = (config: Record<string, unknown>) =>
	JSON.stringify(config, null, 2)

const readConfigText = (value: unknown) =>
	typeof value === "string" ? value : ""

const readConfigList = (value: unknown) =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: []

const readConfigPairs = (value: unknown) =>
	isConfigObject(value)
		? Object.entries(value).map(([name, entry]) => ({
				name,
				value: typeof entry === "string" ? entry : JSON.stringify(entry),
			}))
		: []

const PAIR_SEPARATOR = /[:=]/

const fromLines = (text: string) =>
	text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

const toPairLines = (value: unknown, separator: string) =>
	readConfigPairs(value)
		.map((pair) => `${pair.name}${separator}${pair.value}`)
		.join("\n")

const fromPairLines = (text: string) =>
	Object.fromEntries(
		fromLines(text).map((line) => {
			const at = line.search(PAIR_SEPARATOR)

			return at === -1
				? [line, ""]
				: [line.slice(0, at).trim(), line.slice(at + 1).trim()]
		}),
	)

type BotMcpServerFields = {
	command: string
	args: string
	url: string
	type: string
	headers: string
	environment: string
}

const MCP_FIELD_KEYS = {
	command: "command",
	args: "args",
	url: "url",
	type: "type",
	headers: "headers",
	environment: "env",
} as const satisfies Record<keyof BotMcpServerFields, string>

const readMcpServerFields = (
	config: Record<string, unknown>,
): BotMcpServerFields => ({
	command: readConfigText(config.command),
	args: readConfigList(config.args).join("\n"),
	url: readConfigText(config.url),
	type: readConfigText(config.type),
	headers: toPairLines(config.headers, ": "),
	environment: toPairLines(config.env, "="),
})

const toFieldValue = (
	field: keyof BotMcpServerFields,
	value: string,
): unknown => {
	if (field === "args") return fromLines(value)
	if (field === "headers" || field === "environment")
		return fromPairLines(value)

	return value
}

const isSameFieldAnswer = (
	field: keyof BotMcpServerFields,
	a: string,
	b: string,
) =>
	JSON.stringify(toFieldValue(field, a)) ===
	JSON.stringify(toFieldValue(field, b))

const isEmptyAnswer = (value: unknown) =>
	value === "" ||
	(Array.isArray(value) && value.length === 0) ||
	(isConfigObject(value) && Object.keys(value).length === 0)

const withoutKeys = (
	config: Record<string, unknown>,
	keys: readonly string[],
): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(config).filter(([key]) => !keys.includes(key)),
	)

const toMcpServerConfigWith = (
	config: Record<string, unknown>,
	field: keyof BotMcpServerFields,
	value: string,
): Record<string, unknown> => {
	const key = MCP_FIELD_KEYS[field]
	const answer = toFieldValue(field, value)

	return isEmptyAnswer(answer)
		? withoutKeys(config, [key])
		: { ...config, [key]: answer }
}

const withMcpEndpointType = (config: Record<string, unknown>) =>
	isMcpEndpointType(config.type) ? config : { ...config, type: "http" }

const toMcpServerConfigFor = (
	config: Record<string, unknown>,
	transport: BotMcpTransport,
) => {
	const kept = withoutKeys(
		config,
		transport === "remote"
			? MCP_TRANSPORT_KEYS.local
			: MCP_TRANSPORT_KEYS.remote,
	)

	return transport === "remote" ? withMcpEndpointType(kept) : kept
}

const readMcpServerTransport = (
	config: Record<string, unknown>,
	current: BotMcpTransport = "local",
): BotMcpTransport => {
	if (isMcpEndpointType(config.type)) return "remote"
	if (readConfigText(config.url)) return "remote"
	if (readConfigText(config.command) || readConfigList(config.args).length > 0)
		return "local"

	return current
}

const toMcpServerDraft = (server: BotMcpServerItem): BotMcpServerDraft => ({
	name: server.name,
	transport: readMcpServerTransport(server.config),
	config: toMcpServerConfigText(server.config),
})

const toMcpServerWrittenConfig = (
	config: Record<string, unknown>,
	transport: BotMcpTransport,
) => (transport === "remote" ? withMcpEndpointType(config) : config)

const toOrderedValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(toOrderedValue)
	if (!isConfigObject(value)) return value

	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, toOrderedValue(value[key])]),
	)
}

const toComparableConfig = (config: Record<string, unknown>) =>
	JSON.stringify(toOrderedValue(config))

const isMcpServerDraftUnsaved = (
	draft: BotMcpServerDraft,
	saved?: BotMcpServerDraft,
) => {
	if (!saved || draft.name !== saved.name) return true

	const config = parseMcpServerConfig(draft.config)
	const kept = parseMcpServerConfig(saved.config)

	if (!config || !kept) return true

	return (
		toComparableConfig(toMcpServerWrittenConfig(config, draft.transport)) !==
		toComparableConfig(kept)
	)
}

type BotSettingsValue = {
	identity: BotIdentity
	name: string
	title: string
	instructions: string
	model: string
	effort: BotEffort | null
	permissions: BotPermissions
}

export {
	BLANK_BOT_PERMISSIONS,
	BLANK_MCP_SERVER_DRAFT,
	BLANK_SKILL_DRAFT,
	BLOT_TINTS,
	BOT_EFFORTS,
	BOT_OUTPUT_STYLES,
	BOT_PERMISSION_MODES,
	BOT_PERMISSION_RULE_LISTS,
	type BotAvatarBlot,
	type BotCommitAuthor,
	type BotEffort,
	type BotIdentity,
	type BotMcpConnectionReason,
	type BotMcpConnectionState,
	type BotMcpServerDraft,
	type BotMcpServerFields,
	type BotMcpServerItem,
	type BotModelOption,
	type BotOutputStyle,
	type BotPermissionMode,
	type BotPermissionRuleList,
	type BotPermissions,
	type BotSettingsValue,
	type BotSkillContext,
	type BotSkillDraft,
	type BotSkillEffort,
	type BotSkillItem,
	DEFAULT_BOT_OUTPUT_STYLE,
	isMcpServerDraftUnsaved,
	isPermissionRule,
	isSameFieldAnswer,
	isSkillDraftUnsaved,
	MCP_ENDPOINT_KINDS,
	MCP_TRANSPORTS,
	parseMcpServerConfig,
	readBotEffort,
	readBotOutputStyle,
	readBotPermissionMode,
	readConfigList,
	readConfigPairs,
	readConfigText,
	readMcpEndpointKind,
	readMcpServerFields,
	readMcpServerTransport,
	SKILL_CONTEXTS,
	SKILL_DESCRIPTION_LIMIT,
	SKILL_EFFORTS,
	SKILL_FLAG_DEFAULTS,
	toBundleName,
	toMcpServerConfigFor,
	toMcpServerConfigText,
	toMcpServerConfigWith,
	toMcpServerDraft,
	toMcpServerWrittenConfig,
	toSkillDescriptionLength,
}
