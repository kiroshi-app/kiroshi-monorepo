import type { LibraryItem } from "@workspace/ui/components/library-grid"
import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

const DUNES = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#2b3a55'/><circle cx='118' cy='30' r='14' fill='#f6c177'/><path d='M0 70 Q40 50 80 68 T160 62 V100 H0Z' fill='#c9895b'/><path d='M0 84 Q50 66 100 82 T160 80 V100 H0Z' fill='#8f5a3c'/></svg>",
)}`

const HARBOUR = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='1000' viewBox='0 0 140 100'><rect width='140' height='100' fill='#0f2a3d'/><rect y='60' width='140' height='40' fill='#123e57'/><rect x='18' y='38' width='22' height='22' fill='#e2e8f0'/><rect x='46' y='30' width='16' height='30' fill='#94a3b8'/><rect x='92' y='42' width='30' height='18' fill='#cbd5e1'/></svg>",
)}`

const FERN = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1200' viewBox='0 0 100 120'><rect width='100' height='120' fill='#14281d'/><ellipse cx='50' cy='60' rx='18' ry='46' fill='#3f7d4e'/><ellipse cx='30' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(-24 30 70)'/><ellipse cx='70' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(24 70 70)'/></svg>",
)}`

const DASHBOARD = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#f4f4f5'/><rect width='34' height='100' fill='#18181b'/><rect x='44' y='12' width='60' height='8' rx='2' fill='#27272a'/><rect x='44' y='30' width='50' height='30' rx='3' fill='#bfdbfe'/><rect x='100' y='30' width='50' height='30' rx='3' fill='#fde68a'/><rect x='44' y='68' width='106' height='22' rx='3' fill='#e4e4e7'/></svg>",
)}`

const DUSK = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1200' viewBox='0 0 100 100'><rect width='100' height='100' fill='#3b1f47'/><rect y='55' width='100' height='45' fill='#7a3b5c'/><circle cx='50' cy='55' r='18' fill='#f59e8b'/><rect y='70' width='100' height='30' fill='#2a1633'/></svg>",
)}`

const SKETCH = `data:image/svg+xml,${encodeURIComponent(
	"<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 160 90'><rect width='160' height='90' fill='#fafaf9'/><path d='M20 70 L60 30 L90 55 L140 20' stroke='#1c1917' stroke-width='2' fill='none'/><circle cx='60' cy='30' r='4' fill='#ef4444'/><circle cx='90' cy='55' r='4' fill='#3b82f6'/></svg>",
)}`

const BRIEF_EXCERPT =
	"# Spring launch brief\n\nWhat we're shipping on the 14th, who it's for and the three messages every page repeats.\n\n## Audience\n\nTeams of five to twenty who already keep their notes in a shared folder."

const MEETING_EXCERPT =
	"# Weekly sync\n\nThe onboarding copy is final; the pricing page waits on the new screenshots.\n\n## Decisions\n\n- Ship the import strip first\n- Keep the templates to three"

const RESEARCH_EXCERPT =
	"# Interview notes\n\nSix conversations with design leads about where their references live today.\n\n## Patterns\n\nEveryone keeps a folder nobody else can find."

const CHECKLIST_EXCERPT =
	"# Launch checklist\n\n- Final copy review\n- Screenshots at 2x\n- Release notes drafted\n- Support macros updated"

export const LIBRARY_ITEMS: LibraryItem[] = [
	{
		kind: "image",
		id: "dunes",
		name: "hero-dunes.png",
		detail: "PNG · 248 KB · 8 min ago",
		src: DUNES,
	},
	{
		kind: "image",
		id: "dashboard",
		name: "dashboard-redesign.png",
		detail: "PNG · 412 KB · 12 min ago",
		src: DASHBOARD,
	},
	{
		kind: "document",
		id: "brief",
		name: "Spring launch brief",
		detail: "Document · 4 KB · 21 min ago",
		excerpt: BRIEF_EXCERPT,
	},
	{
		kind: "image",
		id: "harbour",
		name: "harbour-at-night.jpg",
		detail: "JPG · 1.2 MB · 1 h ago",
		src: HARBOUR,
	},
	{
		kind: "image",
		id: "fern",
		name: "fern-study.jpg",
		detail: "JPG · 864 KB · 2 h ago",
		src: FERN,
	},
	{
		kind: "document",
		id: "sync",
		name: "Weekly sync",
		detail: "Document · 2 KB · 3 h ago",
		excerpt: MEETING_EXCERPT,
	},
	{
		kind: "image",
		id: "dusk",
		name: "dusk-palette.png",
		detail: "PNG · 96 KB · Yesterday",
		src: DUSK,
	},
	{
		kind: "image",
		id: "sketch",
		name: "growth-sketch.png",
		detail: "PNG · 132 KB · Yesterday",
		src: SKETCH,
	},
	{
		kind: "document",
		id: "interviews",
		name: "Interview notes",
		detail: "Document · 6 KB · 2 days ago",
		excerpt: RESEARCH_EXCERPT,
	},
	{
		kind: "image",
		id: "dunes-wide",
		name: "dunes-wide.png",
		detail: "PNG · 310 KB · 3 days ago",
		src: DUNES,
	},
	{
		kind: "document",
		id: "checklist",
		name: "Launch checklist",
		detail: "Document · 1 KB · 4 days ago",
		excerpt: CHECKLIST_EXCERPT,
	},
	{
		kind: "image",
		id: "harbour-dawn",
		name: "harbour-at-dawn.jpg",
		detail: "JPG · 1.1 MB · Last week",
		src: HARBOUR,
	},
]

export const LIBRARY_LIGHTBOX_IMAGES: LibraryLightboxImage[] = [
	{
		id: "dunes",
		name: "hero-dunes.png",
		detail: "PNG · 1600 × 1000 · 248 KB",
		src: DUNES,
	},
	{
		id: "dashboard",
		name: "dashboard-redesign.png",
		detail: "PNG · 1600 × 1000 · 412 KB",
		src: DASHBOARD,
	},
	{
		id: "harbour",
		name: "harbour-at-night.jpg",
		detail: "JPG · 1400 × 1000 · 1.2 MB",
		src: HARBOUR,
	},
	{
		id: "fern",
		name: "fern-study.jpg",
		detail: "JPG · 1000 × 1200 · 864 KB",
		src: FERN,
	},
	{
		id: "dusk",
		name: "dusk-palette.png",
		detail: "PNG · 1200 × 1200 · 96 KB",
		src: DUSK,
	},
	{
		id: "sketch",
		name: "growth-sketch.png",
		detail: "PNG · 1600 × 900 · 132 KB",
		src: SKETCH,
	},
	{
		id: "dunes-wide",
		name: "dunes-wide.png",
		detail: "PNG · 1600 × 1000 · 310 KB",
		src: DUNES,
	},
	{
		id: "harbour-dawn",
		name: "harbour-at-dawn.jpg",
		detail: "JPG · 1400 × 1000 · 1.1 MB",
		src: HARBOUR,
	},
]
