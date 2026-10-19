// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"
import { en } from "@workspace/ui/lib/i18n-en"

import { deviceQueryKeys } from "./device-query-keys"
import { useDeviceApprovals } from "./use-device-approvals"

import {
	type AccountDevice,
	type AccountState,
	commands,
	DEVICE_APPROVAL_REQUESTED_EVENT,
	DEVICE_APPROVAL_SETTLED_EVENT,
	type DeviceApprovalRequested,
} from "../bindings"
import { listen } from "../host"
import { createQueryTestWrapper } from "../query/query-test-wrapper"

vi.mock("../host", () => ({ listen: vi.fn() }))

vi.mock("../bindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("../bindings")>()),
	commands: {
		deviceApproval: vi.fn(),
		devicesList: vi.fn(),
		deviceApprove: vi.fn(),
		deviceRefuse: vi.fn(),
	},
}))

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(),
	raiseTransientNotice: vi.fn(),
}))

const COPY = en.common.devices.approval

const PHONE: DeviceApprovalRequested = {
	deviceId: "phone",
	name: "Noa’s iPhone 17",
	kind: "phone",
	askedAt: "2026-10-19T12:00:00Z",
	expiresAt: "2026-10-19T12:30:00Z",
	fingerprint: ["antenna", "hockey", "hawk", "giant", "tree", "palm"],
}

const LAPTOP: DeviceApprovalRequested = {
	...PHONE,
	deviceId: "laptop",
	name: "Noa’s MacBook Air",
	kind: "computer",
	fingerprint: ["ocean", "violin", "parade", "lunch", "eagle", "pencil"],
}

const SIGNED_IN: AccountState = {
	kind: "signedIn",
	id: "account-1",
	email: "noa@example.com",
	createdAt: "2026-10-01T00:00:00Z",
	plan: "pro",
}

const SIGNED_OUT: AccountState = { kind: "signedOut", reason: null }

const LATER = "2099-01-01T00:00:00Z"

const listedDevice = (
	request: DeviceApprovalRequested,
	approvalExpiresAt: string | null,
): AccountDevice => ({
	id: request.deviceId,
	name: request.name,
	kind: request.kind,
	status: approvalExpiresAt ? "pending" : "approved",
	approvalExpiresAt,
	lastActiveAt: request.askedAt,
	current: false,
	fingerprint: request.fingerprint,
})

const THIS_MAC: AccountDevice = {
	...listedDevice(LAPTOP, null),
	id: "this-mac",
	current: true,
}

const PENDING_PHONE = listedDevice({ ...PHONE, expiresAt: LATER }, LATER)

const listed = (devices: AccountDevice[]) =>
	({ status: "ok", data: devices }) as const

const OK = { status: "ok", data: null } as const

const UNREACHABLE = {
	status: "error",
	error: { kind: "unreachable", detail: "offline" },
} as const

const handlers = new Map<string, (payload: unknown) => void>()

const reportSuccess = vi.fn()

type Props = { state: AccountState }

const mountApprovals = async (state: AccountState = SIGNED_IN) => {
	const { queryClient, wrapper } = createQueryTestWrapper()
	const mounted = renderHook(
		(props: Props) => useDeviceApprovals(props.state, { reportSuccess }),
		{ initialProps: { state }, wrapper },
	)
	await waitFor(() => expect(handlers.size).toBe(2))
	await waitFor(() => expect(commands.deviceApproval).toHaveBeenCalled())
	return { ...mounted, queryClient }
}

const announce = (event: string, payload: unknown) =>
	act(() => handlers.get(event)?.(payload))

const ask = (request: DeviceApprovalRequested) =>
	announce(DEVICE_APPROVAL_REQUESTED_EVENT, request)

beforeEach(() => {
	vi.mocked(commands.deviceApproval).mockResolvedValue({ kind: "approved" })
	vi.mocked(commands.devicesList).mockResolvedValue(listed([THIS_MAC]))
	vi.mocked(commands.deviceApprove).mockResolvedValue(OK)
	vi.mocked(commands.deviceRefuse).mockResolvedValue(OK)
	vi.mocked(listen).mockImplementation(async (event, handler) => {
		handlers.set(event, (payload) =>
			handler({ payload } as Parameters<typeof handler>[0], null),
		)
		return () => handlers.delete(event)
	})
})

afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	handlers.clear()
})

describe("useDeviceApprovals", () => {
	it("opens no dialog before a device asks", async () => {
		const { result } = await mountApprovals()

		expect(result.current).toBeNull()
	})

	it("opens the dialog for the device that asks", async () => {
		const { result } = await mountApprovals()

		ask(PHONE)

		expect(result.current).toMatchObject({
			open: true,
			status: "asking",
			device: {
				kind: "phone",
				name: PHONE.name,
				fingerprint: "antenna hockey hawk giant tree palm",
			},
		})
	})

	it("shows one request at a time, in arrival order", async () => {
		const { result } = await mountApprovals()

		ask(PHONE)
		ask(LAPTOP)
		ask(PHONE)
		expect(result.current?.device.name).toBe(PHONE.name)
		act(() => result.current?.onApprove())

		await waitFor(() => expect(result.current?.device.name).toBe(LAPTOP.name))
		expect(result.current?.status).toBe("asking")
	})

	it("shows approving, then closes and raises the approved notice", async () => {
		const approval = Promise.withResolvers<typeof OK>()
		vi.mocked(commands.deviceApprove).mockReturnValue(approval.promise)
		const { result, rerender } = await mountApprovals()
		ask(PHONE)

		act(() => result.current?.onApprove())
		await waitFor(() => expect(result.current?.status).toBe("approving"))
		rerender({ state: SIGNED_IN })
		expect(result.current?.status).toBe("approving")
		await act(async () => approval.resolve(OK))

		expect(commands.deviceApprove).toHaveBeenCalledWith(PHONE.deviceId)
		await waitFor(() => expect(result.current).toBeNull())
		expect(reportSuccess).toHaveBeenCalledWith({
			title: `${PHONE.name} is approved`,
			description: COPY.approved.description,
		})
	})

	it("shows the failed status and retries with Approve", async () => {
		vi.mocked(commands.deviceApprove).mockResolvedValueOnce(UNREACHABLE)
		const { result } = await mountApprovals()
		ask(PHONE)

		act(() => result.current?.onApprove())
		await waitFor(() => expect(result.current?.status).toBe("failed"))
		expect(raiseFailureNotice).not.toHaveBeenCalled()
		act(() => result.current?.onApprove())

		await waitFor(() => expect(result.current).toBeNull())
		expect(commands.deviceApprove).toHaveBeenCalledTimes(2)
	})

	it("refuses the device on Not me, closes and raises the rejected notice", async () => {
		const { result } = await mountApprovals()
		ask(PHONE)

		act(() => result.current?.onReject())

		await waitFor(() => expect(result.current).toBeNull())
		expect(commands.deviceRefuse).toHaveBeenCalledWith(PHONE.deviceId)
		expect(reportSuccess).toHaveBeenCalledWith({
			title: `${PHONE.name} was signed out`,
			description: COPY.rejected.description,
		})
	})

	it("keeps the dialog and raises a failure notice when Not me fails", async () => {
		vi.mocked(commands.deviceRefuse).mockResolvedValue(UNREACHABLE)
		const { result } = await mountApprovals()
		ask(PHONE)

		act(() => result.current?.onReject())

		await waitFor(() =>
			expect(raiseFailureNotice).toHaveBeenCalledWith(
				expect.objectContaining({
					title: en.settings.account.unreachable.title,
				}),
			),
		)
		expect(result.current?.device.name).toBe(PHONE.name)
		expect(reportSuccess).not.toHaveBeenCalled()
	})

	it("closes without a notice when the open device settles elsewhere", async () => {
		const { result } = await mountApprovals()
		ask(PHONE)
		ask(LAPTOP)

		announce(DEVICE_APPROVAL_SETTLED_EVENT, { deviceId: PHONE.deviceId })

		expect(result.current?.device.name).toBe(LAPTOP.name)
		announce(DEVICE_APPROVAL_SETTLED_EVENT, { deviceId: LAPTOP.deviceId })
		expect(result.current).toBeNull()
		expect(reportSuccess).not.toHaveBeenCalled()
	})

	it("stops listening and still raises the notice when unmounted mid-approval", async () => {
		const approval = Promise.withResolvers<typeof OK>()
		vi.mocked(commands.deviceApprove).mockReturnValue(approval.promise)
		const { result, unmount } = await mountApprovals()
		ask(PHONE)
		act(() => result.current?.onApprove())
		await waitFor(() => expect(commands.deviceApprove).toHaveBeenCalled())

		unmount()
		await act(async () => approval.resolve(OK))

		await waitFor(() => expect(handlers.size).toBe(0))
		expect(reportSuccess).toHaveBeenCalledOnce()
	})

	it("opens the dialog for a device already pending at launch, read from the list", async () => {
		vi.mocked(commands.devicesList).mockResolvedValue(
			listed([
				THIS_MAC,
				listedDevice(LAPTOP, "2000-01-01T00:00:00Z"),
				listedDevice(PHONE, null),
				PENDING_PHONE,
			]),
		)

		const { result } = await mountApprovals()

		await waitFor(() => expect(result.current?.device.name).toBe(PHONE.name))
		act(() => result.current?.onApprove())
		await waitFor(() => expect(result.current).toBeNull())
		expect(commands.deviceApprove).toHaveBeenCalledWith(PHONE.deviceId)
	})

	it("reads no list while this device waits for approval or is signed out", async () => {
		vi.mocked(commands.deviceApproval).mockResolvedValue({
			kind: "pending",
			expiresAt: LATER,
		})
		const { rerender } = await mountApprovals()

		rerender({ state: SIGNED_OUT })
		await act(async () => undefined)

		expect(commands.devicesList).not.toHaveBeenCalled()
	})

	it("keeps one entry when the event repeats a listed device", async () => {
		vi.mocked(commands.devicesList).mockResolvedValue(
			listed([THIS_MAC, PENDING_PHONE]),
		)
		const { result, rerender } = await mountApprovals()
		await waitFor(() => expect(result.current?.device.name).toBe(PHONE.name))

		ask({ ...PHONE, expiresAt: LATER })
		rerender({ state: SIGNED_IN })
		act(() => result.current?.onApprove())

		await waitFor(() => expect(result.current).toBeNull())
	})

	it("keeps one entry when the list repeats a device first heard by event", async () => {
		const { result, queryClient } = await mountApprovals()
		await waitFor(() => expect(commands.devicesList).toHaveBeenCalled())
		ask({ ...PHONE, expiresAt: LATER })

		vi.mocked(commands.devicesList).mockResolvedValue(
			listed([THIS_MAC, PENDING_PHONE]),
		)
		await act(() => queryClient.invalidateQueries())
		act(() => result.current?.onApprove())

		await waitFor(() => expect(result.current).toBeNull())
	})

	it("does not reopen an answered request when a stale list still names it", async () => {
		vi.mocked(commands.devicesList).mockResolvedValue(
			listed([THIS_MAC, PENDING_PHONE]),
		)
		const { result, queryClient } = await mountApprovals()
		await waitFor(() => expect(result.current?.device.name).toBe(PHONE.name))
		act(() => result.current?.onApprove())
		await waitFor(() => expect(result.current).toBeNull())

		act(() => {
			queryClient.setQueryData(deviceQueryKeys.list(), [
				THIS_MAC,
				PENDING_PHONE,
			])
		})

		expect(result.current).toBeNull()
	})
})
