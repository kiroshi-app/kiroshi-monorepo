import {
	AppWindowPlusIcon,
	ArrowDownIcon,
	ArrowRightIcon,
	ArrowUpIcon,
	BanIcon,
	BellIcon,
	BinIcon,
	BookmarkIcon,
	BookOpenIcon,
	BracketArrowRightIcon,
	BrainIcon,
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CircleAlertIcon,
	CircleCheckIcon,
	CircleIcon,
	CircleXIcon,
	ClockIcon,
	CloudIcon,
	CodeIcon,
	CopyIcon,
	CpuIcon,
	CrownIcon,
	EyeIcon,
	EyeOffIcon,
	FileCodeIcon,
	FileTextIcon,
	FlagIcon,
	FolderIcon,
	FolderOpenIcon,
	GlobeIcon,
	GridSquaresXIcon,
	HexagonsIcon,
	HistoryIcon,
	HomeIcon,
	type IconProps,
	ImageIcon,
	InfoIcon,
	KeyRoundIcon,
	LanguageIcon,
	LaptopIcon,
	LayersIcon,
	LinkIcon,
	LoaderCircleIcon,
	MailIcon,
	MessageIcon,
	MessageSquareIcon,
	MinusIcon,
	MonitorIcon,
	MoonIcon,
	MoreHorizontalIcon,
	PaletteIcon,
	PanelLeftIcon,
	PanelRightIcon,
	PenIcon,
	PenLineIcon,
	PinIcon,
	PinOffIcon,
	PlusIcon,
	RefreshCwIcon,
	RepeatIcon,
	ReplyIcon,
	RotateCcwIcon,
	RotateCwIcon,
	SearchIcon,
	ServerIcon,
	SettingsIcon,
	ShieldCheckIcon,
	ShieldIcon,
	SmartphoneIcon,
	SparklesIcon,
	SquareArrowUpRightIcon,
	SquareIcon,
	SquarePlusIcon,
	SquareTerminalIcon,
	SunIcon,
	TerminalIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	TriangleAlertIcon,
	UserIcon,
	UsersIcon,
	WrenchIcon,
	XIcon,
} from "@keyline-icons/react"
import {
	BellIcon as BellFillIcon,
	BookOpenIcon as BookOpenFillIcon,
	BugIcon as BugFillIcon,
	CalendarIcon as CalendarFillIcon,
	ChartLineIcon as ChartLineFillIcon,
	ClockIcon as ClockFillIcon,
	CloudIcon as CloudFillIcon,
	CodeIcon as CodeFillIcon,
	CpuIcon as CpuFillIcon,
	CreditCardIcon as CreditCardFillIcon,
	DownloadIcon as DownloadFillIcon,
	FileTextIcon as FileTextFillIcon,
	FlagIcon as FlagFillIcon,
	FolderIcon as FolderFillIcon,
	GlobeIcon as GlobeFillIcon,
	HexagonsIcon as HexagonsFillIcon,
	HistoryIcon as HistoryFillIcon,
	ImageIcon as ImageFillIcon,
	InfoIcon as InfoFillIcon,
	LanguageIcon as LanguageFillIcon,
	LaptopIcon as LaptopFillIcon,
	LightbulbIcon as LightbulbFillIcon,
	MegaphoneIcon as MegaphoneFillIcon,
	MessageIcon as MessageFillIcon,
	MessageSquareIcon as MessageSquareFillIcon,
	PaletteIcon as PaletteFillIcon,
	PanelLeftIcon as PanelLeftFillIcon,
	PenIcon as PenFillIcon,
	RocketIcon as RocketFillIcon,
	ServerIcon as ServerFillIcon,
	SettingsIcon as SettingsFillIcon,
	ShieldCheckIcon as ShieldCheckFillIcon,
	ShieldIcon as ShieldFillIcon,
	ShieldKeyIcon as ShieldKeyFillIcon,
	SmartphoneIcon as SmartphoneFillIcon,
	SparklesIcon as SparklesFillIcon,
	TerminalIcon as TerminalFillIcon,
	TriangleAlertIcon as TriangleAlertFillIcon,
	UserIcon as UserFillIcon,
	UsersIcon as UsersFillIcon,
	WrenchIcon as WrenchFillIcon,
} from "@keyline-icons/react/fill"
import type { ComponentType } from "react"

type Icon = ComponentType<IconProps>

const Claude = ({ size = 24, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height={size}
		viewBox="0 0 24 24"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
	</svg>
)

const GitHub = ({ size = 24, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height={size}
		viewBox="0 0 16 16"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
	</svg>
)

const Linear = ({ size = 24, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height={size}
		viewBox="0 0 100 100"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M1.22541 61.5228c-.2-.9086.87652-1.5125 1.53266-.8563l36.5471 36.5471c.6562.6562.0523 1.7327-.8563 1.5327-9.5313-2.098-18.4276-6.6428-25.7566-13.9718-7.32893-7.3289-11.87373-16.2252-13.9718-25.7567zM.00189135 46.8891c-.01764375.2833.08887215.5599.28957165.7606l52.0501 52.0501c.2007.2007.4773.3072.7606.2896 2.3692-.1476 4.6938-.46 6.9624-.9259.7645-.157 1.0301-1.0963.4782-1.6481L2.57343 39.4485c-.55184-.5518-1.49109-.2863-1.648174.4782-.465915 2.2686-.77835 4.5932-.92598465 6.9624zM4.21093 29.7054c-.16649.3738-.08169.8106.20765 1.1l64.77602 64.776c.2894.2894.7262.3742 1.1.2077 1.7861-.7956 3.5171-1.6927 5.1855-2.684.5521-.328.6373-1.0867.1832-1.5407L8.43566 24.3865c-.45409-.4541-1.21271-.3689-1.54074.1832-.99132 1.6684-1.88843 3.3994-2.68399 5.1857zM12.6587 18.074c-.3701-.3701-.393-.9637-.0443-1.3541C21.7795 6.45931 35.1114 0 49.9519 0 77.5927 0 100 22.4073 100 50.0481c0 14.8405-6.4593 28.1724-16.7199 37.3375-.3903.3487-.984.3258-1.354-.0443L12.6587 18.074z" />
	</svg>
)

const Paper = ({ size = 24, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height={size}
		viewBox="0 0 78 78"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M12 0h66v12H12zM0 12h12v36H0zM48 12h30v36H48zM0 48h48v30H0z" />
	</svg>
)

const Superset = ({ size = 24, strokeWidth = 1.5, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="none"
		height={size}
		stroke="currentColor"
		strokeLinecap="butt"
		strokeLinejoin="miter"
		strokeWidth={strokeWidth}
		viewBox="0 0 24 24"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M5.25 6H3.75V10H1.5V14H3.75V18H5.25M11.25 6H9.75V10H7.5V14H9.75V18H11.25M12.75 6H14.25V10H16.5V14H14.25V18H12.75M18.75 6H20.25V10H22.5V14H20.25V18H18.75" />
	</svg>
)

const X = ({ size = 24, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="currentColor"
		height={size}
		viewBox="0 0 24 24"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
	</svg>
)

const Icons = {
	Add: PlusIcon,
	Alert: TriangleAlertIcon,
	AlertCircle: CircleAlertIcon,
	ArrowDown: ArrowDownIcon,
	ArrowRight: ArrowRightIcon,
	ArrowUp: ArrowUpIcon,
	Bell: BellIcon,
	Blocked: BanIcon,
	Bookmark: BookmarkIcon,
	Calendar: CalendarIcon,
	Check: CheckIcon,
	Claude,
	Clock: ClockIcon,
	Close: XIcon,
	CloseOtherTabs: GridSquaresXIcon,
	Cloud: CloudIcon,
	Command: SquareTerminalIcon,
	Companions: HexagonsIcon,
	Conceal: EyeOffIcon,
	Copy: CopyIcon,
	Cpu: CpuIcon,
	Crown: CrownIcon,
	DarkScheme: MoonIcon,
	Delete: BinIcon,
	Desktop: MonitorIcon,
	Docs: BookOpenIcon,
	Edit: PenIcon,
	Error: CircleXIcon,
	Expand: ChevronDownIcon,
	ExternalLink: SquareArrowUpRightIcon,
	File: FileTextIcon,
	FileCode: FileCodeIcon,
	Folder: FolderIcon,
	FolderOpen: FolderOpenIcon,
	GitHub,
	History: HistoryIcon,
	Home: HomeIcon,
	Image: ImageIcon,
	Info: InfoIcon,
	Json: CodeIcon,
	Key: KeyRoundIcon,
	Language: LanguageIcon,
	Laptop: LaptopIcon,
	Leave: BracketArrowRightIcon,
	LightScheme: SunIcon,
	Linear,
	Link: LinkIcon,
	Loading: LoaderCircleIcon,
	Mail: MailIcon,
	Maximize: SquareIcon,
	Message: MessageSquareIcon,
	Minimize: MinusIcon,
	More: MoreHorizontalIcon,
	NewTab: SquarePlusIcon,
	NewWindow: AppWindowPlusIcon,
	Next: ChevronRightIcon,
	Palette: PaletteIcon,
	Paper,
	Pending: CircleIcon,
	Pin: PinIcon,
	Unpin: PinOffIcon,
	ReopenTab: RotateCcwIcon,
	Reply: ReplyIcon,
	Previous: ChevronLeftIcon,
	Restart: RotateCwIcon,
	Restore: CopyIcon,
	Routine: RepeatIcon,
	Reveal: EyeIcon,
	Retry: RefreshCwIcon,
	Search: SearchIcon,
	Send: ArrowUpIcon,
	Server: ServerIcon,
	Settings: SettingsIcon,
	Shield: ShieldIcon,
	ShieldCheck: ShieldCheckIcon,
	Sidebar: PanelLeftIcon,
	SidePanel: PanelRightIcon,
	Skill: SparklesIcon,
	Smartphone: SmartphoneIcon,
	Spaces: LayersIcon,
	Stop: SquareIcon,
	Success: CircleCheckIcon,
	Superset,
	SystemScheme: MonitorIcon,
	Terminal: TerminalIcon,
	Thinking: BrainIcon,
	ThumbsDown: ThumbsDownIcon,
	ThumbsUp: ThumbsUpIcon,
	Tool: WrenchIcon,
	User: UserIcon,
	Users: UsersIcon,
	Web: GlobeIcon,
	Write: PenLineIcon,
	X,
	Conversations: MessageIcon,
	Missions: FlagIcon,
}

const FillIcons = {
	Alert: TriangleAlertFillIcon,
	Bell: BellFillIcon,
	Clock: ClockFillIcon,
	Cloud: CloudFillIcon,
	Companions: HexagonsFillIcon,
	Conversations: MessageFillIcon,
	Cpu: CpuFillIcon,
	Docs: BookOpenFillIcon,
	File: FileTextFillIcon,
	Folder: FolderFillIcon,
	History: HistoryFillIcon,
	Image: ImageFillIcon,
	Info: InfoFillIcon,
	Json: CodeFillIcon,
	Language: LanguageFillIcon,
	Missions: FlagFillIcon,
	Palette: PaletteFillIcon,
	Server: ServerFillIcon,
	Settings: SettingsFillIcon,
	Shield: ShieldFillIcon,
	ShieldCheck: ShieldCheckFillIcon,
	Skill: SparklesFillIcon,
	Terminal: TerminalFillIcon,
	Tool: WrenchFillIcon,
	User: UserFillIcon,
	Users: UsersFillIcon,
	Web: GlobeFillIcon,
} satisfies Partial<Record<keyof typeof Icons, Icon>>

type FillIconName = keyof typeof FillIcons

const ConversationIcons = {
	MessageSquare: MessageSquareFillIcon,
	Bug: BugFillIcon,
	Rocket: RocketFillIcon,
	ShieldKey: ShieldKeyFillIcon,
	Pen: PenFillIcon,
	FileText: FileTextFillIcon,
	Download: DownloadFillIcon,
	Laptop: LaptopFillIcon,
	Smartphone: SmartphoneFillIcon,
	BookOpen: BookOpenFillIcon,
	CreditCard: CreditCardFillIcon,
	Megaphone: MegaphoneFillIcon,
	PanelLeft: PanelLeftFillIcon,
	Code: CodeFillIcon,
	Terminal: TerminalFillIcon,
	Server: ServerFillIcon,
	Globe: GlobeFillIcon,
	Palette: PaletteFillIcon,
	Lightbulb: LightbulbFillIcon,
	ChartLine: ChartLineFillIcon,
	Calendar: CalendarFillIcon,
	Users: UsersFillIcon,
	Flag: FlagFillIcon,
	Sparkles: SparklesFillIcon,
} satisfies Record<string, Icon>

type ConversationIconName = keyof typeof ConversationIcons

export {
	type ConversationIconName,
	ConversationIcons,
	type FillIconName,
	FillIcons,
	type Icon,
	type IconProps,
	Icons,
}
