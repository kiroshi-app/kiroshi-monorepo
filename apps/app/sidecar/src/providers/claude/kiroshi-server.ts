import {
	createSdkMcpServer,
	type Options,
} from "@anthropic-ai/claude-agent-sdk"

import { applicationTools } from "./application-tools"
import { bundleTools } from "./bundle-tools"
import { type AttachScope, companionTools } from "./companion-tools"
import {
	DELEGATE_TOOL_NAME,
	type DelegateScope,
	delegateTool,
} from "./delegate"
import { missionTools } from "./mission-tools"
import { routineTools } from "./routine-tools"

export const KIROSHI_SERVER = "kiroshi"

export const DELEGATE_TOOL = `mcp__${KIROSHI_SERVER}__${DELEGATE_TOOL_NAME}`

export type KiroshiScope = DelegateScope &
	Pick<AttachScope, "floor"> & { session?: string }

export const kiroshiTools = ({ session, ...scope }: KiroshiScope) => [
	delegateTool(scope),
	...routineTools(session),
	...missionTools(session),
	...applicationTools(session),
	...companionTools(session, scope),
	...bundleTools(session),
]

export const kiroshiServer = (
	scope: KiroshiScope,
): NonNullable<Options["mcpServers"]> => ({
	[KIROSHI_SERVER]: createSdkMcpServer({
		name: KIROSHI_SERVER,
		tools: kiroshiTools(scope),
	}),
})
