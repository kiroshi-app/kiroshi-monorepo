export type ProviderCapability =
	| "partialMessages"
	| "resume"
	| "interactivePermissions"
	| "modelCatalogue"
	| "toolCatalogue"

export type OfferedModel = {
	value: string
	supportedEffortLevels: string[]
}

export type ServerEnv = {
	base?: Record<string, string>
	perServer?: Record<string, Record<string, string>>
	needsAuthorization?: string[]
	failure?: string
}

export type SessionRequest = {
	session?: string
	cwd: string
	resume?: string
	pluginPath?: string
	agent?: string
	systemPluginPath?: string
	userPluginPath?: string
	spacePluginPath?: string
	identity?: string
	outputStyle?: string
	settingsPath?: string
	appDataDir?: string
	conversationId?: string
	partialMessages: boolean
	serverEnv?: ServerEnv
	connection?: Record<string, string>
	outputSchema?: Record<string, unknown>
	missionThread?: boolean
}

export type PermissionDecision =
	| { behavior: "allow"; updatedInput: Record<string, unknown> }
	| { behavior: "deny"; message: string }

export type SessionFrame = Record<string, unknown>

export type AgentCommand = {
	name: string
	description?: string
}

export type EmitFrame = (frame: SessionFrame) => void

export type AgentSession = {
	prompt: (text: string) => void
	interrupt: () => Promise<void>
	decide: (requestId: string, decision: PermissionDecision) => void
	close: () => Promise<void>
}

export type ProviderAccount = {
	email?: string
	plan?: string
}

export type ProviderAuth = {
	authenticated: boolean
	authMethod?: string
	detail?: string
	account?: ProviderAccount
}

export type SignInFailure = {
	kind: "busy" | "cancelled" | "timedOut" | "failed"
	detail?: string
}

export type SignInAnswer =
	| { signedIn: true }
	| { signedIn: false; error: SignInFailure }

export type AgentProvider = {
	id: string
	version: string
	sdkVersion: string
	capabilities: ProviderCapability[]
	assertReady: () => void
	authenticate: (connection?: Record<string, string>) => Promise<ProviderAuth>
	signIn: (emit: EmitFrame) => Promise<SignInAnswer>
	enterSignInCode: (text: string) => void
	cancelSignIn: () => void
	models: (connection?: Record<string, string>) => Promise<OfferedModel[]>
	tools: (connection?: Record<string, string>) => Promise<string[]>
	title: (
		text: string,
		connection?: Record<string, string>,
	) => Promise<ConversationNaming | null>
	open: (request: SessionRequest, emit: EmitFrame) => Promise<AgentSession>
}

export type ConversationNaming = {
	title: string
	icon: string | null
}

export type StageTarget = {
	directory: string
	targetTriple: string
}

export type ProviderBuild = {
	prepare: () => Promise<void>
	stage: (target: StageTarget) => void
}
