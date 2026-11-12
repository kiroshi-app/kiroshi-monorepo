import { expect, it } from "vitest"

import {
	localDayAt,
	type TodayRoster,
	todayRowsOf,
} from "./today-conversations"

import type {
	ConversationInPage,
	Participant,
} from "../conversations/store-contract"

const ATLAS = "b-atlas"

const MIDNIGHT = new Date(2026, 10, 12, 0, 0, 0, 0).getTime()
const NEXT_MIDNIGHT = new Date(2026, 10, 13, 0, 0, 0, 0).getTime()
const NOON = new Date(2026, 10, 12, 12, 0, 0, 0).getTime()
const MINUTE_MS = 60 * 1000

const seat = (botId: string): Participant => ({
	botId,
	role: "lead",
	joinedAt: 1,
	leftAt: null,
	name: botId,
	avatarBlot: null,
	avatarImagePath: null,
	isDeleted: false,
})

const lastWordAt = (at: number, text: string) => ({
	text,
	at,
	authorBotId: ATLAS,
	authorAccountId: null,
	authorName: null,
})

const readRow = (
	id: string,
	fields: Partial<ConversationInPage> = {},
): ConversationInPage => ({
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
	lastActivityAt: NOON,
	lastWord: null,
	soloBotId: null,
	activeTurn: null,
	state: "idle",
	...fields,
})

const rosterOf = (roster: Partial<TodayRoster> = {}): TodayRoster => ({
	conversations: [],
	previews: {},
	hostStates: {},
	now: NOON,
	...roster,
})

it("bounds the local day from its midnight to the next one", () => {
	const day = { start: MIDNIGHT, end: NEXT_MIDNIGHT }

	expect(localDayAt(MIDNIGHT)).toEqual(day)
	expect(localDayAt(NOON)).toEqual(day)
	expect(localDayAt(NEXT_MIDNIGHT - 1)).toEqual(day)
	expect(localDayAt(NEXT_MIDNIGHT).start).toBe(NEXT_MIDNIGHT)
})

it("keeps the order of the host read and drops the fourth row", () => {
	const todayRead = ["newest", "second", "third", "oldest"].map((id) =>
		readRow(id),
	)

	expect(todayRowsOf(todayRead, rosterOf()).map(({ id }) => id)).toEqual([
		"newest",
		"second",
		"third",
	])
})

it("draws a row the roster does not hold from the host read alone", () => {
	const todayRead = [
		readRow("venue", {
			title: "Lisbon offsite",
			state: "working",
			lastActivityAt: NOON - 5 * MINUTE_MS,
			lastWord: lastWordAt(NOON - 5 * MINUTE_MS, "Booking the venue"),
		}),
	]

	expect(todayRowsOf(todayRead, rosterOf())).toEqual([
		{
			id: "venue",
			title: "Lisbon offsite",
			timestamp: "5m",
			icon: undefined,
			hue: null,
			state: "working",
			preview: "Booking the venue",
		},
	])
})

it("dates a row nobody spoke in yet by its last activity", () => {
	const todayRead = [readRow("fresh", { lastActivityAt: NOON - 5 * MINUTE_MS })]

	expect(todayRowsOf(todayRead, rosterOf())).toMatchObject([
		{ id: "fresh", timestamp: "5m", state: "done", preview: "" },
	])
})

it("prefers the live roster over the host read for a row the roster holds", () => {
	const read = readRow("venue", {
		title: "Offsite",
		state: "idle",
		lastWord: lastWordAt(NOON - 5 * MINUTE_MS, "On it"),
	})
	const roster = rosterOf({
		conversations: [{ ...read, title: "Lisbon offsite" }],
		previews: { venue: { at: NOON - MINUTE_MS, text: "Booking the venue" } },
		hostStates: { venue: { state: "working" } },
	})

	expect(todayRowsOf([read], roster)).toMatchObject([
		{
			id: "venue",
			title: "Lisbon offsite",
			timestamp: "1m",
			state: "working",
			preview: "Booking the venue",
		},
	])
})

it("shows the pending prompt of a conversation that needs you", () => {
	const todayRead = [
		readRow("deposit", {
			state: "needs_you",
			pendingPrompt: {
				promptId: "ask-1",
				kind: "question",
				text: "When should the deposit go out?",
			},
			lastWord: lastWordAt(NOON, "On it"),
		}),
	]

	expect(todayRowsOf(todayRead, rosterOf())).toMatchObject([
		{
			id: "deposit",
			state: "needs-you",
			question: "When should the deposit go out?",
		},
	])
})

it("falls back to the last message as done when the host names no pending prompt", () => {
	const todayRead = [
		readRow("silent", {
			state: "needs_you",
			pendingPrompt: null,
			lastWord: lastWordAt(NOON, "Waiting on you"),
		}),
	]

	expect(todayRowsOf(todayRead, rosterOf())).toMatchObject([
		{ id: "silent", state: "done", preview: "Waiting on you" },
	])
})
