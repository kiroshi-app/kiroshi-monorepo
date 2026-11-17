import {
	createRootRouteWithContext,
	createRoute,
	createRouter,
	redirect,
} from "@tanstack/react-router"

import { AgentsRoute } from "@/components/agents-route"
import { ConversationsScreen } from "@/components/conversations-screen"
import { HomeRoute } from "@/components/home-route"
import { LibraryRoute } from "@/components/library-route"
import { MissionsRoute } from "@/components/missions-route"
import { WorkspaceLayout } from "@/components/workspace-layout"
import {
	CompanionSettingsRoute,
	ConversationSettingsRoute,
	SpaceSettingsRoute,
	UserSettingsRoute,
} from "@/components/workspace-settings"
import { validateLibrarySearch } from "@/lib/navigation/library-search"
import {
	FORMER_AGENTS_ENTRY,
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

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/home",
	component: HomeRoute,
})

const libraryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/library",
	validateSearch: validateLibrarySearch,
	component: LibraryRoute,
})

const agentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agents",
	component: AgentsRoute,
})

const missionsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/missions",
	component: MissionsRoute,
})

const spaceSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/space/$spaceId",
	validateSearch: validateSettingsSearch,
	beforeLoad: ({ search }) => {
		if (search.entry === FORMER_AGENTS_ENTRY) {
			throw redirect({ to: "/agents", replace: true })
		}
	},
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
	homeRoute,
	libraryRoute,
	agentsRoute,
	missionsRoute,
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
