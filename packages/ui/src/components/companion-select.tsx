"use client"

import { createContext, type PropsWithChildren, useContext } from "react"

import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"

type CompanionSelect = (companionId: string, modifiers: ClickModifiers) => void

const CompanionSelectContext = createContext<CompanionSelect | undefined>(
	undefined,
)

type CompanionSelectProviderProps = PropsWithChildren<{
	onSelect?: CompanionSelect
}>

const CompanionSelectProvider = ({
	onSelect,
	children,
}: CompanionSelectProviderProps) => (
	<CompanionSelectContext.Provider value={onSelect}>
		{children}
	</CompanionSelectContext.Provider>
)

const useCompanionSelect = () => useContext(CompanionSelectContext)

export { type CompanionSelect, CompanionSelectProvider, useCompanionSelect }
