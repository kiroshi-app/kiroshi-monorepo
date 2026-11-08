pub(super) const ADJACENT_BLOCKS: &str = r##"The archive pass finished at 09:12, and every block below follows the one before it with nothing between them but the margin the prose rules declare.

- read the nest
- summarise the occupants
- archive the record

```ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
```

| nest | occupants |
| :--- | ---: |
| nest_42 | 3 |
| nest_43 | 0 |

Two nests archived since the last pass."##;

pub(super) const AUTOLINKS: &str = r##"Docs live at https://kiroshi.dev and issues go to nest@kiroshi.dev.

An explicit [link](https://kiroshi.dev/changelog) reads the same."##;

pub(super) const AWKWARD_TABLE: &str = r##"| cell | copies as |
| --- | --- |
| **bold** with `code` | inline markdown, flattened |
| left	right | one field, not two |
| ![nest crest](nest-crest.png) | the alt text |
| pipe \| inside | the escaped pipe |
|  | an empty field |"##;

pub(super) const BLOCKQUOTE: &str = r##"> The sync ran twice and the second pass found nothing.

Followed by prose.

> An outer quote
>
> > holding an inner one."##;

pub(super) const BOARD_IN_CHECKLIST: &str = r##"- [ ] Review Launch week plan with the team
  - [ ] Book the launch room"##;

pub(super) const BOARD_IN_LIST_SENTENCE: &str = r##"- Split Launch week plan into owners before Friday
  - Ana takes the timeline"##;

pub(super) const BOARD_IN_TABLE_CELL: &str = r##"| Board | Owner |
| - | - |
| Draft in Launch week plan | Ana |"##;

pub(super) const CODE: &str = r##"Inline `bun run storybook` starts it, the fence carries the file:

```ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
```"##;

pub(super) const CODE_COPY: &str = r##"```bash
bun run test --project=unit

	bun run lint
```"##;

pub(super) const CODE_CSS: &str = r##"```css
.nest-card {
	display: grid;
	gap: 0.5rem;
	color: var(--foreground);
}
```"##;

pub(super) const CODE_HTML: &str = r##"```html
<article class="nest-card">
	<h2>Nest 42</h2>
	<p>3 occupants</p>
</article>
```"##;

pub(super) const CODE_LONG_LINE: &str = r##"```ts
const migration = { table: "nest_occupants", columns: ["id", "nest_id", "display_name", "joined_at", "left_at", "role"], indexes: ["nest_id_joined_at"] }
```"##;

pub(super) const CODE_LONG_SOURCE: &str = r##"```ts
export const nest0 = { id: "nest_0", occupants: 0 }
export const nest1 = { id: "nest_1", occupants: 1 }
export const nest2 = { id: "nest_2", occupants: 2 }
export const nest3 = { id: "nest_3", occupants: 3 }
export const nest4 = { id: "nest_4", occupants: 4 }
export const nest5 = { id: "nest_5", occupants: 5 }
export const nest6 = { id: "nest_6", occupants: 6 }
export const nest7 = { id: "nest_7", occupants: 0 }
export const nest8 = { id: "nest_8", occupants: 1 }
export const nest9 = { id: "nest_9", occupants: 2 }
export const nest10 = { id: "nest_10", occupants: 3 }
export const nest11 = { id: "nest_11", occupants: 4 }
export const nest12 = { id: "nest_12", occupants: 5 }
export const nest13 = { id: "nest_13", occupants: 6 }
export const nest14 = { id: "nest_14", occupants: 0 }
export const nest15 = { id: "nest_15", occupants: 1 }
export const nest16 = { id: "nest_16", occupants: 2 }
export const nest17 = { id: "nest_17", occupants: 3 }
export const nest18 = { id: "nest_18", occupants: 4 }
export const nest19 = { id: "nest_19", occupants: 5 }
export const nest20 = { id: "nest_20", occupants: 6 }
export const nest21 = { id: "nest_21", occupants: 0 }
export const nest22 = { id: "nest_22", occupants: 1 }
export const nest23 = { id: "nest_23", occupants: 2 }
export const nest24 = { id: "nest_24", occupants: 3 }
export const nest25 = { id: "nest_25", occupants: 4 }
export const nest26 = { id: "nest_26", occupants: 5 }
export const nest27 = { id: "nest_27", occupants: 6 }
export const nest28 = { id: "nest_28", occupants: 0 }
export const nest29 = { id: "nest_29", occupants: 1 }
export const nest30 = { id: "nest_30", occupants: 2 }
export const nest31 = { id: "nest_31", occupants: 3 }
export const nest32 = { id: "nest_32", occupants: 4 }
export const nest33 = { id: "nest_33", occupants: 5 }
export const nest34 = { id: "nest_34", occupants: 6 }
export const nest35 = { id: "nest_35", occupants: 0 }
export const nest36 = { id: "nest_36", occupants: 1 }
export const nest37 = { id: "nest_37", occupants: 2 }
export const nest38 = { id: "nest_38", occupants: 3 }
export const nest39 = { id: "nest_39", occupants: 4 }
export const nest40 = { id: "nest_40", occupants: 5 }
export const nest41 = { id: "nest_41", occupants: 6 }
export const nest42 = { id: "nest_42", occupants: 0 }
export const nest43 = { id: "nest_43", occupants: 1 }
export const nest44 = { id: "nest_44", occupants: 2 }
export const nest45 = { id: "nest_45", occupants: 3 }
export const nest46 = { id: "nest_46", occupants: 4 }
export const nest47 = { id: "nest_47", occupants: 5 }
export const nest48 = { id: "nest_48", occupants: 6 }
export const nest49 = { id: "nest_49", occupants: 0 }
export const nest50 = { id: "nest_50", occupants: 1 }
export const nest51 = { id: "nest_51", occupants: 2 }
export const nest52 = { id: "nest_52", occupants: 3 }
export const nest53 = { id: "nest_53", occupants: 4 }
export const nest54 = { id: "nest_54", occupants: 5 }
export const nest55 = { id: "nest_55", occupants: 6 }
export const nest56 = { id: "nest_56", occupants: 0 }
export const nest57 = { id: "nest_57", occupants: 1 }
export const nest58 = { id: "nest_58", occupants: 2 }
export const nest59 = { id: "nest_59", occupants: 3 }
export const nest60 = { id: "nest_60", occupants: 4 }
export const nest61 = { id: "nest_61", occupants: 5 }
export const nest62 = { id: "nest_62", occupants: 6 }
export const nest63 = { id: "nest_63", occupants: 0 }
export const nest64 = { id: "nest_64", occupants: 1 }
export const nest65 = { id: "nest_65", occupants: 2 }
export const nest66 = { id: "nest_66", occupants: 3 }
export const nest67 = { id: "nest_67", occupants: 4 }
export const nest68 = { id: "nest_68", occupants: 5 }
export const nest69 = { id: "nest_69", occupants: 6 }
export const nest70 = { id: "nest_70", occupants: 0 }
export const nest71 = { id: "nest_71", occupants: 1 }
export const nest72 = { id: "nest_72", occupants: 2 }
export const nest73 = { id: "nest_73", occupants: 3 }
export const nest74 = { id: "nest_74", occupants: 4 }
export const nest75 = { id: "nest_75", occupants: 5 }
export const nest76 = { id: "nest_76", occupants: 6 }
export const nest77 = { id: "nest_77", occupants: 0 }
export const nest78 = { id: "nest_78", occupants: 1 }
export const nest79 = { id: "nest_79", occupants: 2 }
export const nest80 = { id: "nest_80", occupants: 3 }
export const nest81 = { id: "nest_81", occupants: 4 }
export const nest82 = { id: "nest_82", occupants: 5 }
export const nest83 = { id: "nest_83", occupants: 6 }
export const nest84 = { id: "nest_84", occupants: 0 }
export const nest85 = { id: "nest_85", occupants: 1 }
export const nest86 = { id: "nest_86", occupants: 2 }
export const nest87 = { id: "nest_87", occupants: 3 }
export const nest88 = { id: "nest_88", occupants: 4 }
export const nest89 = { id: "nest_89", occupants: 5 }
export const nest90 = { id: "nest_90", occupants: 6 }
export const nest91 = { id: "nest_91", occupants: 0 }
export const nest92 = { id: "nest_92", occupants: 1 }
export const nest93 = { id: "nest_93", occupants: 2 }
export const nest94 = { id: "nest_94", occupants: 3 }
export const nest95 = { id: "nest_95", occupants: 4 }
export const nest96 = { id: "nest_96", occupants: 5 }
export const nest97 = { id: "nest_97", occupants: 6 }
export const nest98 = { id: "nest_98", occupants: 0 }
export const nest99 = { id: "nest_99", occupants: 1 }
export const nest100 = { id: "nest_100", occupants: 2 }
export const nest101 = { id: "nest_101", occupants: 3 }
export const nest102 = { id: "nest_102", occupants: 4 }
export const nest103 = { id: "nest_103", occupants: 5 }
export const nest104 = { id: "nest_104", occupants: 6 }
export const nest105 = { id: "nest_105", occupants: 0 }
export const nest106 = { id: "nest_106", occupants: 1 }
export const nest107 = { id: "nest_107", occupants: 2 }
export const nest108 = { id: "nest_108", occupants: 3 }
export const nest109 = { id: "nest_109", occupants: 4 }
export const nest110 = { id: "nest_110", occupants: 5 }
export const nest111 = { id: "nest_111", occupants: 6 }
export const nest112 = { id: "nest_112", occupants: 0 }
export const nest113 = { id: "nest_113", occupants: 1 }
export const nest114 = { id: "nest_114", occupants: 2 }
export const nest115 = { id: "nest_115", occupants: 3 }
export const nest116 = { id: "nest_116", occupants: 4 }
export const nest117 = { id: "nest_117", occupants: 5 }
export const nest118 = { id: "nest_118", occupants: 6 }
export const nest119 = { id: "nest_119", occupants: 0 }
export const nest120 = { id: "nest_120", occupants: 1 }
export const nest121 = { id: "nest_121", occupants: 2 }
export const nest122 = { id: "nest_122", occupants: 3 }
export const nest123 = { id: "nest_123", occupants: 4 }
export const nest124 = { id: "nest_124", occupants: 5 }
export const nest125 = { id: "nest_125", occupants: 6 }
export const nest126 = { id: "nest_126", occupants: 0 }
export const nest127 = { id: "nest_127", occupants: 1 }
export const nest128 = { id: "nest_128", occupants: 2 }
export const nest129 = { id: "nest_129", occupants: 3 }
export const nest130 = { id: "nest_130", occupants: 4 }
export const nest131 = { id: "nest_131", occupants: 5 }
export const nest132 = { id: "nest_132", occupants: 6 }
export const nest133 = { id: "nest_133", occupants: 0 }
export const nest134 = { id: "nest_134", occupants: 1 }
export const nest135 = { id: "nest_135", occupants: 2 }
export const nest136 = { id: "nest_136", occupants: 3 }
export const nest137 = { id: "nest_137", occupants: 4 }
export const nest138 = { id: "nest_138", occupants: 5 }
export const nest139 = { id: "nest_139", occupants: 6 }
export const nest140 = { id: "nest_140", occupants: 0 }
export const nest141 = { id: "nest_141", occupants: 1 }
export const nest142 = { id: "nest_142", occupants: 2 }
export const nest143 = { id: "nest_143", occupants: 3 }
export const nest144 = { id: "nest_144", occupants: 4 }
export const nest145 = { id: "nest_145", occupants: 5 }
export const nest146 = { id: "nest_146", occupants: 6 }
export const nest147 = { id: "nest_147", occupants: 0 }
export const nest148 = { id: "nest_148", occupants: 1 }
export const nest149 = { id: "nest_149", occupants: 2 }
export const nest150 = { id: "nest_150", occupants: 3 }
export const nest151 = { id: "nest_151", occupants: 4 }
export const nest152 = { id: "nest_152", occupants: 5 }
export const nest153 = { id: "nest_153", occupants: 6 }
export const nest154 = { id: "nest_154", occupants: 0 }
export const nest155 = { id: "nest_155", occupants: 1 }
export const nest156 = { id: "nest_156", occupants: 2 }
export const nest157 = { id: "nest_157", occupants: 3 }
export const nest158 = { id: "nest_158", occupants: 4 }
export const nest159 = { id: "nest_159", occupants: 5 }
export const nest160 = { id: "nest_160", occupants: 6 }
export const nest161 = { id: "nest_161", occupants: 0 }
export const nest162 = { id: "nest_162", occupants: 1 }
export const nest163 = { id: "nest_163", occupants: 2 }
export const nest164 = { id: "nest_164", occupants: 3 }
export const nest165 = { id: "nest_165", occupants: 4 }
export const nest166 = { id: "nest_166", occupants: 5 }
export const nest167 = { id: "nest_167", occupants: 6 }
export const nest168 = { id: "nest_168", occupants: 0 }
export const nest169 = { id: "nest_169", occupants: 1 }
export const nest170 = { id: "nest_170", occupants: 2 }
export const nest171 = { id: "nest_171", occupants: 3 }
export const nest172 = { id: "nest_172", occupants: 4 }
export const nest173 = { id: "nest_173", occupants: 5 }
export const nest174 = { id: "nest_174", occupants: 6 }
export const nest175 = { id: "nest_175", occupants: 0 }
export const nest176 = { id: "nest_176", occupants: 1 }
export const nest177 = { id: "nest_177", occupants: 2 }
export const nest178 = { id: "nest_178", occupants: 3 }
export const nest179 = { id: "nest_179", occupants: 4 }
export const nest180 = { id: "nest_180", occupants: 5 }
export const nest181 = { id: "nest_181", occupants: 6 }
export const nest182 = { id: "nest_182", occupants: 0 }
export const nest183 = { id: "nest_183", occupants: 1 }
export const nest184 = { id: "nest_184", occupants: 2 }
export const nest185 = { id: "nest_185", occupants: 3 }
export const nest186 = { id: "nest_186", occupants: 4 }
export const nest187 = { id: "nest_187", occupants: 5 }
export const nest188 = { id: "nest_188", occupants: 6 }
export const nest189 = { id: "nest_189", occupants: 0 }
export const nest190 = { id: "nest_190", occupants: 1 }
export const nest191 = { id: "nest_191", occupants: 2 }
export const nest192 = { id: "nest_192", occupants: 3 }
export const nest193 = { id: "nest_193", occupants: 4 }
export const nest194 = { id: "nest_194", occupants: 5 }
export const nest195 = { id: "nest_195", occupants: 6 }
export const nest196 = { id: "nest_196", occupants: 0 }
export const nest197 = { id: "nest_197", occupants: 1 }
export const nest198 = { id: "nest_198", occupants: 2 }
export const nest199 = { id: "nest_199", occupants: 3 }
export const nest200 = { id: "nest_200", occupants: 4 }
export const nest201 = { id: "nest_201", occupants: 5 }
export const nest202 = { id: "nest_202", occupants: 6 }
export const nest203 = { id: "nest_203", occupants: 0 }
export const nest204 = { id: "nest_204", occupants: 1 }
export const nest205 = { id: "nest_205", occupants: 2 }
export const nest206 = { id: "nest_206", occupants: 3 }
export const nest207 = { id: "nest_207", occupants: 4 }
export const nest208 = { id: "nest_208", occupants: 5 }
export const nest209 = { id: "nest_209", occupants: 6 }
export const nest210 = { id: "nest_210", occupants: 0 }
export const nest211 = { id: "nest_211", occupants: 1 }
export const nest212 = { id: "nest_212", occupants: 2 }
export const nest213 = { id: "nest_213", occupants: 3 }
export const nest214 = { id: "nest_214", occupants: 4 }
export const nest215 = { id: "nest_215", occupants: 5 }
export const nest216 = { id: "nest_216", occupants: 6 }
export const nest217 = { id: "nest_217", occupants: 0 }
export const nest218 = { id: "nest_218", occupants: 1 }
export const nest219 = { id: "nest_219", occupants: 2 }
export const nest220 = { id: "nest_220", occupants: 3 }
export const nest221 = { id: "nest_221", occupants: 4 }
export const nest222 = { id: "nest_222", occupants: 5 }
export const nest223 = { id: "nest_223", occupants: 6 }
export const nest224 = { id: "nest_224", occupants: 0 }
export const nest225 = { id: "nest_225", occupants: 1 }
export const nest226 = { id: "nest_226", occupants: 2 }
export const nest227 = { id: "nest_227", occupants: 3 }
export const nest228 = { id: "nest_228", occupants: 4 }
export const nest229 = { id: "nest_229", occupants: 5 }
export const nest230 = { id: "nest_230", occupants: 6 }
export const nest231 = { id: "nest_231", occupants: 0 }
export const nest232 = { id: "nest_232", occupants: 1 }
export const nest233 = { id: "nest_233", occupants: 2 }
export const nest234 = { id: "nest_234", occupants: 3 }
export const nest235 = { id: "nest_235", occupants: 4 }
export const nest236 = { id: "nest_236", occupants: 5 }
export const nest237 = { id: "nest_237", occupants: 6 }
export const nest238 = { id: "nest_238", occupants: 0 }
export const nest239 = { id: "nest_239", occupants: 1 }
```"##;

pub(super) const CODE_MARKDOWN: &str = r##"```md
# Nest 42

- 3 occupants
- archived: **no**
```"##;

pub(super) const CODE_PYTHON: &str = r##"```python
def summarise(nest_id: str) -> dict:
	nest = read_nest(nest_id)
	return {"id": nest.id, "occupants": len(nest.occupants)}
```"##;

pub(super) const CODE_RUST: &str = r##"```rust
pub fn summarise(nest: &Nest) -> Summary {
	let occupants = nest.occupants.iter().filter(|o| o.active).count();
	Summary { id: nest.id.clone(), occupants }
}
```"##;

pub(super) const CODE_UNKNOWN: &str = r##"```elixir
def summarise(nest_id) do
	nest = Nest.read(nest_id)
	%{id: nest.id, occupants: length(nest.occupants)}
end
```

A fence with no label at all:

```
nest_42 archived at 18:04
```"##;

pub(super) const CODE_YAML: &str = r##"```yaml
nest: nest_42
occupants: 3
archived: false
```"##;

pub(super) const DECEPTIVE_LINKS: &str = r##"Userinfo hides the host: [https://kiroshi.dev@evil.test/reports](https://kiroshi.dev@evil.test/reports).

A text with no scheme parses as nothing: [kiroshi.dev/download](https://evil.test/payload).

A homograph reads as latin: [https://оpennest.dev/login](https://оpennest.dev/login).

Emphasis is an element, not a string: [**https://kiroshi.dev**](https://evil.test/steal).

A protocol-relative href would move this very window: [https://kiroshi.dev](//evil.test/steal).

A mailto under a web address opens a draft, not a page: [https://kiroshi.dev](mailto:steal@evil.test)."##;

pub(super) const DESTINATIONS: &str = r##"Every link carries where it goes: [the changelog](https://kiroshi.dev/changelog), [our roadmap](https://www.kiroshi.dev/roadmap), and a URL typed bare, https://kiroshi.dev/docs.

Mail stays with the reader: nest@kiroshi.dev."##;

pub(super) const DISPLAY_MATH: &str = r##"The cost of a sync grows with the roster:

$$
c(n) = \sum_{i=1}^{n} \frac{o_i}{2^{i}} + \log_2 n
$$

Past $n = 40$ the term on the right stops mattering."##;

pub(super) const EMPHASIS: &str = r##"The sync is **required**, the retry is _optional_, and the old flag is ~~deprecated~~.

Call `readNest(id)` before `summarise(id)`, never the other way around."##;

pub(super) const FILE_CITED_AMONG_CODE_PATHS: &str = r##"The revenue line in [the Q3 report](</Users/ana/Library/Kiroshi/attachments/conversation-7/0b6f3c2e-8d41-4a7e-9c15-2f7d9e4a1b30.pdf>) matches the ledger. The reader lives in [host.ts](src/lib/host.ts), the next steps are in [the plan](../notes/plan.md), and the rounding rule follows [the ledger guide](https://example.org/ledger)."##;

pub(super) const FILE_CITED_MID_ANSWER: &str = r##"I went through [the Q3 report](</Users/ana/Library/Kiroshi/attachments/conversation-7/0b6f3c2e-8d41-4a7e-9c15-2f7d9e4a1b30.pdf>) and the revenue line matches the ledger, so nothing is left to reconcile before Friday."##;

pub(super) const FOOTNOTES: &str = r##"The sync dedupes on the client id[^dedupe], not on the timestamp[^clock].

[^dedupe]: Set in `useTranscriptSocket` before the cache merge.
[^clock]: Two hosts can disagree by seconds."##;

pub(super) const FRAGMENT_LINK: &str = r##"The counts come from the last sync[^count], and the method sits in the [summary](#summary) closing this answer.

[^count]: Measured on the client, after the cache merge."##;

pub(super) const FULL: &str = r##"# Nest report

The sync ran **twice** and the second pass found ~~nothing~~ one change[^1].

## Occupants

1. read the nest
2. summarise it
	- resident
		- arrived this week

Progress:

- [x] read the nest
- [ ] archive the record

> | nest | occupants |
> | --- | --- |
> | nest_42 | 3 |

---

Run `bun run test` — docs at https://kiroshi.dev.

[^1]: nest_43 lost its last occupant."##;

pub(super) const HEADINGS: &str = r##"# Nest report
## Occupants
### Arrivals
#### Departures
##### Pending checks
###### Metadata

A paragraph between two headings, so the vertical rhythm is visible.

# Nest with `readNest()`"##;

pub(super) const IMAGE_CITED_MID_ANSWER: &str = r##"Here is the patio the way it looked on Thursday.

![The patio at noon](</Users/ana/Library/Kiroshi/attachments/conversation-7/4f9a2c1e-7b3d-4e8a-9f61-0c2d5b7e3a14.jpg>)

The shade reaches the table around two, so lunch is better under the vine."##;

pub(super) const INERT_SCHEMES: &str = r##"A scheme this app cannot open is not a link: [join the channel](irc://kiroshi.dev/nest).

Neither is a path that would resolve against this window: [settings](/settings).

Neither is a script: [looks like a link](javascript:alert('nest'))."##;

pub(super) const INLINE_MATH: &str = r##"The dedupe window is $\Delta t < 250\,\text{ms}$, so a retry inside $2^{-2}$ of a second collapses into the first — and a plan at $5 a month keeps its dollar sign."##;

pub(super) const LISTS: &str = r##"Unordered:

- occupants
- arrivals
- departures

Ordered:

1. read the nest
2. summarise it
3. archive it"##;

pub(super) const LONG_URL: &str = r##"https://kiroshi.dev/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a"##;

pub(super) const MALFORMED: &str = r##"# unclosed **bold and `code

| nest | occupants
| ---
| nest_42

[broken](https://kiroshi.dev

:::unknown-block
content
:::"##;

pub(super) const MALFORMED_MATH: &str = r##"An expression that never closes its brace: $\frac{1}{$.

$$
\begin{bmatrix} 1 & 2 \\ 3
$$

The next one still typesets: $e^{i\pi} + 1 = 0$."##;

pub(super) const MALFORMED_MERMAID: &str = r##"A diagram that never states its edges:

```mermaid
flowchart TD
	A[Read the nest] -->
	--> {{
```

The next one still draws:

```mermaid
flowchart LR
	A[Read] --> B[Archive]
```"##;

pub(super) const MANY_HOSTS: &str = r##"One answer naming seven places at once: [the changelog](https://kiroshi.dev/changelog), [the spec](https://html.spec.whatwg.org/multipage/links.html), [a search](https://www.google.com/search?q=nest), [a paper](https://arxiv.org/abs/2401.00001), [an internal tracker](https://tracker.internal.test/issue/42), [a directory](https://пример.рф/каталог) and [the box on this desk](https://192.168.1.1/admin)."##;

pub(super) const MERMAID_FLOWCHART: &str = r##"```mermaid
flowchart TD
	A[Read the nest] --> B{Occupants?}
	B -- yes --> C[Summarise]
	B -- no --> D[Archive]
	C --> E[Notify the owner]
	D --> E
```"##;

pub(super) const MERMAID_WIDE: &str = r##"```mermaid
flowchart LR
	A[Read the nest] --> B[Merge the cache] --> C[Dedupe on client id] --> D[Summarise occupants] --> E[Archive the record] --> F[Notify the owner]
```"##;

pub(super) const NARROW_TABLE: &str = r##"| nest | occupants |
| --- | ---: |
| nest_42 | 3 |"##;

pub(super) const NESTED_BLOCKS: &str = r##"> The sync ran twice.
>
> The second pass found nothing.

1. Read the nest.

   Then summarise what it holds.

   - resident
   - visitor

2. Archive the record."##;

pub(super) const NESTED_LIST: &str = r##"- occupants
	- resident
		- arrived this week
		- arrived last week
	- visitor
- structure
	- roof
		- repaired"##;

pub(super) const OVERSIZED_MATH: &str = r##"A matrix past what an expression may cost:

$$
\begin{matrix} 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \\ 0 & 1 & 2 & 3 & 4 & 5 & 6 & 7 & 8 & 9 & 10 & 11 & 12 & 13 & 14 & 15 & 16 & 17 & 18 & 19 \end{matrix}
$$

The next one still typesets: $e^{i\pi} + 1 = 0$."##;

pub(super) const PATHS_WITH_SPACES: &str = r##"The photo you sent:

![The patio at noon](</Users/ana/Library/Application Support/Kiroshi/attachments/conversation 7/8e1d6b30-2c5f-4a97-b8e4-61f0a3c9d725.jpg>)

And the final numbers sit in [the Q3 report](</Users/ana/Library/Application Support/Kiroshi/attachments/conversation 7/d3a7e9f2-5b18-4c60-a2d4-9e7f1b6c0a58.pdf>)."##;

pub(super) const PRESERVED_WHITESPACE: &str = r##"Walk me through every package.

Start with the design system,
then the Tauri shell,
and anything crossing between them.

nest_42   active
nest_43       empty

A code span keeps its own run: `a     b` beside `a b`.

- one item, pasted
  across two lines

| cell | padded |
| --- | --- |
| a     b | a b |

> quoted line one
> and quoted line two"##;

pub(super) const RAW_HTML: &str = r##"The agent answered with <b>bold</b> in the middle of a sentence, and the **markdown** around it still reads as markdown.

The block below is what is being discussed, not the layout of this answer:

<section class="report" data-nest="42">
  <h2>Occupants</h2>
  <p>Three, one of them new.</p>
</section>

Every character it was written with is on screen, its indentation included."##;

pub(super) const RAW_HTML_IN_LIST: &str = r##"- ```ts
  const nest = readNest(42)
  ```
  <section class="report">
    <h2>Occupants</h2>
  </section>
- | nest | occupants |
  | --- | --- |
  | nest_42 | 3 |
  <section class="report">
    <h2>Arrivals</h2>
  </section>
- > The second pass found one change.
  <section class="report">
    <h2>Departures</h2>
  </section>
- - a nested item
  <section class="report">
    <h2>Pending</h2>
  </section>"##;

pub(super) const TABLE: &str = r##"| nest | occupants | status | archived |
| :--- | ---: | :---: | --- |
| nest_42 | 3 | active | no |
| nest_43 | 0 | empty | yes |
| nest_44 | 12 | active | no |"##;

pub(super) const TABLE_IN_BLOCKQUOTE: &str = r##"> Counts as of the last sync:
>
> | nest | occupants | archived |
> | --- | --- | --- |
> | nest_42 | 3 | no |
> | nest_43 | 0 | yes |
>
> Two rows changed since yesterday."##;

pub(super) const TASK_LIST: &str = r##"- [x] read the nest
- [x] summarise the occupants
- [ ] archive the record
- [ ] notify the owner"##;

pub(super) const THEMATIC_BREAK: &str = r##"The first pass finished.

---

The second pass started."##;

pub(super) const TYPESET_BUBBLE: &str = r##"## Nest report

The nest answers to `readNest(id)` and holds three occupants.

- occupants
	- resident
		- arrived this week
	- visitor
- structure

> The sync ran twice and the second pass found nothing.

```ts
export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}
```

| nest | occupants | joined | left | role | invited by | last sync | note |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| nest_42 | 3 | 2026-01-04 | — | resident | nest_01 | 2026-08-18 09:12 | rejoined after the archive pass |
| nest_43 | 0 | 2025-11-27 | 2026-02-02 | visitor | nest_42 | 2026-08-18 09:12 | last occupant left before the sync |
| nest_44 | 12 | 2024-07-19 | — | resident | nest_01 | 2026-08-17 23:58 | the widest roster on record |"##;

pub(super) const USER_BLOCK: &str = r##"Run `bun run test` before merging — the dedupe now lives in `useTranscriptSocket`, next to the cache merge, and not in the store, see [the changelog](https://kiroshi.dev/changelog):

```bash
bun run test --project=unit
```"##;

pub(super) const WIDE_TABLE: &str = r##"| nest | occupants | joined | left | role | invited by | last sync | note |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| nest_42 | 3 | 2026-01-04 | — | resident | nest_01 | 2026-08-18 09:12 | rejoined after the archive pass |
| nest_43 | 0 | 2025-11-27 | 2026-02-02 | visitor | nest_42 | 2026-08-18 09:12 | last occupant left before the sync |
| nest_44 | 12 | 2024-07-19 | — | resident | nest_01 | 2026-08-17 23:58 | the widest roster on record |"##;

pub(super) const MERMAID_FLOWCHART_SOURCE: &str = r##"flowchart TD
	A["Read the nest"] --> B{"Any occupants?"}
	B -- none --> C["Archive the record"]
	B -- some --> D["Summarise the roster"]
	D --> E["Notify the owner"]"##;

pub(super) const MERMAID_WIDE_SOURCE: &str = r##"flowchart LR
	A["Receive the sync request"] --> B["Read every occupant record"]
	B --> C["Reconcile arrivals and departures"]
	C --> D["Recompute the occupancy counts"]
	D --> E["Write the report for the owner"]"##;

pub(super) const MERMAID_MALFORMED_SOURCE: &str = r##"flowchart TD
	A["Read the nest"] --> {{"##;

pub(super) const MATH_DISPLAY_SOURCE: &str = r##"\sum_{i=1}^{n} o_i = \frac{3n}{4}"##;

pub(super) const MATH_INLINE_SOURCE: &str = r##"n = 40"##;

pub(super) const MATH_MALFORMED_SOURCE: &str = r##"\frac{1}{"##;

pub(super) const FENCE_TYPESCRIPT_SOURCE: &str = r##"import { readNest } from "@example/core"

export const summarise = async (id: string) => {
	const nest = await readNest(id)
	return { id: nest.id, occupants: nest.occupants.length }
}"##;

pub(super) const FENCE_UNKNOWN_LANGUAGE_SOURCE: &str = r##"nest nest_42 {
	occupants 3
	archived no
}"##;

pub(super) const FENCE_LONG_SOURCE: &str = r##"export const nest0 = { occupants: 0 }
export const nest1 = { occupants: 1 }
export const nest2 = { occupants: 2 }
export const nest3 = { occupants: 3 }
export const nest4 = { occupants: 4 }
export const nest5 = { occupants: 5 }
export const nest6 = { occupants: 6 }
export const nest7 = { occupants: 0 }
export const nest8 = { occupants: 1 }
export const nest9 = { occupants: 2 }
export const nest10 = { occupants: 3 }
export const nest11 = { occupants: 4 }
export const nest12 = { occupants: 5 }
export const nest13 = { occupants: 6 }
export const nest14 = { occupants: 0 }
export const nest15 = { occupants: 1 }
export const nest16 = { occupants: 2 }
export const nest17 = { occupants: 3 }
export const nest18 = { occupants: 4 }
export const nest19 = { occupants: 5 }
export const nest20 = { occupants: 6 }
export const nest21 = { occupants: 0 }
export const nest22 = { occupants: 1 }
export const nest23 = { occupants: 2 }
export const nest24 = { occupants: 3 }
export const nest25 = { occupants: 4 }
export const nest26 = { occupants: 5 }
export const nest27 = { occupants: 6 }
export const nest28 = { occupants: 0 }
export const nest29 = { occupants: 1 }
export const nest30 = { occupants: 2 }
export const nest31 = { occupants: 3 }
export const nest32 = { occupants: 4 }
export const nest33 = { occupants: 5 }
export const nest34 = { occupants: 6 }
export const nest35 = { occupants: 0 }
export const nest36 = { occupants: 1 }
export const nest37 = { occupants: 2 }
export const nest38 = { occupants: 3 }
export const nest39 = { occupants: 4 }
export const nest40 = { occupants: 5 }
export const nest41 = { occupants: 6 }
export const nest42 = { occupants: 0 }
export const nest43 = { occupants: 1 }
export const nest44 = { occupants: 2 }
export const nest45 = { occupants: 3 }
export const nest46 = { occupants: 4 }
export const nest47 = { occupants: 5 }
export const nest48 = { occupants: 6 }
export const nest49 = { occupants: 0 }
export const nest50 = { occupants: 1 }
export const nest51 = { occupants: 2 }
export const nest52 = { occupants: 3 }
export const nest53 = { occupants: 4 }
export const nest54 = { occupants: 5 }
export const nest55 = { occupants: 6 }
export const nest56 = { occupants: 0 }
export const nest57 = { occupants: 1 }
export const nest58 = { occupants: 2 }
export const nest59 = { occupants: 3 }
export const nest60 = { occupants: 4 }
export const nest61 = { occupants: 5 }
export const nest62 = { occupants: 6 }
export const nest63 = { occupants: 0 }
export const nest64 = { occupants: 1 }
export const nest65 = { occupants: 2 }
export const nest66 = { occupants: 3 }
export const nest67 = { occupants: 4 }
export const nest68 = { occupants: 5 }
export const nest69 = { occupants: 6 }
export const nest70 = { occupants: 0 }
export const nest71 = { occupants: 1 }
export const nest72 = { occupants: 2 }
export const nest73 = { occupants: 3 }
export const nest74 = { occupants: 4 }
export const nest75 = { occupants: 5 }
export const nest76 = { occupants: 6 }
export const nest77 = { occupants: 0 }
export const nest78 = { occupants: 1 }
export const nest79 = { occupants: 2 }
export const nest80 = { occupants: 3 }
export const nest81 = { occupants: 4 }
export const nest82 = { occupants: 5 }
export const nest83 = { occupants: 6 }
export const nest84 = { occupants: 0 }
export const nest85 = { occupants: 1 }
export const nest86 = { occupants: 2 }
export const nest87 = { occupants: 3 }
export const nest88 = { occupants: 4 }
export const nest89 = { occupants: 5 }
export const nest90 = { occupants: 6 }
export const nest91 = { occupants: 0 }
export const nest92 = { occupants: 1 }
export const nest93 = { occupants: 2 }
export const nest94 = { occupants: 3 }
export const nest95 = { occupants: 4 }
export const nest96 = { occupants: 5 }
export const nest97 = { occupants: 6 }
export const nest98 = { occupants: 0 }
export const nest99 = { occupants: 1 }
export const nest100 = { occupants: 2 }
export const nest101 = { occupants: 3 }
export const nest102 = { occupants: 4 }
export const nest103 = { occupants: 5 }
export const nest104 = { occupants: 6 }
export const nest105 = { occupants: 0 }
export const nest106 = { occupants: 1 }
export const nest107 = { occupants: 2 }
export const nest108 = { occupants: 3 }
export const nest109 = { occupants: 4 }
export const nest110 = { occupants: 5 }
export const nest111 = { occupants: 6 }
export const nest112 = { occupants: 0 }
export const nest113 = { occupants: 1 }
export const nest114 = { occupants: 2 }
export const nest115 = { occupants: 3 }
export const nest116 = { occupants: 4 }
export const nest117 = { occupants: 5 }
export const nest118 = { occupants: 6 }
export const nest119 = { occupants: 0 }
export const nest120 = { occupants: 1 }
export const nest121 = { occupants: 2 }
export const nest122 = { occupants: 3 }
export const nest123 = { occupants: 4 }
export const nest124 = { occupants: 5 }
export const nest125 = { occupants: 6 }
export const nest126 = { occupants: 0 }
export const nest127 = { occupants: 1 }
export const nest128 = { occupants: 2 }
export const nest129 = { occupants: 3 }
export const nest130 = { occupants: 4 }
export const nest131 = { occupants: 5 }
export const nest132 = { occupants: 6 }
export const nest133 = { occupants: 0 }
export const nest134 = { occupants: 1 }
export const nest135 = { occupants: 2 }
export const nest136 = { occupants: 3 }
export const nest137 = { occupants: 4 }
export const nest138 = { occupants: 5 }
export const nest139 = { occupants: 6 }
export const nest140 = { occupants: 0 }
export const nest141 = { occupants: 1 }
export const nest142 = { occupants: 2 }
export const nest143 = { occupants: 3 }
export const nest144 = { occupants: 4 }
export const nest145 = { occupants: 5 }
export const nest146 = { occupants: 6 }
export const nest147 = { occupants: 0 }
export const nest148 = { occupants: 1 }
export const nest149 = { occupants: 2 }
export const nest150 = { occupants: 3 }
export const nest151 = { occupants: 4 }
export const nest152 = { occupants: 5 }
export const nest153 = { occupants: 6 }
export const nest154 = { occupants: 0 }
export const nest155 = { occupants: 1 }
export const nest156 = { occupants: 2 }
export const nest157 = { occupants: 3 }
export const nest158 = { occupants: 4 }
export const nest159 = { occupants: 5 }
export const nest160 = { occupants: 6 }
export const nest161 = { occupants: 0 }
export const nest162 = { occupants: 1 }
export const nest163 = { occupants: 2 }
export const nest164 = { occupants: 3 }
export const nest165 = { occupants: 4 }
export const nest166 = { occupants: 5 }
export const nest167 = { occupants: 6 }
export const nest168 = { occupants: 0 }
export const nest169 = { occupants: 1 }
export const nest170 = { occupants: 2 }
export const nest171 = { occupants: 3 }
export const nest172 = { occupants: 4 }
export const nest173 = { occupants: 5 }
export const nest174 = { occupants: 6 }
export const nest175 = { occupants: 0 }
export const nest176 = { occupants: 1 }
export const nest177 = { occupants: 2 }
export const nest178 = { occupants: 3 }
export const nest179 = { occupants: 4 }
export const nest180 = { occupants: 5 }
export const nest181 = { occupants: 6 }
export const nest182 = { occupants: 0 }
export const nest183 = { occupants: 1 }
export const nest184 = { occupants: 2 }
export const nest185 = { occupants: 3 }
export const nest186 = { occupants: 4 }
export const nest187 = { occupants: 5 }
export const nest188 = { occupants: 6 }
export const nest189 = { occupants: 0 }
export const nest190 = { occupants: 1 }
export const nest191 = { occupants: 2 }
export const nest192 = { occupants: 3 }
export const nest193 = { occupants: 4 }
export const nest194 = { occupants: 5 }
export const nest195 = { occupants: 6 }
export const nest196 = { occupants: 0 }
export const nest197 = { occupants: 1 }
export const nest198 = { occupants: 2 }
export const nest199 = { occupants: 3 }
export const nest200 = { occupants: 4 }
export const nest201 = { occupants: 5 }
export const nest202 = { occupants: 6 }
export const nest203 = { occupants: 0 }
export const nest204 = { occupants: 1 }
export const nest205 = { occupants: 2 }
export const nest206 = { occupants: 3 }
export const nest207 = { occupants: 4 }
export const nest208 = { occupants: 5 }
export const nest209 = { occupants: 6 }
export const nest210 = { occupants: 0 }
export const nest211 = { occupants: 1 }
export const nest212 = { occupants: 2 }
export const nest213 = { occupants: 3 }
export const nest214 = { occupants: 4 }
export const nest215 = { occupants: 5 }
export const nest216 = { occupants: 6 }
export const nest217 = { occupants: 0 }
export const nest218 = { occupants: 1 }
export const nest219 = { occupants: 2 }
export const nest220 = { occupants: 3 }
export const nest221 = { occupants: 4 }
export const nest222 = { occupants: 5 }
export const nest223 = { occupants: 6 }
export const nest224 = { occupants: 0 }
export const nest225 = { occupants: 1 }
export const nest226 = { occupants: 2 }
export const nest227 = { occupants: 3 }
export const nest228 = { occupants: 4 }
export const nest229 = { occupants: 5 }
export const nest230 = { occupants: 6 }
export const nest231 = { occupants: 0 }
export const nest232 = { occupants: 1 }
export const nest233 = { occupants: 2 }
export const nest234 = { occupants: 3 }
export const nest235 = { occupants: 4 }
export const nest236 = { occupants: 5 }
export const nest237 = { occupants: 6 }
export const nest238 = { occupants: 0 }
export const nest239 = { occupants: 1 }"##;

pub(super) const SPAN_PLAIN_TEXT: &str = r##"the failing migration"##;

pub(super) const TASKS_TASKS: &str = r##"- [x] Read the nest
- [x] Summarise the occupants
- [ ] Archive the record
- [ ] Notify the owner"##;

pub(super) const TASKS_NESTED_TASKS: &str = r##"- [x] Book the venue
  - [ ] Confirm the caterer
- [ ] Send the invites
  - [x] Draft the guest list"##;

pub(super) const TASKS_LOOSE_TASKS: &str = r##"Here is where the move stands.

- [x] Read the nest

- [ ] Archive the record

  Keep the occupants list with it, the owner asks for that one first.

- [ ] Notify the owner"##;

pub(super) const TASKS_LINKED_TASKS: &str = r##"- [ ] Read [the brief](https://brief.invalid/) before the call
- [ ] Notify the owner"##;

pub(super) const BLOCK_MULTI_FILE_PATCH: &str = r##"diff --git a/packages/core/src/nest/run-history.ts b/packages/core/src/nest/run-history.ts
--- a/packages/core/src/nest/run-history.ts
+++ b/packages/core/src/nest/run-history.ts
@@ -12,7 +12,7 @@
-const RUN_HISTORY_TABLE = "nest_runs"
+const RUN_HISTORY_TABLE = "nest_run_history"
diff --git a/packages/core/src/nest/summarise.ts b/packages/core/src/nest/summarise.ts
--- a/packages/core/src/nest/summarise.ts
+++ b/packages/core/src/nest/summarise.ts
@@ -4,3 +4,3 @@
-	const occupants = nest.occupants
+	const occupants = nest.occupants ?? []"##;

pub(super) const SNIPPET_BASH: &str = r##"bun run nest:sync --workspace packages/ui
bun run types"##;

pub(super) const SNIPPET_LONG_LINE: &str = r##"bun run nest:sync --workspace packages/ui --tint sky --spaces home,work,lab --out packages/ui/src/components/nest/generated/nest-manifest.ts --verbose"##;

pub(super) const BOARD_ALONE: &str = r##"Here is the board for the launch.

[Launch week plan](<boards/Launch week plan.canvas>)

Open it beside the thread to move things around."##;

pub(super) const BOARD_IN_SENTENCE: &str = r##"I sketched [Launch week plan](<boards/Launch week plan.canvas>) so we can split the work before Friday."##;

pub(super) const HOSTILE: &str = r##"<script>document.documentElement.dataset.nest = "owned"</script>

<style>[data-slot="markdown"] { display: none }</style>

<iframe src="https://evil.test/frame"></iframe>

<img src="https://evil.test/pixel.png" onerror="document.documentElement.dataset.nest = 'owned'" />

[looks like a link](javascript:alert('nest'))

```mermaid
flowchart TD
	A["<script>alert(1)</script>"] --> B["<span onclick='alert(1)'>tap</span>"]
```

Prose after the payload still renders."##;
