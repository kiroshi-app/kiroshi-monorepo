import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router"

import { ConversationsScreen } from "@/components/conversations-screen"
import { WorkspaceLayout } from "@/components/workspace-layout"
import {
	CompanionSettingsRoute,
	SpaceSettingsRoute,
	UserSettingsRoute,
} from "@/components/workspace-settings"
import {
	validateCompanionSettingsSearch,
	validateSettingsSearch,
} from "@/lib/navigation/settings-search"

const rootRoute = createRootRoute({ component: WorkspaceLayout })

const conversationsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: ConversationsScreen,
})

const spaceSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings/space",
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

const routeTree = rootRoute.addChildren([
	conversationsRoute,
	spaceSettingsRoute,
	userSettingsRoute,
	companionSettingsRoute,
])

export const createWorkspaceRouter = () =>
	createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	})

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createWorkspaceRouter>
	}
}
