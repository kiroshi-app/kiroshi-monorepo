import { appLogDir, join } from "@tauri-apps/api/path"

import type { FailureLog } from "@workspace/ui/components/notice-surface"

import { commands } from "./bindings"
import { scrubFailureText } from "./failure-text-scrubber"

const LOG_FILE = "kiroshi.log"

const REPORTED_LOG_LINES = 200

const logPath = async () => join(await appLogDir(), LOG_FILE)

const readLogTail = async () => {
	const tail = await commands.logTail(REPORTED_LOG_LINES)
	if (tail.status === "error") {
		throw new Error(`log tail ${tail.error.kind}`)
	}
	return tail.data
}

export const readFailureLog = async (): Promise<FailureLog> => {
	const [lines, path] = await Promise.all([readLogTail(), logPath()])
	return {
		lines: lines.map(scrubFailureText),
		path: scrubFailureText(path),
		lineCount: lines.length,
	}
}
