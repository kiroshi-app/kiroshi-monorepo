const LONGEST_LINE = 2048

export const agentStderr = (source: string): ((data: string) => void) => {
	let pending = ""
	return (data) => {
		const pieces = `${pending}${data}`.split("\n")
		pending = (pieces.pop() ?? "").slice(0, LONGEST_LINE)
		for (const line of pieces) {
			if (line.trim()) {
				process.stderr.write(
					`[agent ${source}] ${line.slice(0, LONGEST_LINE)}\n`,
				)
			}
		}
	}
}
