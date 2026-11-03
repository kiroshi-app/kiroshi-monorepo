import { EXECUTABLE_OVERRIDE_ENV } from "./executable"

const DISABLE_AUTO_MEMORY = "CLAUDE_CODE_DISABLE_AUTO_MEMORY"
export const CLASSIFY_ASK_USER_QUESTION =
	"CLAUDE_CODE_AUTO_MODE_CLASSIFY_ASK_USER_QUESTION"
export const EMIT_SESSION_STATE_EVENTS = "CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS"

export const CONNECTION_KEYS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]

const INHERITED_KEYS = [
	"PATH",
	"HOME",
	"SHELL",
	"USER",
	"LOGNAME",
	"TMPDIR",
	"LANG",
	"LC_ALL",
	"TERM",
	"TZ",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"NODE_EXTRA_CA_CERTS",
	"SSL_CERT_FILE",
	"SystemRoot",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"TEMP",
	"TMP",
	"PATHEXT",
	"ComSpec",
	"CLAUDE_CONFIG_DIR",
	EXECUTABLE_OVERRIDE_ENV,
]

const picked = (
	keys: string[],
	source: Record<string, string | undefined>,
): Record<string, string> =>
	Object.fromEntries(
		keys.flatMap((key) => {
			const value = source[key]
			return value === undefined ? [] : [[key, value] as const]
		}),
	)

export const inheritedEnv = (
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string> => picked(INHERITED_KEYS, source)

export const connectionEnv = (
	base: Record<string, string> = {},
): Record<string, string> => picked(CONNECTION_KEYS, base)

export const sessionEnv = (
	base?: Record<string, string>,
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string> => ({
	...inheritedEnv(source),
	...connectionEnv(base),
	[DISABLE_AUTO_MEMORY]: "1",
	[CLASSIFY_ASK_USER_QUESTION]: "0",
})
