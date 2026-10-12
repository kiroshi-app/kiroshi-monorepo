import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { storedOwnAccounts } from "./own-accounts"

import {
	ACCOUNT_CHANGED_EVENT,
	type AccountFailure,
	type AccountState,
	commands,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { listen } from "../host"
import { createStore } from "../store"
import { openInBrowser } from "../links/use-external-links"

type AccountCommand = () => ReturnType<typeof commands.accountSignOut>

export type AccountController = {
	getState: () => AccountState
	subscribe: (listener: () => void) => () => void
	watch: () => () => void
	signIn: () => void
	cancel: () => void
	copySignInLink: () => void
	manageAccount: () => void
	signOut: () => void
	signOutLeaving: (spaceNames: string) => Promise<void>
}

const ACCOUNT_PAGE_URL = "https://kiroshi.app/account"

const SIGNED_OUT: AccountState = { kind: "signedOut", reason: null }

const FAILURE_TITLE_KEYS = {
	expired: "settings:account.failed.timedOut",
	cancelled: "settings:account.failed.serverError",
	unreachable: "settings:account.failed.serverError",
} as const satisfies Record<AccountFailure, string>

const transitionOf = (state: AccountState) => {
	if (state.kind === "failed") return `failed:${state.failure}`
	if (state.kind === "signedOut") return `signedOut:${state.reason}`
	return state.kind
}

const noticeFor = (state: AccountState): NoticeMessage | null => {
	if (state.kind === "unreachable") {
		return {
			title: i18n.t("settings:account.unreachable.title"),
			description: i18n.t("settings:account.unreachable.description"),
		}
	}
	if (state.kind === "failed") {
		return {
			title: i18n.t(FAILURE_TITLE_KEYS[state.failure]),
			description: i18n.t("settings:account.failed.description"),
		}
	}
	if (state.kind === "signedOut" && state.reason === "signedOutOnSite") {
		return {
			title: i18n.t("settings:account.signedOutFromTheSite.title"),
			description: i18n.t("settings:account.signedOutFromTheSite.description"),
		}
	}
	return null
}

const reportFailure = (title: string) =>
	raiseReportedFailure({ title }, { raisedIn: "account-controller" })

const perform = async (command: AccountCommand) => {
	const result = await command()
	if (result.status === "error") {
		throw new Error(result.error.kind)
	}
}

const attempt = (command: AccountCommand, failureTitle: string) => {
	perform(command).catch(() => reportFailure(failureTitle))
}

const writeToClipboard = async (text: string) =>
	navigator.clipboard.writeText(text)

const signOutLeaving = async (spaceNames: string) => {
	await perform(commands.accountSignOut).catch((reason: unknown) => {
		reportFailure(i18n.t("settings:account.signOutFailed"))
		throw reason
	})
	raiseTransientNotice({
		type: "info",
		title: i18n.t("bots:spaces.signOut.notice", { name: spaceNames }),
	})
}

export const createAccountController = (): AccountController => {
	const stateStore = createStore<AccountState>(SIGNED_OUT)

	const show = (next: AccountState) => {
		if (next.kind === "signedIn") storedOwnAccounts.remember(next.id)
		const previous = stateStore.getState()
		stateStore.setState(next)
		if (transitionOf(previous) === transitionOf(next)) {
			return
		}
		const notice = noticeFor(next)
		if (notice) raiseReportedFailure(notice, { raisedIn: "account-controller" })
	}

	const watch = () => {
		let isWatching = true
		let hasHeardChange = false
		const reportReadFailure = () => {
			if (isWatching) reportFailure(i18n.t("settings:account.readFailed"))
		}

		commands.accountState().then((state) => {
			if (isWatching && !hasHeardChange) show(state)
		}, reportReadFailure)
		const detach = listen<AccountState>(
			ACCOUNT_CHANGED_EVENT,
			({ payload }) => {
				hasHeardChange = true
				show(payload)
			},
		).catch(reportReadFailure)

		return () => {
			isWatching = false
			void detach.then((unlisten) => unlisten?.())
		}
	}

	return {
		getState: stateStore.getState,
		subscribe: stateStore.subscribe,
		watch,
		signIn: () =>
			attempt(commands.accountSignIn, i18n.t("settings:account.signInFailed")),
		cancel: () =>
			attempt(commands.accountSignOut, i18n.t("settings:account.cancelFailed")),
		copySignInLink: () => {
			const state = stateStore.getState()
			if (state.kind !== "waiting") return
			writeToClipboard(state.verificationUrl).catch(() =>
				reportFailure(i18n.t("settings:account.copySignInLinkFailed")),
			)
		},
		manageAccount: () => {
			openInBrowser(ACCOUNT_PAGE_URL).catch(() =>
				reportFailure(i18n.t("settings:account.manageAccountFailed")),
			)
		},
		signOut: () =>
			attempt(
				commands.accountSignOut,
				i18n.t("settings:account.signOutFailed"),
			),
		signOutLeaving,
	}
}
