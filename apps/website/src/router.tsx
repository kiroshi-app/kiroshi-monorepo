import {
	createRootRoute,
	createRoute,
	createRouter,
	type ParsedLocation,
	type RouterHistory,
	redirect,
} from "@tanstack/react-router"

import { AppScene } from "./app-scene"
import { LoginLoadFailure, LoginPage } from "./login-page"
import {
	type LoginSearch,
	landingOf,
	validateLoginSearch,
} from "./login-search"
import {
	clearBearer,
	RelayError,
	readAccount,
	readBearer,
	saveBearer,
} from "./relay"
import { WebsitePage } from "./website-page"

const HomePage = () => (
	<WebsitePage>
		<AppScene />
	</WebsitePage>
)

type GuardContext = { location: ParsedLocation }

const requireBearer = ({ location }: GuardContext) => {
	if (readBearer()) return
	throw redirect({ to: "/login", search: { redirect: location.href } })
}

const readSignedInAccount = async () => {
	try {
		return await readAccount()
	} catch (error) {
		if (!(error instanceof RelayError) || error.failure !== "unauthorized") {
			throw error
		}
		clearBearer()
		return null
	}
}

const loadLoginState = async (search: LoginSearch) => {
	if (!readBearer()) return { isSignedIn: false }
	const account = await readSignedInAccount()
	if (!account) return { isSignedIn: false }
	if (account.name) throw redirect({ href: landingOf(search) })
	return { isSignedIn: true }
}

const rootRoute = createRootRoute()

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: HomePage,
})

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/login",
	validateSearch: validateLoginSearch,
	beforeLoad: ({ search }) => {
		if (!search.token) return
		saveBearer(search.token)
		throw redirect({
			to: "/login",
			search: { redirect: search.redirect },
			replace: true,
		})
	},
	loaderDeps: ({ search }) => ({ redirect: search.redirect }),
	loader: ({ deps }) => loadLoginState(deps),
	component: LoginPage,
	errorComponent: LoginLoadFailure,
})

const authorizeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/authorize",
	beforeLoad: requireBearer,
})

const accountRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/account",
	beforeLoad: requireBearer,
})

const routeTree = rootRoute.addChildren([
	homeRoute,
	loginRoute,
	authorizeRoute,
	accountRoute,
])

export const createSiteRouter = (history?: RouterHistory) =>
	createRouter({ routeTree, history })

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createSiteRouter>
	}
}
