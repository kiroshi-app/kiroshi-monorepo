// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	type NoticeMessage,
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { en } from "@workspace/ui/lib/i18n-en"

import { storedOwnAccounts } from "./own-accounts"
import { signOutLeavingOf, useAccount, useWatchedAccount } from "./use-account"

import { ACCOUNT_CHANGED_EVENT, type AccountState, commands } from "../bindings"
import { listen } from "../host"

vi.mock("../host", () => ({ listen: vi.fn() }))

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
	report: expect.objectContaining({ raisedIn: "account-controller" }),
})

const settling = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0))
	})

const mountAccount = async (displayName = PROFILE_NAME) => {
	const mounted = renderHook(
		({ displayName }) => useAccount(useWatchedAccount(), displayName),
		{
			initialProps: { displayName },
		},
	)
	await settling()
	return mounted
}

const announce = (payload: AccountState) =>
	act(() => {
		changes.announce({ payload })
	})

beforeEach(() => {
	vi.mocked(commands.accountState).mockResolvedValue({
		kind: "signedOut",
		reason: null,
	})
	vi.mocked(commands.accountSignIn).mockResolvedValue(OK)
	vi.mocked(commands.accountSignOut).mockResolvedValue(OK)
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
		expect(result.current.account).toEqual(signedInPanel(PROFILE_NAME))
	})

	it("re-renders the panel from the state an account change carries", async () => {
		const { result } = await mountAccount()

		announce(WAITING)

		expect(result.current.account).toEqual({ status: "waiting" })

		announce(SIGNED_IN)

		expect(result.current.account).toEqual(signedInPanel(PROFILE_NAME))
	})

	it("keeps a change heard before the first read lands", async () => {
		let answerRead: (state: AccountState) => void = () => undefined
		vi.mocked(commands.accountState).mockReturnValue(
			new Promise((resolve) => {
				answerRead = resolve
			}),
		)
		const { result } = await mountAccount()

		announce(SIGNED_IN)
		answerRead({ kind: "signedOut", reason: null })
		await settling()

		expect(result.current.account.status).toBe("signedIn")
	})

	it("names a signed-in account after the email when the profile has no name", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)

		const { result } = await mountAccount("")

		expect(result.current.account).toEqual(signedInPanel("ada.martin"))
	})

	it("shows the new profile name when the person renames while signed in", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result, rerender } = await mountAccount()

		rerender({ displayName: "Ada Lovelace" })

		expect(result.current.account).toEqual(signedInPanel("Ada Lovelace"))
		expect(commands.accountState).toHaveBeenCalledOnce()
	})

	it("signs in without an email", async () => {
		const { result } = await mountAccount()

		act(() => result.current.onSignIn(EMAIL))
		await settling()

		expect(commands.accountSignIn).toHaveBeenCalledWith()
		expect(failureNotice).not.toHaveBeenCalled()
	})

	it("signs out when Cancel is pressed while waiting", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(WAITING)
		const { result } = await mountAccount()

		act(() => result.current.onCancel())
		await settling()

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
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
			() => "lea@example.com",
		)
		const { result } = renderHook(() =>
			useAccount(useWatchedAccount(), PROFILE_NAME, leaving),
		)
		await settling()

		act(() => result.current.onSignOut())

		expect(commands.accountSignOut).not.toHaveBeenCalled()
		expect(result.current.signOutConfirmation).toEqual(
			expect.objectContaining({
				open: true,
				title: "Sign out of Kiroshi?",
				description:
					"Studio Nord leaves this Mac until you sign in again. Its conversations stay with lea@example.com.",
				confirmLabel: "Sign out",
			}),
		)

		await act(() => result.current.signOutConfirmation?.onConfirm())

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
		expect(raiseTransientNotice).toHaveBeenCalledWith({
			type: "info",
			title: "Signed out. Studio Nord left this Mac.",
		})
	})

	it("signs out without asking when no relay space is joined", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result } = renderHook(() =>
			useAccount(
				useWatchedAccount(),
				PROFILE_NAME,
				signOutLeavingOf([], () => ""),
			),
		)
		await settling()

		act(() => result.current.onSignOut())
		await settling()

		expect(result.current.signOutConfirmation).toBe(null)
		expect(commands.accountSignOut).toHaveBeenCalledOnce()
	})

	it("signs out when Sign out is pressed", async () => {
		vi.mocked(commands.accountState).mockResolvedValue(SIGNED_IN)
		const { result } = await mountAccount()

		act(() => result.current.onSignOut())
		await settling()

		expect(commands.accountSignOut).toHaveBeenCalledOnce()
	})

	it("raises the unreachable notice once and renders the signed-out panel", async () => {
		const { result, rerender } = await mountAccount()

		announce(WAITING)
		announce({ kind: "unreachable", reason: "offline" })
		rerender({ displayName: PROFILE_NAME })
		announce({ kind: "unreachable", reason: "offline" })
		rerender({ displayName: PROFILE_NAME })

		expect(result.current.account).toEqual({ status: "signedOut" })
		expect(failureNotice).toHaveBeenCalledOnce()
		expect(failureNotice).toHaveBeenCalledWith(reported(COPY.unreachable))
	})

	it.each([
		["expired", "timedOut"],
		["cancelled", "serverError"],
		["unreachable", "serverError"],
	] as const)(
		"raises the %s notice once and renders the signed-out panel",
		async (failure, title) => {
			const { result, rerender } = await mountAccount()

			announce({ kind: "failed", failure })
			rerender({ displayName: PROFILE_NAME })
			rerender({ displayName: PROFILE_NAME })

			expect(result.current.account).toEqual({ status: "signedOut" })
			expect(failureNotice).toHaveBeenCalledOnce()
			expect(failureNotice).toHaveBeenCalledWith(
				reported({
					title: COPY.failed[title],
					description: COPY.failed.description,
				}),
			)
		},
	)

	it("raises the notice again on a new transition into the same failure", async () => {
		await mountAccount()

		announce({ kind: "failed", failure: "expired" })
		announce(WAITING)
		announce({ kind: "failed", failure: "expired" })

		expect(failureNotice).toHaveBeenCalledTimes(2)
	})

	it("names the read that failed when the account state rejects", async () => {
		vi.mocked(commands.accountState).mockRejectedValue(new Error("ipc"))

		const { result } = await mountAccount()

		expect(result.current.account).toEqual({ status: "signedOut" })
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

			act(() => result.current.onSignIn(EMAIL))
			act(() => result.current.onCancel())
			act(() => result.current.onSignOut())
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
