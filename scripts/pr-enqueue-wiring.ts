import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const PR_ENQUEUE = fileURLToPath(new URL("./pr-enqueue.sh", import.meta.url))

const PR_REQUEUE_CHECK = fileURLToPath(
	new URL("./pr-requeue-check.sh", import.meta.url),
)

const STRICT_MODE = "set -euo pipefail\n"

export const ENQUEUE_LINE = `if [ $# -eq 0 ] || { [ $# -eq 2 ] && [ "$1" = --reason ]; }; then "$(dirname "$0")/pr-requeue-check.sh" "$@"; set --; fi\n`

const unwiredSource = () => {
	const source = readFileSync(PR_ENQUEUE, "utf8").replace(ENQUEUE_LINE, "")
	if (!source.includes(STRICT_MODE)) {
		throw new Error("pr-enqueue.sh has no set -euo pipefail to wire after")
	}
	return source
}

const writeScripts = (directory: string, prEnqueueSource: string) => {
	const scripts = join(directory, "scripts")
	mkdirSync(scripts)
	const prEnqueue = join(scripts, "pr-enqueue.sh")
	writeFileSync(prEnqueue, prEnqueueSource)
	chmodSync(prEnqueue, 0o755)
	copyFileSync(PR_REQUEUE_CHECK, join(scripts, "pr-requeue-check.sh"))
	return prEnqueue
}

export const copyUnwiredPrEnqueue = (directory: string) =>
	writeScripts(directory, unwiredSource())

export const copyWiredPrEnqueue = (directory: string) =>
	writeScripts(
		directory,
		unwiredSource().replace(STRICT_MODE, `${STRICT_MODE}${ENQUEUE_LINE}`),
	)
