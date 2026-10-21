import { bundleEditRules } from "./bundle-writes"
import { KIROSHI_SERVER } from "./kiroshi-server"

const CONNECTOR_PREFIX = "claude.ai "

const toolPrefixName = (server: string): string => {
	const normalized = server.replace(/[^a-zA-Z0-9_-]/g, "_")
	return server.startsWith(CONNECTOR_PREFIX)
		? normalized.replace(/_+/g, "_").replace(/^_|_$/g, "")
		: normalized
}

const serverAllows = (servers: string[]): string[] => [
	...new Set(
		[KIROSHI_SERVER, ...servers].map(
			(server) => `mcp__${toolPrefixName(server)}`,
		),
	),
]

export type AllowScope = {
	pluginPath?: string
	sharedPaths: string[]
	servers: string[]
	platform: NodeJS.Platform
}

export const derivedAllows = ({
	pluginPath,
	sharedPaths,
	servers,
	platform,
}: AllowScope): string[] =>
	pluginPath
		? [
				...serverAllows(servers),
				...bundleEditRules(pluginPath, sharedPaths, platform),
			]
		: []
