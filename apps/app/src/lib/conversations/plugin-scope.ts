import type { EnvOwner, PluginScope } from "./store-contract"

export const USER_PLUGIN: PluginScope = { kind: "user" }

export const spacePlugin = (id: string): PluginScope => ({ kind: "space", id })

export const botPlugin = (id: string): PluginScope => ({ kind: "bot", id })

export const pluginScopeOf = (owner: EnvOwner): PluginScope =>
	owner.kind === "user" ? USER_PLUGIN : { kind: owner.kind, id: owner.id }
