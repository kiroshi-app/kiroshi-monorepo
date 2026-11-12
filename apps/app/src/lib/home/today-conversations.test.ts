import { expect, it } from "vitest"

import { type TodayRoster, todayRowsOf } from "./today-conversations"

import type { Conversation, Participant } from "../conversations/store-contract"

const ATLAS = "b-atlas"
const NYX = "b-nyx"

const MIDNIGHT = new Date(2026, 10, 12, 0, 0, 0, 0).getTime()
const NOON = new Date(2026, 10, 12, 12, 0, 0, 0).getTime()
const MINUTE_MS = 60 * 1000

const seat = (
	botId: string,
	fields: Partial<Participant> = {},
): Participant => ({
	botId,
	role: "lead",
	joinedAt: 1,
	leftAt: null,
	name: botId,
	avatarBlot: null,
	avatarImagePath: null,
	isDeleted: false,
	...fields,
})

const conversation = (
	id: string,
	fields: Partial<Conversation> = {},
): Conversation => ({
	id,
	spaceId: "personal",
	sectionId: null,
	pinPosition: null,
	title: id,
	instructions: "",
	icon: null,
	color: null,
	createdAt: 1,
	updatedAt: 1,
	participants: [seat(ATLAS)],
	...fields,
})

const rosterOf = (roster: Partial<TodayRoster> = {}): TodayRoster => ({
	conversations: [],
	previews: {},
	hostStates: {},
	now: NOON,
	...roster,
})

const idsOf = (agentId: string, roster: TodayRoster) =>
	todayRowsOf(agentId, roster).map(({ id }) => id)

it("leaves out a conversation whose last activity fell on another day", () => {
	const roster = rosterOf({
		conversations: [conversation("today"), conversation("yesterday")],
		previews: {
			today: { at: NOON - MINUTE_MS },
			yesterday: { at: NOON - 24 * 60 * MINUTE_MS },
		},
	})

	expect(idsOf(ATLAS, roster)).toEqual(["today"])
})

it("keeps the conversation spoken in at midnight sharp and drops the one a millisecond before", () => {
	const roster = rosterOf({
		conversations: [conversation("at-midnight"), conversation("before")],
		previews: {
			"at-midnight": { at: MIDNIGHT },
			before: { at: MIDNIGHT - 1 },
		},
	})

	expect(idsOf(ATLAS, roster)).toEqual(["at-midnight"])
})

it("lists nothing once now passes midnight into the next day", () => {
	const roster = rosterOf({
		conversations: [conversation("late")],
		previews: { late: { at: MIDNIGHT - 1 } },
		now: MIDNIGHT - 1,
	})

	expect(idsOf(ATLAS, roster)).toEqual(["late"])
	expect(idsOf(ATLAS, { ...roster, now: MIDNIGHT })).toEqual([])
})

it("counts a conversation created today that nobody spoke in yet", () => {
	const roster = rosterOf({
		conversations: [conversation("fresh", { createdAt: NOON - MINUTE_MS })],
	})

	expect(idsOf(ATLAS, roster)).toEqual(["fresh"])
})

it("leaves out a conversation where the agent is not seated, has left or was deleted", () => {
	const roster = rosterOf({
		conversations: [
			conversation("with-atlas"),
			conversation("with-nyx", { participants: [seat(NYX)] }),
			conversation("atlas-left", {
				participants: [seat(ATLAS, { leftAt: NOON }), seat(NYX)],
			}),
			conversation("atlas-deleted", {
				participants: [seat(ATLAS, { isDeleted: true }), seat(NYX)],
			}),
		],
		previews: {
			"with-atlas": { at: NOON },
			"with-nyx": { at: NOON },
			"atlas-left": { at: NOON },
			"atlas-deleted": { at: NOON },
		},
	})

	expect(idsOf(ATLAS, roster)).toEqual(["with-atlas"])
	expect(new Set(idsOf(NYX, roster))).toEqual(
		new Set(["with-nyx", "atlas-left", "atlas-deleted"]),
	)
})

it("orders the rows most recent first and drops the fourth", () => {
	const roster = rosterOf({
		conversations: [
			conversation("oldest"),
			conversation("newest"),
			conversation("second"),
			conversation("third"),
		],
		previews: {
			oldest: { at: NOON - 4 * MINUTE_MS },
			newest: { at: NOON - MINUTE_MS },
			second: { at: NOON - 2 * MINUTE_MS },
			third: { at: NOON - 3 * MINUTE_MS },
		},
	})

	expect(idsOf(ATLAS, roster)).toEqual(["newest", "second", "third"])
})

it("shows the pending prompt of a conversation that needs you", () => {
	const roster = rosterOf({
		conversations: [conversation("deposit", { title: "Lisbon offsite" })],
		previews: { deposit: { at: NOON - 5 * MINUTE_MS, text: "On it" } },
		hostStates: {
			deposit: {
				state: "needs_you",
				pendingPrompt: {
					promptId: "ask-1",
					kind: "question",
					text: "When should the deposit go out?",
				},
			},
		},
	})

	expect(todayRowsOf(ATLAS, roster)).toEqual([
		{
			id: "deposit",
			title: "Lisbon offsite",
			timestamp: "5m",
			icon: undefined,
			hue: null,
			state: "needs-you",
			question: "When should the deposit go out?",
		},
	])
})

it("shows the last message of a working conversation, and of every other one as done", () => {
	const roster = rosterOf({
		conversations: [conversation("busy"), conversation("settled")],
		previews: {
			busy: { at: NOON, text: "Booking the venue" },
			settled: { at: NOON - MINUTE_MS, text: "Venue booked" },
		},
		hostStates: { busy: { state: "working" }, settled: { state: "idle" } },
	})

	expect(todayRowsOf(ATLAS, roster)).toMatchObject([
		{ id: "busy", state: "working", preview: "Booking the venue" },
		{ id: "settled", state: "done", preview: "Venue booked" },
	])
})

it("falls back to the last message as done when the host names no pending prompt", () => {
	const roster = rosterOf({
		conversations: [conversation("silent")],
		previews: { silent: { at: NOON, text: "Waiting on you" } },
		hostStates: { silent: { state: "needs_you", pendingPrompt: null } },
	})

	expect(todayRowsOf(ATLAS, roster)).toMatchObject([
		{ id: "silent", state: "done", preview: "Waiting on you" },
	])
})
