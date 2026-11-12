import type { ReactNode } from "react"

const SWAP_CLASS = "grid place-items-center *:col-start-1 *:row-start-1"

const LAYER_CLASS =
	"grid place-items-center transition-[scale,opacity,filter] duration-200 ease-out data-[shown=false]:scale-25 data-[shown=false]:opacity-0 data-[shown=false]:blur-[4px] motion-reduce:transition-[opacity] motion-reduce:data-[shown=false]:scale-100 motion-reduce:data-[shown=false]:blur-none"

type IconSwapProps = {
	isSwapped: boolean
	icon: ReactNode
	swappedIcon: ReactNode
}

const IconSwap = ({ isSwapped, icon, swappedIcon }: IconSwapProps) => (
	<span className={SWAP_CLASS} data-slot="icon-swap">
		<span className={LAYER_CLASS} data-shown={!isSwapped}>
			{icon}
		</span>
		<span className={LAYER_CLASS} data-shown={isSwapped}>
			{swappedIcon}
		</span>
	</span>
)

export { IconSwap }
