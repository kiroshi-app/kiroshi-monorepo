"use client"

import { createContext, type PropsWithChildren, useContext } from "react"

type RosterBot = {
	id: string
	name: string
	title?: string
	blot?: number | null
	image?: string
}

type RosterProviderProps = PropsWithChildren<{
	bots: RosterBot[]
}>

const NO_BOTS: RosterBot[] = []

const RosterContext = createContext<RosterBot[]>(NO_BOTS)

const RosterProvider = ({ bots, children }: RosterProviderProps) => (
	<RosterContext.Provider value={bots}>{children}</RosterContext.Provider>
)

const useRosterBot = (id: string) =>
	useContext(RosterContext).find((bot) => bot.id === id)

export { type RosterBot, RosterProvider, useRosterBot }
