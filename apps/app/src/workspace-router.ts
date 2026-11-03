import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
} from "@tanstack/react-router"

import { ConversationsScreen } from "@/components/conversations-screen"
import { LibraryRoute } from "@/components/library-route"
import { WorkspaceLayout } from "@/components/workspace-layout"
import {
	CompanionSettingsRoute,
	ConversationSettingsRoute,
	SpaceSettingsRoute,
	UserSettingsRoute,
} from "@/components/workspace-settings"
import { validateLibrarySearch } from "@/lib/navigation/library-search"
import {
	validateCompanionSettingsSearch,
	validateSettingsSearch,
} from "@/lib/navigation/settings-search"
import { validateThreadSearch } from "@/lib/navigation/thread-search"
import {
	createWorkspaceTabs,
	type WorkspaceTabs,
} from "@/lib/tabs/workspace-tabs"

type WorkspaceRouterContext = {
	tabs: WorkspaceTabs
}

const rootRoute = createRootRouteWithContext<WorkspaceRouterContext>()({
	component: WorkspaceLayout,
})

const conversationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	validateSearch: validateThreadSearch,
	component: ConversationsScreen,
})

const libraryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/library",
	validateSearch: validateLibrarySearch,
	component: LibraryRoute,
})

const spaceSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/space/$spaceId",
	validateSearch: validateSettingsSearch,
	component: SpaceSettingsRoute,
})

const userSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/user",
	validateSearch: validateSettingsSearch,
	component: UserSettingsRoute,
})

const companionSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/companion/$companionId",
	validateSearch: validateCompanionSettingsSearch,
	component: CompanionSettingsRoute,
})

const conversationSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/conversation/$conversationId",
	validateSearch: validateSettingsSearch,
	component: ConversationSettingsRoute,
})

const routeTree = rootRoute.addChildren([
	conversationsRoute,
	libraryRoute,
	spaceSettingsRoute,
	userSettingsRoute,
	companionSettingsRoute,
	conversationSettingsRoute,
])

export const createWorkspaceRouter = (tabs = createWorkspaceTabs()) =>
	createRouter({ routeTree, history: tabs.history, context: { tabs } })

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createWorkspaceRouter>
	}
}
