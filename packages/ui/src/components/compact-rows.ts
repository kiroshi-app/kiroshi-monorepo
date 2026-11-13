import { createContext, useContext } from "react"

const COMPACT_ROW_GAP = "gap-px"

const COMPACT_ROW_STACK = `flex flex-col ${COMPACT_ROW_GAP}`

const COMPACT_LEAD_SIDE = 20

const CompactRowsContext = createContext(false)

const useIsCompactRows = () => useContext(CompactRowsContext)

export {
	COMPACT_LEAD_SIDE,
	COMPACT_ROW_GAP,
	COMPACT_ROW_STACK,
	CompactRowsContext,
	useIsCompactRows,
}
