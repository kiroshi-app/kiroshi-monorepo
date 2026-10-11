const MASK = "[redacted]"

const HOME_DIRECTORY =
	/(?:\/Users|\/home)\/[^/\s"'`]+|[A-Za-z]:\\Users\\[^\\\s"'`]+/g

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

const BEARER = /\b(Bearer)\s+[^\s"',;]+/gi

const NAMED_SECRET =
	/\b((?:access[_-]?|refresh[_-]?|auth[_-]?|id[_-]?)?token|api[_-]?key|apikey|secret|password|passwd)(["']?\s*[=:]\s*["']?)[^\s"'&,;]+/gi

const PREFIXED_KEY =
	/\b(?:sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16})/g

const JSON_WEB_TOKEN = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g

const SECRET_LOOKING = /\b(?=[\w+/=-]*\d)(?=[\w+/=-]*[A-Za-z])[\w+/=-]{32,}/g

export const scrubFailureText = (text: string): string =>
	text
		.replace(HOME_DIRECTORY, "~")
		.replace(EMAIL, MASK)
		.replace(BEARER, `$1 ${MASK}`)
		.replace(NAMED_SECRET, `$1$2${MASK}`)
		.replace(PREFIXED_KEY, MASK)
		.replace(JSON_WEB_TOKEN, MASK)
		.replace(SECRET_LOOKING, MASK)
