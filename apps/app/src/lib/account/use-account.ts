import { useCallback, useEffect, useState } from "react"

import type { ConfirmDialogProps } from "@workspace/ui/components/confirm-dialog"
import type {
	AccountPanelProps,
	AccountState as AccountPanelState,
} from "@workspace/ui/components/user-settings-dialog/account-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	type AccountController,
	createAccountController,
} from "./account-controller"

import type { AccountState, JoinedSpace } from "../bindings"
import { useController } from "../use-controller"

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
	hostEmails: string
}

type Account = AccountPanelProps & {
	signOutConfirmation: ConfirmDialogProps | null
}

const listed = (values: string[]) =>
	new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(values)

export const signOutLeavingOf = (
	relaySpaces: JoinedSpace[],
	hostEmailOf: (id: string) => string,
): SignOutLeaving | null => {
	if (relaySpaces.length === 0) {
		return null
	}
	const hostEmails = relaySpaces.map((joined) => hostEmailOf(joined.id))
	return {
		spaceNames: listed(relaySpaces.map((joined) => joined.name)),
		hostEmails: listed([...new Set(hostEmails)].filter(Boolean)),
	}
}

const signOutConfirmationOf = (
	leaving: SignOutLeaving,
	controller: AccountController,
	isOpen: boolean,
	onOpenChange: (isOpen: boolean) => void,
): ConfirmDialogProps => ({
	open: isOpen,
	onOpenChange,
	title: i18n.t("bots:spaces.signOut.title"),
	description: i18n.t("bots:spaces.signOut.description", {
		name: leaving.spaceNames,
		email: leaving.hostEmails,
	}),
	confirmLabel: i18n.t("bots:spaces.signOut.confirm"),
	onConfirm: () => controller.signOutLeaving(leaving.spaceNames),
})

export type WatchedAccount = {
	state: AccountState
	controller: AccountController
}

export const useWatchedAccount = (): WatchedAccount => {
	const watched = useController(createAccountController)
	const { controller } = watched

	useEffect(() => controller.watch(), [controller])

	return watched
}

export const signedInAccountIdOf = (state: AccountState): string | null =>
	state.kind === "signedIn" ? state.id : null

export const useSignedInAccountId = ({
	controller,
}: WatchedAccount): (() => string | null) =>
	useCallback(() => signedInAccountIdOf(controller.getState()), [controller])

export const useAccount = (
	{ state, controller }: WatchedAccount,
	displayName: string,
	leaving: SignOutLeaving | null = null,
): Account => {
	const [isSignOutAsked, setSignOutAsked] = useState(false)

	return {
		account: toPanelState(state, displayName),
		onSignIn: controller.signIn,
		onCancel: controller.cancel,
		onCopySignInLink: controller.copySignInLink,
		onManageAccount: controller.manageAccount,
		onSignOut: leaving ? () => setSignOutAsked(true) : controller.signOut,
		signOutConfirmation:
			leaving &&
			signOutConfirmationOf(
				leaving,
				controller,
				isSignOutAsked,
				setSignOutAsked,
			),
	}
}
