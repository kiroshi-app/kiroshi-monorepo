import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"

import type { ConfirmDialogProps } from "@workspace/ui/components/confirm-dialog"
import type {
	AccountPanelProps,
	AccountState as AccountPanelState,
} from "@workspace/ui/components/user-settings-dialog/account-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	ACCOUNT_RAISED_IN,
	type AccountCommand,
	announceSpacesLeft,
	copySignInLinkOf,
	manageAccount,
	performAccountCommand,
	readAccountState,
} from "./account-actions"
import { accountQueryKeys } from "./account-query-keys"
import { transitionNoticeOf, transitionOf } from "./account-transitions"

import {
	ACCOUNT_CHANGED_EVENT,
	type AccountState,
	commands,
	type JoinedSpace,
} from "../bindings"
import { raiseReportedFailure } from "../failure-report"
import { useInvalidateOnHostEvent } from "../query/host-invalidations"

const SIGNED_OUT: AccountState = { kind: "signedOut", reason: null }

const UNREAD_ACCOUNT: AccountPanelState = { status: "signedOut" }

type AccountCommandFailure =
	| "settings:account.signInFailed"
	| "settings:account.cancelFailed"
	| "settings:account.signOutFailed"

const localPartOf = (email: string) => {
	const [localPart = email] = email.split("@")
	return localPart
}

const toPanelState = (
	state: AccountState,
	displayName: string,
): AccountPanelState => {
	if (state.kind === "signedIn") {
		return {
			status: "signedIn",
			name: displayName || localPartOf(state.email),
			email: state.email,
			plan: state.plan,
		}
	}
	if (state.kind === "waiting") {
		return { status: "waiting" }
	}
	return { status: "signedOut" }
}

export type SignOutLeaving = {
	spaceNames: string
	hostNames: string
}

type AccountSettings = {
	panel: AccountPanelProps
	signOutConfirmation: ConfirmDialogProps | null
}

const listed = (values: string[]) =>
	new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(values)

export const signOutLeavingOf = (
	relaySpaces: JoinedSpace[],
	hostNameOf: (id: string) => string,
): SignOutLeaving | null => {
	if (relaySpaces.length === 0) {
		return null
	}
	const hostNames = relaySpaces.map((joined) => hostNameOf(joined.id))
	return {
		spaceNames: listed(relaySpaces.map((joined) => joined.name)),
		hostNames: listed([...new Set(hostNames)]),
	}
}

const signOutConfirmationOf = (
	leaving: SignOutLeaving,
	signOut: () => Promise<void>,
	isOpen: boolean,
	onOpenChange: (isOpen: boolean) => void,
): ConfirmDialogProps => ({
	open: isOpen,
	onOpenChange,
	title: i18n.t("bots:spaces.signOut.title"),
	description: i18n.t("bots:spaces.signOut.description", {
		name: leaving.spaceNames,
		host: leaving.hostNames,
	}),
	confirmLabel: i18n.t("bots:spaces.signOut.confirm"),
	onConfirm: signOut,
})

export type WatchedAccount = {
	state: AccountState | undefined
	isPending: boolean
}

const useTransitionNotices = (state: AccountState | undefined) => {
	const transition = state && transitionOf(state)

	useEffect(() => {
		const notice = transition && transitionNoticeOf(transition)
		if (notice) raiseReportedFailure(notice, { raisedIn: ACCOUNT_RAISED_IN })
	}, [transition])
}

export const useWatchedAccount = (): WatchedAccount => {
	const { data, isError, isPending } = useQuery({
		queryKey: accountQueryKeys.state(),
		queryFn: readAccountState,
		meta: {
			failureNotice: () => ({ title: i18n.t("settings:account.readFailed") }),
			raisedIn: ACCOUNT_RAISED_IN,
		},
	})
	useInvalidateOnHostEvent(ACCOUNT_CHANGED_EVENT, [accountQueryKeys.state()])

	const state = data ?? (isError ? SIGNED_OUT : undefined)
	useTransitionNotices(state)

	return { state, isPending }
}

export const signedInAccountIdOf = (
	state: AccountState | undefined,
): string | null => (state?.kind === "signedIn" ? state.id : null)

export const useSignedInAccountId = (): (() => string | null) => {
	const queryClient = useQueryClient()

	return useCallback(
		() =>
			signedInAccountIdOf(
				queryClient.getQueryData<AccountState>(accountQueryKeys.state()),
			),
		[queryClient],
	)
}

const useAccountCommand = (
	command: AccountCommand,
	failure: AccountCommandFailure,
) =>
	useMutation({
		mutationFn: () => performAccountCommand(command),
		meta: {
			failureNotice: () => ({ title: i18n.t(failure) }),
			raisedIn: ACCOUNT_RAISED_IN,
		},
	})

export const useAccount = (
	{ state }: WatchedAccount,
	displayName: string,
	leaving: SignOutLeaving | null = null,
): AccountSettings => {
	const [isSignOutAsked, setSignOutAsked] = useState(false)
	const signIn = useAccountCommand(
		commands.accountSignIn,
		"settings:account.signInFailed",
	)
	const cancel = useAccountCommand(
		commands.accountSignOut,
		"settings:account.cancelFailed",
	)
	const signOut = useAccountCommand(
		commands.accountSignOut,
		"settings:account.signOutFailed",
	)

	const signOutLeaving = (spaceNames: string) => () =>
		signOut.mutateAsync(undefined, {
			onSuccess: () => announceSpacesLeft(spaceNames),
		})

	return {
		panel: {
			account: state ? toPanelState(state, displayName) : UNREAD_ACCOUNT,
			isPending: state === undefined,
			onSignIn: () => signIn.mutate(),
			onCancel: () => cancel.mutate(),
			onCopySignInLink: copySignInLinkOf(state),
			onManageAccount: manageAccount,
			onSignOut: leaving ? () => setSignOutAsked(true) : () => signOut.mutate(),
		},
		signOutConfirmation:
			leaving &&
			signOutConfirmationOf(
				leaving,
				signOutLeaving(leaving.spaceNames),
				isSignOutAsked,
				setSignOutAsked,
			),
	}
}
