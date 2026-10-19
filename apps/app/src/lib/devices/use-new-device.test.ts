// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { en } from "@workspace/ui/lib/i18n-en"

import { useNewDevice } from "./use-new-device"

import {
	type AccountState,
	commands,
	DEVICE_APPROVAL_CHANGED_EVENT,
	type DeviceApproval,
	type DeviceError,
} from "../bindings"
import { listen } from "../host"
import type { WatchedAccount } from "../account/use-account"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({ listen: vi.fn() }))

vi.mock("../links/use-external-links", () => ({ openInBrowser: vi.fn() }))

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: {
		accountSignIn: vi.fn(),
		accountSignOut: vi.fn(),
		getDeviceIdentity: vi.fn(),
		deviceApproval: vi.fn(),
		deviceApprovalRetry: vi.fn(),
		deviceApprovalCodeRequest: vi.fn(),
		deviceApprovalCodeSubmit: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
	raiseTransientNotice: vi.fn(),
}))

const EMAIL = "noa@example.com"

const SIGNED_IN: AccountState = {
	kind: "signedIn",
	id: "account-1",
	email: EMAIL,
	createdAt: "2026-10-01T00:00:00Z",
	plan: "pro",
}

const REFUSED: AccountState = { kind: "signedOut", reason: "deviceRefused" }

const PENDING: DeviceApproval = {
	kind: "pending",
	expiresAt: "2026-10-19T12:30:00Z",
}

const ASKED_AGAIN: DeviceApproval = {
	kind: "pending",
	expiresAt: "2026-10-19T13:30:00Z",
}

const EXPIRED: DeviceApproval = { kind: "expired" }

const APPROVED: DeviceApproval = { kind: "approved" }

const FINGERPRINT = ["ocean", "violin", "parade", "lunch", "eagle", "pencil"]

const OK = { status: "ok", data: null } as const

const refused = (error: DeviceError) => ({ status: "error", error }) as const

const handlers = new Map<string, () => void>()

const watching = (state: AccountState): WatchedAccount => ({
	state,
	isPending: false,
})

type Props = { watched: WatchedAccount }

const mountNewDevice = async (state: AccountState = SIGNED_IN) => {
	const mounted = renderHook(({ watched }: Props) => useNewDevice(watched), {
		initialProps: { watched: watching(state) },
		wrapper: createQueryTestWrapper().wrapper,
	})
	await waitFor(() => expect(commands.deviceApproval).toHaveBeenCalled())
	return mounted
}

const approvalTurns = async (next: DeviceApproval) => {
	const readsSoFar = vi.mocked(commands.deviceApproval).mock.calls.length
	vi.mocked(commands.deviceApproval).mockResolvedValue(next)
	act(() => handlers.get(DEVICE_APPROVAL_CHANGED_EVENT)?.())
	await waitFor(() =>
		expect(commands.deviceApproval).toHaveBeenCalledTimes(readsSoFar + 1),
	)
}

const failureTitles = () =>
	vi.mocked(raiseFailureNotice).mock.calls.map(([notice]) => notice.title)

beforeEach(() => {
	vi.mocked(commands.deviceApproval).mockResolvedValue(PENDING)
	vi.mocked(commands.getDeviceIdentity).mockResolvedValue({
		status: "ok",
		data: {
			deviceId: "this-mac",
			signingPublicKey: "signing",
			agreementPublicKey: "agreement",
			fingerprint: FINGERPRINT,
		},
	})
	vi.mocked(commands.deviceApprovalRetry).mockResolvedValue({
		status: "ok",
		data: ASKED_AGAIN,
	})
	vi.mocked(commands.deviceApprovalCodeRequest).mockResolvedValue(OK)
	vi.mocked(commands.deviceApprovalCodeSubmit).mockResolvedValue(OK)
	vi.mocked(commands.accountSignIn).mockResolvedValue(OK)
	vi.mocked(commands.accountSignOut).mockResolvedValue(OK)
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		handlers.set(event, () => handler({ payload: null } as never, null))
		return () => handlers.delete(event)
	})
})

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	handlers.clear()
})

describe("useNewDevice", () => {
	it("leaves the workspace alone when this device needs no approval", async () => {
		vi.mocked(commands.deviceApproval).mockResolvedValue({ kind: "none" })

		const { result } = await mountNewDevice()

		expect(result.current).toBeNull()
	})

	it("takes the window on step waiting while the approval is pending", async () => {
		const { result } = await mountNewDevice()

		await waitFor(() => expect(result.current?.step).toBe("waiting"))
		expect(result.current?.email).toBe(EMAIL)
		await waitFor(() =>
			expect(result.current?.device.fingerprint).toBe(FINGERPRINT.join(" ")),
		)
	})

	it("re-reads the approval and leaves for the workspace once approved", async () => {
		const { result } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))

		await approvalTurns(APPROVED)

		await waitFor(() => expect(result.current).toBeNull())
	})

	it("shows step expired and asks again", async () => {
		const { result } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))

		await approvalTurns(EXPIRED)
		await waitFor(() => expect(result.current?.step).toBe("expired"))
		act(() => result.current?.onAskAgain())

		await waitFor(() => expect(commands.deviceApprovalRetry).toHaveBeenCalled())
		await approvalTurns(ASKED_AGAIN)
		await waitFor(() => expect(result.current?.step).toBe("waiting"))
	})

	it("requests a code on I do not have another device and sends a new one", async () => {
		const { result } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))

		act(() => result.current?.onUseCode())
		expect(result.current?.step).toBe("code")
		act(() => result.current?.onResendCode())

		await waitFor(() =>
			expect(commands.deviceApprovalCodeRequest).toHaveBeenCalledTimes(2),
		)
		expect(result.current?.step).toBe("code")
	})

	it("submits the six-digit code", async () => {
		const { result } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))
		act(() => result.current?.onUseCode())

		act(() => result.current?.onApproveWithCode("123456"))

		await waitFor(() =>
			expect(commands.deviceApprovalCodeSubmit).toHaveBeenCalledWith("123456"),
		)
	})

	it.each([
		[{ kind: "codeInvalid" }, en.chat.screen.notice.failed],
		[{ kind: "tooManyRequests" }, en.chat.screen.notice.failed],
		[
			{ kind: "unreachable", detail: "offline" },
			en.settings.account.unreachable.title,
		],
	] as const)(
		"stays on step code and raises a notice when the code fails with %o",
		async (error, title) => {
			vi.mocked(commands.deviceApprovalCodeSubmit).mockResolvedValue(
				refused(error),
			)
			const { result } = await mountNewDevice()
			await waitFor(() => expect(result.current?.step).toBe("waiting"))
			act(() => result.current?.onUseCode())

			act(() => result.current?.onApproveWithCode("123456"))

			await waitFor(() => expect(failureTitles()).toEqual([title]))
			expect(result.current?.step).toBe("code")
		},
	)

	it("keeps step code through a re-render and survives an unmount mid-submission", async () => {
		const submission = Promise.withResolvers<ReturnType<typeof refused>>()
		vi.mocked(commands.deviceApprovalCodeSubmit).mockReturnValue(
			submission.promise,
		)
		const { result, rerender, unmount } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))
		act(() => result.current?.onUseCode())
		act(() => result.current?.onApproveWithCode("123456"))

		rerender({ watched: watching(SIGNED_IN) })
		expect(result.current?.step).toBe("code")
		unmount()
		await act(async () => submission.resolve(refused({ kind: "codeInvalid" })))

		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledOnce())
		expect(handlers.size).toBe(0)
	})

	it("shows step rejected with the email once the device is refused", async () => {
		const { result, rerender } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))

		vi.mocked(commands.deviceApproval).mockResolvedValue({ kind: "none" })
		rerender({ watched: watching(REFUSED) })

		expect(result.current?.step).toBe("rejected")
		expect(result.current?.email).toBe(EMAIL)
	})

	it("starts sign-in on Back to sign in", async () => {
		const { result } = await mountNewDevice(REFUSED)

		act(() => result.current?.onBackToSignIn())

		await waitFor(() => expect(commands.accountSignIn).toHaveBeenCalledOnce())
	})

	it("signs out through the account action", async () => {
		const { result } = await mountNewDevice()
		await waitFor(() => expect(result.current?.step).toBe("waiting"))

		act(() => result.current?.onSignOut())

		await waitFor(() => expect(commands.accountSignOut).toHaveBeenCalledOnce())
	})
})
