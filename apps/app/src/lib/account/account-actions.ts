import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { type AccountState, commands } from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { openInBrowser } from "../links/use-external-links"

export type AccountCommand = () => ReturnType<typeof commands.accountSignOut>

export const ACCOUNT_RAISED_IN = "use-account"

const ACCOUNT_PAGE_URL = "https://kiroshi.app/account"

const reportFailure = (title: string) =>
	raiseReportedFailure({ title }, { raisedIn: ACCOUNT_RAISED_IN })

export const performAccountCommand = async (command: AccountCommand) => {
	const result = await command()
	if (result.status === "error") {
		throw new Error(result.error.kind)
	}
}

export const readAccountState = (): Promise<AccountState> =>
	commands.accountState()

export const copySignInLinkOf = (state: AccountState | undefined) => () => {
	if (state?.kind !== "waiting") return
	navigator.clipboard.writeText(state.verificationUrl).then(
		() =>
			raiseTransientNotice({
				type: "info",
				title: i18n.t("settings:account.signInLinkCopied"),
			}),
		() => reportFailure(i18n.t("settings:account.copySignInLinkFailed")),
	)
}

export const manageAccount = () => {
	openInBrowser(ACCOUNT_PAGE_URL).catch(() =>
		reportFailure(i18n.t("settings:account.manageAccountFailed")),
	)
}

export const announceSpacesLeft = (spaceNames: string) =>
	raiseTransientNotice({
		type: "info",
		title: i18n.t("bots:spaces.signOut.notice", { name: spaceNames }),
	})
