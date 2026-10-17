// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { en } from "@workspace/ui/lib/i18n-en"

import { accountQueryKeys } from "./account-query-keys"
import { storedOwnAccounts } from "./own-accounts"
import {
	signOutLeavingOf,
	useAccount,
	useWatchedAccount,
	type WatchedAccount,
} from "./use-account"

import { ACCOUNT_CHANGED_EVENT, type AccountState, commands } from "../bindings"
import { listen } from "../host"
import { openInBrowser } from "../links/use-external-links"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({ listen: vi.fn() }))

vi.mock("../links/use-external-links", () => ({ openInBrowser: vi.fn() }))

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: {
		accountState: vi.fn(),
		accountSignIn: vi.fn(),
		accountSignOut: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
	raiseTransientNotice: vi.fn(),
}))

const EMAIL = "ada.martin@example.com"

const PROFILE_NAME = "Ada Martin"

const SIGNED_IN: AccountState = {
	kind: "signedIn",
	id: "account-1",
	email: EMAIL,
	createdAt: "2026-10-01T00:00:00Z",
	plan: "pro",
}

const WAITING: AccountState = {
	kind: "waiting",
	verificationUrl: "https://kiroshi.app/authorize?request=request-1",
	expiresAt: "2026-10-12T10:10:00.000Z",
}

const COPY = en.settings.account

const ACCOUNT_PAGE_URL = "https://kiroshi.app/account"

const SIGNED_OUT_ON_SITE: AccountState = {
	kind: "signedOut",
	reason: "signedOutOnSite",
}

const signedInPanel = (name: string) => ({
	status: "signedIn",
	name,
	email: EMAIL,
	plan: SIGNED_IN.plan,
})

const OK = { status: "ok", data: null } as const

const STORE_ERROR = {
	status: "error",
	error: { kind: "store", detail: "locked" },
} as const

type ChangeHandler = (event: { payload: AccountState }) => void

const changes: { announce: ChangeHandler } = { announce: () => undefined }

const unlisten = vi.fn()

const failureNotice = vi.mocked(raiseFailureNotice)

const reported = (notice: NoticeMessage) => ({
	...notice,
	report: expect.objectContaining({
		context: expect.objectContaining({ raisedIn: "use-account" }),
	}),
})

const settling = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})

const untilAnswered = async (result: {
	current: ReturnType<typeof useAccount>
}) => {
	await waitFor(() => expect(result.current.panel.isPending).toBe(false))
	await settling()
}

const mountAccount = async (displayName = PROFILE_NAME) => {
	const mounted = renderHook(
		({ displayName }) => useAccount(useWatchedAccount(), displayName),
		{
			initialProps: { displayName },
			wrapper: createQueryTestWrapper().wrapper,
		},
	)
	await untilAnswered(mounted.result)
	return mounted
}

const announce = async (payload: AccountState) => {
	const readsSoFar = vi.mocked(commands.accountState).mock.calls.length
	vi.mocked(commands.accountState).mockResolvedValue(payload)
	act(() => {
		changes.announce({ payload })
	})
	await waitFor(() =>
		expect(commands.accountState).toHaveBeenCalledTimes(readsSoFar + 1),
	)
	await settling()
}

beforeEach(() => {
	vi.mocked(commands.accountState).mockResolvedValue({
		kind: "signedOut",
		reason: null,
	})
	vi.mocked(commands.accountSignIn).mockResolvedValue(OK)
	vi.mocked(commands.accountSignOut).mockResolvedValue(OK)
	vi.mocked(openInBrowser).mockResolvedValue()
	vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		if (event === ACCOUNT_CHANGED_EVENT) {
			changes.announce = handler as unknown as ChangeHandler
		}
		return unlisten
	})
})

afterEach(async () => {
	cleanup()
	await settling()
	vi.clearAllMocks()
})

describe("useAccount", () => {
	it("remembers the signed-in account on this device", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)

		await mountAccount()

		expect(storedOwnAccounts.list()).toContain(SIGNED_IN.id)
	})

	it("renders the panel from the account state read on mount", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)

		const { result } = await mountAccount()

		expect(commands.accountState).toHaveBeenCalledOnce()
		expect(result.current.panel?.account).toEqual(signedInPanel(PROFILE_NAME))
	})

	it("re-renders the panel from the state an account change carries", async () => {
		const { result } = await mountAccount()

		await announce(WAITING)

		expect(result.current.panel?.account).toEqual({ status: "waiting" })

		await announce(SIGNED_IN)

		expect(result.current.panel?.account).toEqual(signedInPanel(PROFILE_NAME))
	})

	it("keeps a change heard before the first read lands", async () => {
		let answerFirstRead: (state: AccountState) => void = () => undefined
		vi.mocked(commands.accountState).mockReturnValueOnce(
			new Promise((resolve) => {
				answerFirstRead = resolve
			}),
		)
		const { result } = renderHook(
			() => useAccount(useWatchedAccount(), PROFILE_NAME),
			{ wrapper: createQueryTestWrapper().wrapper },
		)

		await announce(SIGNED_IN)
		answerFirstRead({ kind: "signedOut", reason: null })
		await settling()

		expect(result.current.panel?.account.status).toBe("signedIn")
	})

	it("holds the account card pending, never signed out, until the first read lands", async () => {
		vi.mocked(commands.accountState).mockReturnValue(
			new Promise(() => undefined),
		)
		const { result } = renderHook(
			(): [WatchedAccount, ReturnType<typeof useAccount>] => {
				const watched = useWatchedAccount()
				return [watched, useAccount(watched, PROFILE_NAME)]
			},
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await settling()

		const [watched, settings] = result.current
		expect(watched).toEqual({ state: undefined, isPending: true })
		expect(settings.panel.isPending).toBe(true)
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("renders the account it already holds at once while it reads again", () => {
		vi.mocked(commands.accountState).mockReturnValue(
			new Promise(() => undefined),
		)
		const { queryClient, wrapper } = createQueryTestWrapper()
		queryClient.setQueryData(accountQueryKeys.state(), SIGNED_IN)

		const { result } = renderHook(
			() => useAccount(useWatchedAccount(), PROFILE_NAME),
			{ wrapper },
		)

		expect(result.current.panel.isPending).toBe(false)
		expect(result.current.panel.account).toEqual(signedInPanel(PROFILE_NAME))
	})

	it("reads the account again each time the host announces a change", async () => {
		await mountAccount()

		await announce(WAITING)
		await announce(SIGNED_IN)

		expect(commands.accountState).toHaveBeenCalledTimes(3)
	})

	it("names a signed-in account after the email when the profile has no name", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)

		const { result } = await mountAccount("")

		expect(result.current.panel?.account).toEqual(signedInPanel("ada.martin"))
	})

	it("shows the new profile name when the person renames while signed in", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result, rerender } = await mountAccount()

		rerender({ displayName: "Ada Lovelace" })

		expect(result.current.panel?.account).toEqual(signedInPanel("Ada Lovelace"))
		expect(commands.accountState).toHaveBeenCalledOnce()
	})

	it("signs in without an email", async () => {
		const { result } = await mountAccount()

		act(() => result.current.panel?.onSignIn())
		await settling()

		expect(commands.accountSignIn).toHaveBeenCalledWith()
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("signs out when Cancel is pressed while waiting", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(WAITING)
		const { result } = await mountAccount()

		act(() => result.current.panel?.onCancel())
		await settling()

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
	})

	it("copies the sign-in link of the wait when Copy the sign-in link is pressed", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(WAITING)
		const { result } = await mountAccount()

		act(() => result.current.panel?.onCopySignInLink())
		await settling()

		expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
			WAITING.verificationUrl,
		)
		expect(raiseTransientNotice).toHaveBeenCalledExactlyOnceWith({
			type: "info",
			title: COPY.signInLinkCopied,
		})
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("copies nothing and raises no notice when Copy the sign-in link is pressed outside a wait", async () => {
		const { result } = await mountAccount()

		act(() => result.current.panel?.onCopySignInLink())
		await settling()

		expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
		expect(raiseTransientNotice).not.toHaveBeenCalled()
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("opens the account page on kiroshi.app when Manage account is pressed", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result } = await mountAccount()

		act(() => result.current.panel?.onManageAccount())
		await settling()

		expect(openInBrowser).toHaveBeenCalledExactlyOnceWith(ACCOUNT_PAGE_URL)
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("names what failed when the account page or the sign-in link cannot be reached", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(WAITING)
		vi.mocked(openInBrowser).mockRejectedValue(new Error("opener"))
		vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
			new Error("denied"),
		)
		const { result } = await mountAccount()

		act(() => result.current.panel?.onCopySignInLink())
		act(() => result.current.panel?.onManageAccount())
		await settling()

		expect(failureNotice).toHaveBeenCalledTimes(2)
		expect(failureNotice).toHaveBeenCalledWith(
			reported({ title: COPY.copySignInLinkFailed }),
		)
		expect(failureNotice).toHaveBeenCalledWith(
			reported({ title: COPY.manageAccountFailed }),
		)
		expect(raiseTransientNotice).not.toHaveBeenCalled()
	})

	it("asks before signing out of a joined relay space, then signs out and raises the notice", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const leaving = signOutLeavingOf(
			[
				{
					id: "joined-studio",
					hostUrl: "wss://cloud.kiroshi.test/instances/studio/relay/member",
					remoteSpaceId: "studio",
					name: "Studio Nord",
				},
			],
			() => "Lea",
		)
		const { result } = renderHook(
			() => useAccount(useWatchedAccount(), PROFILE_NAME, leaving),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await untilAnswered(result)

		act(() => result.current.panel?.onSignOut())

		expect(commands.accountSignOut).not.toHaveBeenCalled()
		expect(result.current.signOutConfirmation).toEqual(
			expect.objectContaining({
				open: true,
				title: "Sign out of Kiroshi?",
				description:
					"Studio Nord leaves this computer until you sign in again. Its conversations stay with Lea.",
				confirmLabel: "Sign out",
			}),
		)

		await act(() => result.current.signOutConfirmation?.onConfirm())

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
		expect(raiseTransientNotice).toHaveBeenCalledWith({
			type: "info",
			title: "Signed out. Studio Nord left this computer.",
		})
	})

	it("signs out without asking when no relay space is joined", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result } = renderHook(
			() =>
				useAccount(
					useWatchedAccount(),
					PROFILE_NAME,
					signOutLeavingOf([], () => ""),
				),
			{ wrapper: createQueryTestWrapper().wrapper },
		)
		await untilAnswered(result)

		act(() => result.current.panel?.onSignOut())
		await settling()

		expect(result.current.signOutConfirmation).toBe(null)
		expect(commands.accountSignOut).toHaveBeenCalledOnce()
	})

	it("signs out when Sign out is pressed", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result } = await mountAccount()

		act(() => result.current.panel?.onSignOut())
		await settling()

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
	})

	it("raises the unreachable notice once and renders the signed-out panel", async () => {
		const { result, rerender } = await mountAccount()

		await announce(WAITING)
		await announce({ kind: "unreachable", reason: "offline" })
		rerender({ displayName: PROFILE_NAME })
		await announce({ kind: "unreachable", reason: "offline" })
		rerender({ displayName: PROFILE_NAME })

		expect(result.current.panel?.account).toEqual({ status: "signedOut" })
		expect(failureNotice).toHaveBeenCalledOnce()
		expect(failureNotice).toHaveBeenCalledWith(reported(COPY.unreachable))
	})

	it.each([
		[
			"expired",
			{ title: COPY.failed.timedOut, description: COPY.failed.description },
		],
		[
			"cancelled",
			{ title: COPY.failed.cancelled, description: COPY.failed.description },
		],
		["unreachable", COPY.unreachable],
	] as const)(
		"raises the %s notice once and renders the signed-out panel",
		async (failure, notice) => {
			const { result, rerender } = await mountAccount()

			await announce({ kind: "failed", failure })
			rerender({ displayName: PROFILE_NAME })
			await announce({ kind: "failed", failure })
			rerender({ displayName: PROFILE_NAME })

			expect(result.current.panel?.account).toEqual({ status: "signedOut" })
			expect(failureNotice).toHaveBeenCalledExactlyOnceWith(reported(notice))
		},
	)

	it("raises the signed out on the site notice once per transition", async () => {
		const { result, rerender } = await mountAccount()

		await announce(SIGNED_IN)
		await announce(SIGNED_OUT_ON_SITE)
		rerender({ displayName: PROFILE_NAME })
		await announce(SIGNED_OUT_ON_SITE)

		expect(result.current.panel?.account).toEqual({ status: "signedOut" })
		expect(failureNotice).toHaveBeenCalledExactlyOnceWith(
			reported(COPY.signedOutFromTheSite),
		)

		await announce(SIGNED_IN)
		await announce(SIGNED_OUT_ON_SITE)

		expect(failureNotice).toHaveBeenCalledTimes(2)
	})

	it("raises the device revoked notice when another account takes this computer", async () => {
		await mountAccount()

		await announce(SIGNED_IN)
		await announce({ kind: "signedOut", reason: "deviceRevoked" })

		expect(failureNotice).toHaveBeenCalledExactlyOnceWith(
			reported({
				title: "This computer is now signed in to another Kiroshi account.",
				description: "Sign in again to use it here.",
			}),
		)
	})

	it("raises no notice when the account signs out without a reason", async () => {
		await mountAccount()

		await announce(SIGNED_IN)
		await announce({ kind: "signedOut", reason: null })
		await announce(SIGNED_OUT_ON_SITE)
		await announce({ kind: "signedOut", reason: null })

		expect(failureNotice).toHaveBeenCalledOnce()
	})

	it("raises the notice again on a new transition into the same failure", async () => {
		await mountAccount()

		await announce({ kind: "failed", failure: "expired" })
		await announce(WAITING)
		await announce({ kind: "failed", failure: "expired" })

		expect(failureNotice).toHaveBeenCalledTimes(2)
	})

	it("names the read that failed when the account state rejects", async () => {
		vi.mocked(commands.accountState).mockRejectedValue(new Error("ipc"))

		const { result } = await mountAccount()

		expect(result.current.panel.isPending).toBe(false)
		expect(result.current.panel.account).toEqual({ status: "signedOut" })
		expect(failureNotice).toHaveBeenCalledWith(
			reported({ title: COPY.readFailed }),
		)
	})

	it.each([
		["rejects", () => Promise.reject(new Error("ipc"))],
		["returns an error", () => Promise.resolve(STORE_ERROR)],
	] as const)(
		"names each action that failed when the command %s",
		async (_, outcome) => {
			vi.mocked(commands.accountSignIn).mockImplementation(outcome)
			vi.mocked(commands.accountSignOut).mockImplementation(outcome)
			const { result } = await mountAccount()

			act(() => result.current.panel?.onSignIn())
			act(() => result.current.panel?.onCancel())
			act(() => result.current.panel?.onSignOut())
			await settling()

			expect(failureNotice.mock.calls).toEqual([
				[reported({ title: COPY.signInFailed })],
				[reported({ title: COPY.cancelFailed })],
				[reported({ title: COPY.signOutFailed })],
			])
		},
	)

	it("stops listening to account changes on unmount", async () => {
		const { unmount } = await mountAccount()

		unmount()
		await settling()

		expect(unlisten).toHaveBeenCalledOnce()
	})
})
