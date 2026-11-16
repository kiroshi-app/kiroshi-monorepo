import { appLogDir, join } from "@tauri-apps/api/path"

import type { FailureLog } from "@workspace/ui/components/notice-surface"

import { commands } from "./bindings"
import { scrubFailureText } from "./failure-text-scrubber"

import { writeToLogFile } from "./host/console-log-forwarding"

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

const readFailureLog = async (): Promise<FailureLog> => {
	const [lines, path] = await Promise.all([readLogTail(), logPath()])
	return {
		lines: lines.map(scrubFailureText),
		path: scrubFailureText(path),
		lineCount: lines.length,
	}
}

const warnUnwritten = (line: string) => (reason: unknown) =>
	console.warn(`kiroshi.log refused the line: ${line}`, reason)

export const readFailureLogAfterWriting = async (
	line: string,
): Promise<FailureLog> => {
	await writeToLogFile("error", line).catch(warnUnwritten(line))
	return readFailureLog()
}
