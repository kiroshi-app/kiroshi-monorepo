import type { PluginScope } from "../conversations/store-contract"

export const pluginQueryKeys = {
	all: ["plugins"] as const,
	scope: (scope: PluginScope | null) =>
		[...pluginQueryKeys.all, scope] as const,
	skills: (scope: PluginScope | null) =>
		[...pluginQueryKeys.scope(scope), "skills"] as const,
	history: (scope: PluginScope | null) =>
		[...pluginQueryKeys.scope(scope), "history"] as const,
}
