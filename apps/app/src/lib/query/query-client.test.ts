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

	await vi.waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledTimes(1))
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read it.",
		report: expect.objectContaining({
			context: expect.objectContaining({ raisedIn: "query-client-test" }),
		}),
	})
})

it("raises the declared failure notice once from the mutation cache", async () => {
	await executeFailingMutation().executed

	await vi.waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledTimes(1))
	expect(raiseFailureNotice).toHaveBeenCalledWith({
		title: "Couldn’t read it.",
		report: expect.objectContaining({
			context: expect.objectContaining({ raisedIn: "query-client-test" }),
		}),
	})
})

it("hands the failure to the notice it declares", async () => {
	await fetchFailing(new Error("disk full"), {
		failureNotice: (error) => ({
			title: "Couldn’t read it.",
			description: error instanceof Error ? error.message : undefined,
		}),
		raisedIn: "query-client-test",
	}).fetched

	await vi.waitFor(() =>
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({ description: "disk full" }),
		),
	)
})

it("skips the global notice for a read showing its error inline", async () => {
	await fetchFailing(new Error("local"), { rendersErrorInline: true }).fetched

	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("skips the global notice for a write showing its error inline", async () => {
	await executeFailingMutation({ rendersErrorInline: true }).executed

	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

it("skips the notice of a read for an error its meta keeps silent", async () => {
	await fetchFailing(hostOfflineOf("gone"), {
		...reportedMeta,
		isSilentOn: () => true,
	}).fetched

	expect(raiseFailureNotice).not.toHaveBeenCalled()
})

const outageMeta: FailureMeta = {
	...reportedMeta,
	isSilentOn: (error) => error === "silent",
	raisesOncePerOutage: true,
}

const fetchOutcomes = async (outcomes: unknown[]) => {
	const queryClient = createQueryClient()
	for (const outcome of outcomes) {
		await queryClient
			.fetchQuery({
				queryKey: ["outage"],
				queryFn: () =>
					outcome === "answer"
						? Promise.resolve(outcome)
						: Promise.reject(outcome),
				meta: outageMeta,
				staleTime: 0,
			})
			.catch((error: unknown) => error)
	}
}

it("raises one notice per outage of a read until it answers again", async () => {
	await fetchOutcomes([
		new Error("a"),
		new Error("b"),
		"answer",
		new Error("c"),
	])

	await vi.waitFor(() => expect(raiseFailureNotice).toHaveBeenCalledTimes(2))
})

it("opens no outage on a failure its meta keeps silent", async () => {
	await fetchOutcomes(["silent", new Error("a"), new Error("b")])

	expect(raiseFailureNotice).toHaveBeenCalledTimes(1)
})

it("builds the failure notice from the failure the read met", async () => {
	const titledByFailure: FailureMeta = {
		failureNotice: (error) => ({ title: `Couldn’t read it: ${error}` }),
		raisedIn: "query-client-test",
	}

	await fetchFailing("refused", titledByFailure).fetched

	await vi.waitFor(() =>
		expect(raiseFailureNotice).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Couldn’t read it: refused" }),
		),
	)
})
