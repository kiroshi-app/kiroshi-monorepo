// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vitest"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { createQueryClient, type FailureMeta } from "./query-client"

import { hostOfflineOf } from "@/lib/host/host-offline"
import { HostRefused } from "@/lib/host/host-refused"

vi.mock("@workspace/ui/components/notice-surface", () => ({
	raiseFailureNotice: vi.fn(() => "notice-1"),
}))

afterEach(() => {
	vi.mocked(raiseFailureNotice).mockClear()
})

const reportedMeta: FailureMeta = {
	failureNotice: () => ({ title: "Couldn’t read it." }),
	raisedIn: "query-client-test",
}

const fetchFailing = (reason: unknown, meta: FailureMeta = reportedMeta) => {
	const queryClient = createQueryClient()
	const queryFn = vi.fn().mockRejectedValue(reason)
	const fetched = queryClient
		.fetchQuery({ queryKey: ["probe"], queryFn, meta, retryDelay: 0 })
		.catch((error: unknown) => error)
	return { queryFn, fetched }
}

const executeFailingMutation = (meta: FailureMeta = reportedMeta) => {
	const queryClient = createQueryClient()
	const mutationFn = vi.fn().mockRejectedValue(hostOfflineOf("gone"))
	const mutation = queryClient
		.getMutationCache()
		.build(queryClient, { mutationFn, meta, retryDelay: 0 })
	const executed = mutation.execute(undefined).catch((error: unknown) => error)
	return { mutationFn, executed }
}

it("surfaces a failing local invoke without retrying it", async () => {
	const { queryFn, fetched } = fetchFailing(new Error("local"))

	expect(await fetched).toEqual(new Error("local"))
	expect(queryFn).toHaveBeenCalledTimes(1)
})

it("does not retry a read the joined host refused", async () => {
	const refusal = new HostRefused("forbidden", "403")
	const { queryFn, fetched } = fetchFailing(refusal)

	expect(await fetched).toBe(refusal)
	expect(queryFn).toHaveBeenCalledTimes(1)
})

it("retries a read once when the joined host is offline", async () => {
	const offline = hostOfflineOf("gone")
	const { queryFn, fetched } = fetchFailing(offline)

	expect(await fetched).toBe(offline)
	expect(queryFn).toHaveBeenCalledTimes(2)
})

it("never retries a mutation, even against an offline host", async () => {
	const { mutationFn, executed } = executeFailingMutation()

	await executed

	expect(mutationFn).toHaveBeenCalledTimes(1)
})

it("raises the declared failure notice once from the query cache", async () => {
	await fetchFailing(hostOfflineOf("gone")).fetched

	expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read it.",
		report: expect.objectContaining({ raisedIn: "query-client-test" }),
	})
})

it("raises the declared failure notice once from the mutation cache", async () => {
	await executeFailingMutation().executed

	expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read it.",
		report: expect.objectContaining({ raisedIn: "query-client-test" }),
	})
})

it("skips the global notice for a read showing its error inline", async () => {
	await fetchFailing(new Error("local"), { rendersErrorInline: true }).fetched

	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("skips the global notice for a write showing its error inline", async () => {
	await executeFailingMutation({ rendersErrorInline: true }).executed

	expect(raiseFailureNotice).not.toHaveBeenCalled()
})
