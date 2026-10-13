import {
	createRootRoute,
	createRoute,
	createRouter,
	type ParsedLocation,
	type RouterHistory,
	redirect,
} from "@tanstack/react-router"

import { AccountPage } from "./account-page"
import { loadAccountState } from "./account-state"
import { AppScene } from "./app-scene"
import { AuthorizeDonePage, AuthorizePage } from "./authorize-page"
import {
	loadAuthorizeState,
	loadDoneState,
	requireAuthorizeBearer,
	validateAuthorizeSearch,
} from "./authorize-state"
import { LoginLoadFailure, LoginPage } from "./login-page"
import {
	type LoginSearch,
	landingOf,
	SOCIAL_RETURN,
	validateLoginSearch,
} from "./login-search"
import {
	clearBearer,
	RelayError,
	readAccount,
	readBearer,
	readSessionBearer,
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

type LoginState = { unnamedEmail: string | null }

const SIGNED_OUT: LoginState = { unnamedEmail: null }

const loadLoginState = async (search: LoginSearch): Promise<LoginState> => {
	if (!readBearer()) return SIGNED_OUT
	const account = await readSignedInAccount()
	if (!account) return SIGNED_OUT
	if (account.isNamed) throw redirect({ href: landingOf(search) })
	return { unnamedEmail: account.email }
}

const NO_SOCIAL_SESSION = "no-session"

type LoginGuardContext = { search: LoginSearch }

const finishSocialSignIn = async ({ search }: LoginGuardContext) => {
	if (search.via !== SOCIAL_RETURN) return
	const bearer = await readSessionBearer()
	if (!bearer) {
		throw redirect({
			to: "/login",
			search: { redirect: search.redirect, error: NO_SOCIAL_SESSION },
			replace: true,
		})
	}
	saveBearer(bearer)
	throw redirect({
		to: "/login",
		search: { redirect: search.redirect },
		replace: true,
	})
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
	beforeLoad: finishSocialSignIn,
	loaderDeps: ({ search }) => ({ redirect: search.redirect }),
	loader: ({ deps }) => loadLoginState(deps),
	component: LoginPage,
	errorComponent: LoginLoadFailure,
})

const authorizeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/authorize",
	validateSearch: validateAuthorizeSearch,
	beforeLoad: requireAuthorizeBearer,
	loaderDeps: ({ search }) => ({ request: search.request }),
	loader: ({ deps, location }) =>
		loadAuthorizeState({ request: deps.request, href: location.href }),
	gcTime: 0,
	component: AuthorizePage,
	errorComponent: LoginLoadFailure,
})

const authorizeDoneRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/authorize/done",
	validateSearch: validateAuthorizeSearch,
	beforeLoad: requireBearer,
	loaderDeps: ({ search }) => ({ request: search.request }),
	loader: ({ deps, location }) =>
		loadDoneState({ request: deps.request, href: location.href }),
	component: AuthorizeDonePage,
	errorComponent: LoginLoadFailure,
})

const accountRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/account",
	beforeLoad: requireBearer,
	loader: ({ location }) => loadAccountState(location.href),
	component: AccountPage,
	errorComponent: LoginLoadFailure,
})

const routeTree = rootRoute.addChildren([
	homeRoute,
	loginRoute,
	authorizeRoute,
	authorizeDoneRoute,
	accountRoute,
])

export const createSiteRouter = (history?: RouterHistory) =>
	createRouter({ routeTree, history })

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createSiteRouter>
	}
}
