import { KIROSHI_SERVER } from "./kiroshi-server"

const CONNECTOR_PREFIX = "claude.ai "

const toolPrefixName = (server: string): string => {
	const normalized = server.replace(/[^a-zA-Z0-9_-]/g, "_")
	return server.startsWith(CONNECTOR_PREFIX)
		? normalized.replace(/_+/g, "_").replace(/^_|_$/g, "")
		: normalized
}

type AllowScope = {
	pluginPath?: string
	servers: string[]
}

export const derivedAllows = ({ pluginPath, servers }: AllowScope): string[] =>
	pluginPath
		? [
				...new Set(
					[KIROSHI_SERVER, ...servers].map(
						(server) => `mcp__${toolPrefixName(server)}`,
					),
				),
			]
		: []
