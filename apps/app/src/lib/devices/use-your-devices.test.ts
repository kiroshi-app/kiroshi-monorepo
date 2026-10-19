// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { en } from "@workspace/ui/lib/i18n-en"

import { useYourDevices } from "./use-your-devices"

import {
	type AccountDevice,
	type AccountState,
	commands,
	DEVICE_APPROVAL_REQUESTED_EVENT,
} from "../bindings"
import { listen } from "../host"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({ listen: vi.fn() }))

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: { devicesList: vi.fn(), deviceRemove: vi.fn() },
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
	raiseTransientNotice: vi.fn(),
}))

const NOW = Date.parse("2026-10-19T12:00:00Z")

const EMAIL = "noa@example.com"

const SIGNED_IN: AccountState = {
	kind: "signedIn",
	id: "account-1",
	email: EMAIL,
	createdAt: "2026-10-01T00:00:00Z",
	plan: "pro",
}

const SIGNED_OUT: AccountState = { kind: "signedOut", reason: null }

const COPY = en.settings.account.devices

const THIS_MAC: AccountDevice = {
	id: "this-mac",
	name: "Noa’s MacBook Air",
	kind: "computer",
	status: "approved",
	approvalExpiresAt: null,
	lastActiveAt: "2026-10-19T12:00:00Z",
	current: true,
	fingerprint: ["ocean", "violin", "parade", "lunch", "eagle", "pencil"],
}

const PHONE: AccountDevice = {
	id: "phone",
	name: "Noa’s iPhone 17",
	kind: "phone",
	status: "approved",
	approvalExpiresAt: null,
	lastActiveAt: "2026-10-19T10:00:00Z",
	current: false,
	fingerprint: ["antenna", "hockey", "hawk", "giant", "tree", "palm"],
}

const OK = { status: "ok", data: null } as const

const UNREACHABLE = {
	status: "error",
	error: { kind: "unreachable", detail: "offline" },
} as const

const handlers = new Map<string, () => void>()

const reportSuccess = vi.fn()

type Props = { state: AccountState; isShown: boolean }

const mountDevices = (
	initialProps: Props = { state: SIGNED_IN, isShown: true },
) =>
	renderHook(
		({ state, isShown }: Props) =>
			useYourDevices(state, { isShown, reportSuccess }),
		{ initialProps, wrapper: createQueryTestWrapper().wrapper },
	)

const listed = (devices: AccountDevice[]) =>
	({ status: "ok", data: devices }) as const

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(NOW)
	vi.mocked(commands.devicesList).mockResolvedValue(listed([THIS_MAC, PHONE]))
	vi.mocked(commands.deviceRemove).mockResolvedValue(OK)
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		handlers.set(event, () => handler({ payload: null } as never, null))
		return () => handlers.delete(event)
	})
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.clearAllMocks()
	handlers.clear()
})

describe("useYourDevices", () => {
	it("shows the skeleton while the devices are read", async () => {
		vi.mocked(commands.devicesList).mockReturnValue(
			new Promise(() => undefined),
		)

		const { result } = mountDevices()

		await waitFor(() => expect(result.current?.isPending).toBe(true))
	})

	it("passes this device and every other device with activity and six words", async () => {
		const { result } = mountDevices()

		await waitFor(() => expect(result.current?.isPending).toBe(false))
		expect(result.current?.email).toBe(EMAIL)
		expect(result.current?.thisDevice).toEqual({
			kind: "laptop",
			name: "Noa’s MacBook Air",
			fingerprint: "ocean violin parade lunch eagle pencil",
		})
		expect(result.current?.otherDevices).toEqual([
			{
				id: "phone",
				kind: "phone",
				name: "Noa’s iPhone 17",
				activity: "2 hours ago",
				fingerprint: "antenna hockey hawk giant tree palm",
			},
		])
	})

	it("passes no other device when only this one exists", async () => {
		vi.mocked(commands.devicesList).mockResolvedValue(listed([THIS_MAC]))

		const { result } = mountDevices()

		await waitFor(() => expect(result.current?.isPending).toBe(false))
		expect(result.current?.otherDevices).toEqual([])
	})

	it("reads nothing while settings are closed or the account is signed out", () => {
		const { result, rerender } = mountDevices({
			state: SIGNED_IN,
			isShown: false,
		})
		rerender({ state: SIGNED_OUT, isShown: true })

		expect(commands.devicesList).not.toHaveBeenCalled()
		expect(result.current).toBeUndefined()
	})

	it("hides the devices and raises a notice when the read fails", async () => {
		vi.mocked(commands.devicesList).mockResolvedValue(UNREACHABLE)

		const { result } = mountDevices()

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({ title: en.settings.account.readFailed }),
			),
		)
		expect(result.current).toBeUndefined()
	})

	it("re-reads the devices when another device asks for approval", async () => {
		const { result } = mountDevices()
		await waitFor(() => expect(result.current?.isPending).toBe(false))

		act(() => handlers.get(DEVICE_APPROVAL_REQUESTED_EVENT)?.())

		await waitFor(() => expect(commands.devicesList).toHaveBeenCalledTimes(2))
	})

	it("shows removing, drops the row and raises the removed notice", async () => {
		const removal = Promise.withResolvers<typeof OK>()
		vi.mocked(commands.deviceRemove).mockReturnValue(removal.promise)
		const { result, rerender } = mountDevices()
		await waitFor(() => expect(result.current?.isPending).toBe(false))

		act(() => result.current?.onRemove(PHONE.id))
		await waitFor(() =>
			expect(result.current?.removal).toEqual({
				deviceId: PHONE.id,
				status: "removing",
			}),
		)
		rerender({ state: SIGNED_IN, isShown: true })
		expect(result.current?.removal?.status).toBe("removing")
		await act(async () => removal.resolve(OK))

		expect(commands.deviceRemove).toHaveBeenCalledWith(PHONE.id)
		await waitFor(() => expect(result.current?.otherDevices).toEqual([]))
		expect(result.current?.removal).toBeNull()
		expect(reportSuccess).toHaveBeenCalledWith({
			title: `${PHONE.name} was signed out`,
			description: COPY.removed.description,
		})
	})

	it("shows the failed removal and raises a notice whose action retries it", async () => {
		vi.mocked(commands.deviceRemove).mockResolvedValueOnce(UNREACHABLE)
		const { result } = mountDevices()
		await waitFor(() => expect(result.current?.isPending).toBe(false))

		act(() => result.current?.onRemove(PHONE.id))

		await waitFor(() =>
			expect(result.current?.removal).toEqual({
				deviceId: PHONE.id,
				status: "failed",
			}),
		)
		await waitFor(() => expect(raiseFailureNotice).toHaveBeenCalled())
		const [notice] = vi.mocked(raiseFailureNotice).mock.calls[0] ?? []
		expect(notice?.title).toBe(
			`Couldn’t remove ${PHONE.name}. Check your connection and try again.`,
		)
		expect(notice?.action?.label).toBe(en.common.devices.approval.retry)

		await act(async () => notice?.action?.onPress())

		expect(commands.deviceRemove).toHaveBeenCalledTimes(2)
		await waitFor(() => expect(result.current?.otherDevices).toEqual([]))
	})

	it("clears the failed removal when the person cancels", async () => {
		vi.mocked(commands.deviceRemove).mockResolvedValue(UNREACHABLE)
		const { result } = mountDevices()
		await waitFor(() => expect(result.current?.isPending).toBe(false))
		act(() => result.current?.onRemove(PHONE.id))
		await waitFor(() => expect(result.current?.removal?.status).toBe("failed"))

		act(() => result.current?.onCancelRemoval())

		await waitFor(() => expect(result.current?.removal).toBeNull())
	})

	it("still raises the removed notice when unmounted mid-removal", async () => {
		const removal = Promise.withResolvers<typeof OK>()
		vi.mocked(commands.deviceRemove).mockReturnValue(removal.promise)
		const { result, unmount } = mountDevices()
		await waitFor(() => expect(result.current?.isPending).toBe(false))
		act(() => result.current?.onRemove(PHONE.id))
		await waitFor(() => expect(commands.deviceRemove).toHaveBeenCalled())

		unmount()
		await act(async () => removal.resolve(OK))

		expect(reportSuccess).toHaveBeenCalledOnce()
		expect(handlers.size).toBe(0)
	})
})
