import { useParams, useRouterState } from "@tanstack/react-router"

export type OpenSettings =
	| { kind: "space"; spaceId: string }
	| { kind: "user" }
	| { kind: "companion"; companionId: string }
	| { kind: "conversation"; conversationId: string }

export const useOpenSettings = (): OpenSettings | null => {
	const routeId = useRouterState({
		select: (state) => state.matches.at(-1)?.routeId,
	})
	const { companionId, conversationId, spaceId } = useParams({ strict: false })
	if (routeId === "/settings/space/$spaceId" && spaceId) {
		return { kind: "space", spaceId }
	}
	if (routeId === "/settings/user") return { kind: "user" }
	if (routeId === "/settings/companion/$companionId" && companionId) {
		return { kind: "companion", companionId }
	}
	if (routeId === "/settings/conversation/$conversationId" && conversationId) {
		return { kind: "conversation", conversationId }
	}
	return null
}

export const openCompanionIdOf = (openSettings: OpenSettings | null) =>
	openSettings?.kind === "companion" ? openSettings.companionId : null

export const openConversationIdOf = (openSettings: OpenSettings | null) =>
	openSettings?.kind === "conversation" ? openSettings.conversationId : null
