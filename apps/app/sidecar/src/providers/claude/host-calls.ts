import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { askHost, HostRefusal } from "../../host"

export const spoken = (answer: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(answer ?? null) }],
})

export const refused = (error: unknown) => ({
	...spoken(error),
	isError: true,
})

type Shown = (answer: unknown) => CallToolResult

export const carriedTo =
	(subtype: string, shown: Shown = spoken) =>
	async (session: string | undefined, operation: string, payload: object) => {
		try {
			return shown(await askHost(session, { subtype, operation, payload }))
		} catch (error) {
			if (error instanceof HostRefusal) {
				return refused(error.error)
			}
			throw error
		}
	}
