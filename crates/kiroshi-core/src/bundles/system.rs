use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "kiroshi";

const MANIFEST: &str = ".claude-plugin/plugin.json";

const LEARN: &str = "skills/learn/SKILL.md";

const ROUTINES: &str = "skills/routines/SKILL.md";

const MISSIONS: &str = "skills/missions/SKILL.md";

const CONVERSATIONS: &str = "skills/conversations/SKILL.md";

const INSTALLS: &str = "skills/applications/SKILL.md";

const RICH_ANSWERS: &str = "skills/rich-answers/SKILL.md";

const VISUAL_FIRST: &str = "output-styles/visual-first.md";

pub const VISUAL_FIRST_STYLE: &str = "kiroshi:visual-first";

const TRIGGERS: &str = ".triggers.json";

const FILES: [(&str, &[u8]); 12] = [
	(MANIFEST, include_bytes!("../../plugins/kiroshi/.claude-plugin/plugin.json")),
	(TRIGGERS, include_bytes!("../../plugins/kiroshi/.triggers.json")),
	(LEARN, include_bytes!("../../plugins/kiroshi/skills/learn/SKILL.md")),
	(ROUTINES, include_bytes!("../../plugins/kiroshi/skills/routines/SKILL.md")),
	(INSTALLS, include_bytes!("../../plugins/kiroshi/skills/applications/SKILL.md")),
	(MISSIONS, include_bytes!("../../plugins/kiroshi/skills/missions/SKILL.md")),
	(CONVERSATIONS, include_bytes!("../../plugins/kiroshi/skills/conversations/SKILL.md")),
	(RICH_ANSWERS, include_bytes!("../../plugins/kiroshi/skills/rich-answers/SKILL.md")),
	(VISUAL_FIRST, include_bytes!("../../plugins/kiroshi/output-styles/visual-first.md")),
	(
		"skills/learn/references/skills.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/skills.md"),
	),
	(
		"skills/learn/references/mcp.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/mcp.md"),
	),
	(
		"skills/learn/references/determinism.md",
		include_bytes!("../../plugins/kiroshi/skills/learn/references/determinism.md"),
	),
];

pub fn path(core: &crate::core_context::Core) -> Option<PathBuf> {
	Some(core.data_dir().join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn write(path: &Path) -> std::io::Result<()> {
	for (name, bytes) in FILES {
		private_files::replace(&path.join(name), bytes)?;
	}
	prune(path, &embedded_paths(path));
	Ok(())
}

pub fn laid_down(core: &crate::core_context::Core) -> Option<PathBuf> {
	path(core).filter(|path| path.join(MANIFEST).is_file())
}

fn embedded_paths(path: &Path) -> HashSet<PathBuf> {
	FILES.iter().map(|(name, _)| path.join(name)).collect()
}

fn prune(dir: &Path, embedded: &HashSet<PathBuf>) {
	let Ok(entries) = fs::read_dir(dir) else {
		return;
	};
	for found in entries.flatten().map(|entry| entry.path()) {
		if found.is_dir() {
			prune(&found, embedded);
			let _ = fs::remove_dir(&found);
		} else if !embedded.contains(&found) {
			let _ = fs::remove_file(&found);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::super::{MEMORY_CLOSE, MEMORY_OPEN, SKILL_NAME};
	use super::*;
	use crate::db::connection::fixture_root;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_path(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("system-{name}"))
	}

	fn committed() -> PathBuf {
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join(PLUGIN_NAME)
	}

	fn committed_files(dir: &Path) -> Vec<PathBuf> {
		let Ok(entries) = fs::read_dir(dir) else {
			return Vec::new();
		};
		entries
			.flatten()
			.map(|entry| entry.path())
			.flat_map(|path| if path.is_dir() { committed_files(&path) } else { vec![path] })
			.collect()
	}

	fn embedded(name: &str) -> &'static [u8] {
		FILES
			.iter()
			.find(|(held, _)| *held == name)
			.map(|(_, bytes)| *bytes)
			.unwrap_or_else(|| panic!("{name} is embedded"))
	}

	fn app_version() -> String {
		env!("KIROSHI_APP_VERSION").to_owned()
	}

	#[test]
	fn the_manifest_carries_the_crate_version() {
		let manifest: serde_json::Value =
			serde_json::from_slice(embedded(MANIFEST)).expect("the manifest is JSON");

		assert_eq!(manifest["name"], PLUGIN_NAME);
		assert_eq!(manifest["version"], app_version());
	}

	#[test]
	fn the_learn_skill_carries_its_frontmatter_and_the_memory_markers() {
		let text = String::from_utf8_lossy(embedded(LEARN));

		assert!(text.contains("disable-model-invocation: true"), "got {text}");
		assert!(text.contains("preload: true"), "got {text}");
		assert!(text.contains(MEMORY_OPEN), "got {text}");
		assert!(text.contains(MEMORY_CLOSE), "got {text}");
	}

	#[test]
	fn the_learn_skill_bounds_what_the_space_directory_takes() {
		let text = String::from_utf8_lossy(embedded(LEARN));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		for said in [
			"## What the space directory takes",
			"never what it is working on",
			"Never keep a journal, a changelog or a log of the work",
			"Keep SKILL.md under 200 lines",
			"a rule that no longer holds is removed, never dated as closed",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_learn_skill_writes_the_own_directory_through_bundle_write_alone() {
		let text = String::from_utf8_lossy(embedded(LEARN));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		for said in [
			"through the `bundle_write` tool only, never through Edit, Write or Bash",
			"the `title` and `summary` fields of `bundle_write` say it, and replace `.learned.md`",
			"If the block is not there yet, `bundle_write` creates it on your first write",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_routines_skill_is_preloaded_and_says_when_to_ask_before_it_writes() {
		let text = String::from_utf8_lossy(embedded(ROUTINES));

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"List first.",
			"wait for their yes",
			"never a cron expression",
			"Routines panel",
			"works there exactly as anywhere else",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_missions_skill_is_preloaded_and_says_when_a_mission_closes() {
		let text = String::from_utf8_lossy(embedded(MISSIONS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"`working`",
			"`waiting_bot`",
			"`waiting_human`",
			"`ready_to_merge`",
			"`failed`",
			"`done`",
			"`mission_list`, the missions of this conversation, of every agent, open and closed,",
			"The missions of this conversation or of the space, of any agent, are seen with `mission_list` and read with `mission_read`.",
			"A mission closed too early is brought back with `mission_reopen`",
			"An objective or a ticket the person corrects is rewritten with `mission_update`",
			"A change of craft is a `mission_handoff`",
			"`mission_read`, one mission of the space read in full, whoever carries it",
			"`mission_list` and `mission_read` are open to every agent of the space.",
			"The other nine act only on a mission of yours",
			"Close every mission you opened that nothing else closed, once the work is over.",
			"When the pull request of a watched mission is merged, the mission closes as done on its",
			"A mission reaches `ready_to_merge` and `done` from its checkout only while its branch is",
			"A red CI, a failing test and a coding session that is blocked are work still to do in the",
			"Ask, never guess.",
			"`mission_open`",
			"`mission_note`",
			"`mission_watch`",
			"`mission_escalate`",
			"`mission_close`",
			"`mission_list`",
			"`mission_read`",
			"`mission_status`",
			"`mission_reopen`",
			"`mission_update`",
			"`mission_handoff`",
			"You hold eleven tools for them, on the `kiroshi` server.",
			"## What the conversation it came from hears",
			"`mission_status`, where the mission stands, written every time you stop working on it.",
			"Every time you stop working on a mission, you write its status yourself with `mission_status`, whether the work is over or only paused.",
			"Nothing writes it in your place: the conversation that mission came from hears only the status you write.",
			"It names, by name, whoever picks the work up next",
			"A status says where the mission stands, what moved since the last one, what is waiting, and on whom.",
			"Whoever reads that conversation followed nothing of the mission thread.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_status_section_of_the_missions_skill_says_nothing_of_the_work_and_orders_no_step() {
		let text = String::from_utf8_lossy(embedded(MISSIONS));
		let section = text
			.split("## What the conversation it came from hears")
			.nth(1)
			.expect("the status section is there")
			.split("\n## ")
			.next()
			.expect("the section ends");

		for unsaid in ["merge", "ticket", "pull request", "1."] {
			assert!(!section.contains(unsaid), "{unsaid} is said in {section}");
		}
	}

	#[test]
	fn the_conversations_skill_is_preloaded_and_says_when_a_room_is_worth_opening() {
		let text = String::from_utf8_lossy(embedded(CONVERSATIONS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"`conversation_open`, a new room led by you, answering the id of that room, its title and the agents seated in it.",
			"`conversation_say`, one message in a room you already hold a seat in, answering the id of that room and its title.",
			"`companion_list`, every agent of this space, answering for each one its id, its name and its job.",
			"`conversation_update` seats agents with `add` and takes them out with `remove`, in this conversation, and in another room of the caller when a room id is passed.",
			"The subject belongs to agents who are not in this conversation.",
			"The work runs long and does not belong in the thread it was raised in.",
			"A question you can answer on the spot opens no room",
			"No room is opened for the convenience of the agent opening it.",
			"The title is the subject in a few words, read by someone who followed none of it.",
			"It takes the title and the icon of the room in the same call.",
			"A room is opened with its title and its icon chosen together, the icon picked from `packages/shared/conversation-icons.json` for the subject the title names.",
			"A title change carries its icon in the same call, never the title alone.",
			"The first message is written by you in your own words, and it is read in your name.",
			"An agent is seated by `with`, and it is summoned by an at sign followed by its exact name inside the message.",
			"A room opened with nobody mentioned is a room where nothing happens.",
			"An agent passed to `with`, `add` and `remove` is named by its name or by its id.",
			"A name two agents of this space share is refused, and the refusal answers their ids: pass the id of the one you want in place of that name.",
			"A room is found with `conversation_list` and read with `conversation_read` before an answer is sent in it.",
			"A room is changed with `conversation_update`",
			"A room you no longer belong in is left by passing yourself to `remove` on `conversation_update`.",
			"A room whose subject is settled is closed with `conversation_close`",
			"You speak only in a room you hold a seat in, and you seat yourself in no room.",
			"The person does not read the new room unless they open it.",
			"Whatever the person decides is asked in the conversation the person is talking in.",
			"Opening a room is reported in one line carrying its title, in the conversation the room was opened from.",
			"`conversation_attach`, one file stored for your message, here or in a room you hold a seat in, answering the path it was stored under, the id of that conversation and the markdown line that shows the file inside your message.",
			"Reading an image with `Read` shows it to you and never to the person.",
			"A file you show sits inside your message as the markdown line `conversation_attach` answers, never as its path.",
			"Store the file with `conversation_attach`, then write that line, exactly as answered, where your reply cites the file",
			"You hold nine tools for them, on the `kiroshi` server.",
			"`conversation_update`, the title, the icon, the colour and the seats of a conversation you hold a seat in, every field given landing in one call or none of them, answering that conversation as it stands after the call.",
			"The colour is a hue, a whole number from 0 to 359 around the colour wheel, or one of red, orange, yellow, green, cyan, blue, purple or pink for the hue that name stands for, or null to give the room back its default colour.",
			"`conversation_close`, the archive of a room you lead once its subject is settled, answering the id of that room, its title and whether it is archived.",
			"A main conversation and the thread of a mission still open are never closed.",
			"An archived room comes back with `archived` false on `conversation_update`, and `archived` true there is refused: only `conversation_close` archives.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
		for retired in [
			"companion_invite",
			"conversation_describe",
			"the only way back",
			"nothing lists",
			"To show a file, call",
		] {
			assert!(!text.contains(retired), "{retired} is still named");
		}
	}

	#[test]
	fn the_applications_skill_is_preloaded_and_says_where_an_install_goes_and_what_follows() {
		let text = String::from_utf8_lossy(embedded(INSTALLS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(text.contains("preload: true"), "got {text}");
		for said in [
			"applies when the person asks for an application or asks for one to be installed",
			"go to `When no tool of yours does it`",
			"Search before you install.",
			"`AskUserQuestion`",
			"`metadata.source` set to `application-scope:`",
			"exactly as it answered it",
			"`companion`, you alone, in every conversation you are part of.",
			"`space`, every agent of",
			"`user`, the person",
			"Install only in the destination the person picked",
			"Never ask for a key",
			"never repeat one",
			"there is nothing left to do",
			"the name of the secret",
			"Settings panel of that destination",
			"Connect lives in the Settings panel of that destination",
			"## When no tool of yours does it The person asks for something no tool of this session does: a capability none of your tools holds.",
			"Not a refusal of scope, not a rule you follow, not something the person already ruled out.",
			"call `application_search` on that capability. Never ask the person whether to look.",
			"no match, you name the capability that is out of reach, you say you cannot do it, and the search stays unmentioned.",
			"a match, you name one application and say in one line what it unblocks, and that the person installs it from Settings.",
			"One offer per subject, never a second application.",
			"Never call `application_install` here.",
			"When the person has turned an offer down, you never raise it again in this conversation.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	fn rich_answer_reference() -> String {
		let path = PathBuf::from(crate::REPO_DIR).join("docs/chat/rich-answer-blocks.md");
		fs::read_to_string(path).expect("the rich answer reference reads")
	}

	fn block_sections(reference: &str) -> Vec<&str> {
		reference
			.split("\n## Blocks\n")
			.nth(1)
			.expect("the reference lists its blocks")
			.split("\n## ")
			.next()
			.expect("the blocks section ends")
			.split("\n### ")
			.skip(1)
			.collect()
	}

	fn line_after<'a>(section: &'a str, prefix: &str) -> &'a str {
		section
			.lines()
			.find_map(|line| line.strip_prefix(prefix))
			.unwrap_or_else(|| panic!("{prefix} is missing from {section}"))
	}

	fn form_of(section: &str) -> &str {
		line_after(section, "Form: `")
			.strip_suffix('`')
			.map(str::trim)
			.unwrap_or_else(|| panic!("the form of {section} closes its code span"))
	}

	fn example_of(section: &str) -> &str {
		section
			.split("````markdown\n")
			.nth(1)
			.and_then(|rest| rest.split("\n````").next())
			.unwrap_or_else(|| panic!("the example of {section} is missing"))
	}

	#[test]
	fn no_skill_names_a_tool_the_library_tools_replaced() {
		for (name, bytes) in FILES {
			let text = String::from_utf8_lossy(bytes);
			for replaced in [
				"`document_read`",
				"`document_write`",
				"`library_write`",
				"`board_read`",
				"`board_add`",
				"`board_remove`",
			] {
				assert!(!text.contains(replaced), "{name} still names {replaced}");
			}
		}
	}

	#[test]
	fn the_rich_answers_skill_is_preloaded_and_names_every_block_of_the_reference() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let reference = rich_answer_reference();
		let sections = block_sections(&reference);

		assert!(text.contains("disable-model-invocation: true"), "got {text}");
		assert!(text.contains("preload: true"), "got {text}");
		assert_eq!(sections.len(), 10, "the reference names ten blocks");
		for section in sections {
			let form = form_of(section);
			assert!(text.contains(form), "{form} is missing");
		}
	}

	#[test]
	fn the_rich_answers_skill_states_the_syntax_of_the_reference() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let reference = rich_answer_reference();

		for section in block_sections(&reference) {
			let example = example_of(section);
			assert!(text.contains(example), "{example} is missing");
		}
		let functions = line_after(&reference, "Functions: ");
		assert!(text.contains(&format!("Functions: {functions}")), "{functions} is missing");
	}

	#[test]
	fn the_rich_answers_skill_leads_with_structure_over_prose() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");

		assert!(!said_in_one_breath.contains("plain prose otherwise"), "got {text}");
		for said in [
			"Reach for the construct that fits the content first:",
			"Prose is the few lines that tie those visuals together, and the answer stays short.",
			"When a person asks for a checklist of steps, write the checklist block.",
			"never JSON and never HTML",
			"Never put a script, HTML, a network fetch, a storage access or a name that is not a declared slider in it.",
		] {
			assert!(said_in_one_breath.contains(said), "{said} is missing");
		}
	}

	#[test]
	fn the_rich_answers_skill_writes_no_options_fence() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));

		assert!(!text.contains(&format!("```{OPTIONS}")), "got {text}");
	}

	const OPTIONS: &str = "options";

	const MARKDOWN: &str = "components.tsx";

	const BLOCKS: &str = "answer-block-source.ts";

	const MARKS: &str = "answer-marks.ts";

	const RENDERED: &[(&str, &[(&str, &str)])] = &[
		("Table", &[(MARKDOWN, "table: MarkdownTable,")]),
		("Mermaid diagram", &[("mermaid.tsx", "MERMAID_LANGUAGE = \"mermaid\"")]),
		("Code", &[(MARKDOWN, "pre: MarkdownPre,")]),
		("Math", &[("math.tsx", "MATH_LANGUAGE = \"math\"")]),
		("Image", &[(MARKDOWN, "img: MarkdownImage,")]),
		("Link", &[(MARKDOWN, "a: MarkdownLink,")]),
		("Heading", &[("prose.ts", "h1,h2,h3,h4,h5,h6")]),
		("Checklist", &[(MARKDOWN, "input: MarkdownTaskCheckbox,")]),
		("Quoted selection", &[(MARKDOWN, "blockquote: MarkdownBlockquote,")]),
		(
			"Large image",
			&[(MARKDOWN, "figure: MarkdownFigure,"), (MARKS, "SOURCE_LEAD = \"Source: \"")],
		),
		("Callout note", &[(MARKS, "NOTE: \"note\"")]),
		("Callout tip", &[(MARKS, "TIP: \"tip\"")]),
		("Callout warning", &[(MARKS, "WARNING: \"warning\"")]),
		("Illustrated list", &[(BLOCKS, "\"illustrated-list\": readIllustratedList,")]),
		("Interactive view", &[(BLOCKS, "interactive: readInteractive,")]),
		("Collapsible section", &[(BLOCKS, "collapsible: readCollapsible,")]),
		("Web page card", &[(BLOCKS, "\"web-page\": readWebPage,")]),
		("Gallery", &[(BLOCKS, "gallery: readGallery,")]),
		("Checklist card", &[(BLOCKS, "checklist: readChecklist,")]),
		("Video", &[(BLOCKS, "video: readVideo,")]),
		("Map", &[(BLOCKS, "map: readMap,")]),
		("Raw HTML", &[("raw-html.ts", "type: \"literalHtml\"")]),
		(
			"An address that is not `https://`",
			&[
				("block-body.ts", "protocol === \"https:\""),
				(MARKS, "isHttpsUrl(src) &&"),
				("sanitize.ts", "...defaultSchema,"),
			],
		),
		(
			"A local file path",
			&[("link.tsx", "EXTERNAL_SCHEMES = new Set([\"http:\", \"https:\"])")],
		),
		(
			"A fence label the chat does not draw",
			&[("code.tsx", "return <MarkdownFence code={source} language={language} />")],
		),
		(
			"A callout kind other than NOTE, TIP and WARNING",
			&[(MARKS, "\\[!(NOTE|TIP|WARNING)\\]")],
		),
	];

	fn renderer(file: &str) -> String {
		let path =
			PathBuf::from(crate::REPO_DIR).join("packages/ui/src/components/markdown").join(file);
		fs::read_to_string(&path).unwrap_or_else(|_| panic!("{file} of the renderer reads"))
	}

	fn outside_examples(text: &str) -> Vec<&str> {
		let mut is_example = false;
		text.lines()
			.filter(|line| {
				if line.starts_with("````") {
					is_example = !is_example;
				}
				!is_example
			})
			.collect()
	}

	fn named_constructs(text: &str) -> Vec<&str> {
		outside_examples(text)
			.into_iter()
			.filter_map(|line| {
				line.strip_prefix("### ")
					.or_else(|| line.strip_prefix("- **").and_then(|rest| rest.split("**").next()))
			})
			.collect()
	}

	#[test]
	fn every_construct_the_rich_answers_skill_names_is_an_entry_of_the_renderer() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let named = named_constructs(&text);
		for construct in &named {
			let (_, entries) = RENDERED
				.iter()
				.find(|(name, _)| name == construct)
				.unwrap_or_else(|| panic!("{construct} maps to no renderer entry"));
			for (file, entry) in *entries {
				assert!(renderer(file).contains(entry), "{entry} is gone from {file}");
			}
		}
		for (name, _) in RENDERED {
			assert!(named.contains(name), "the skill no longer names {name}");
		}
	}

	#[test]
	fn the_rich_answers_skill_writes_every_fenced_block_the_renderer_reads() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let source = renderer(BLOCKS);
		let readers = source
			.split("const READERS")
			.nth(1)
			.and_then(|rest| rest.split("> = {\n").nth(1))
			.and_then(|rest| rest.split("\n}").next())
			.expect("the renderer lists its block readers");

		let labels: Vec<&str> = readers
			.lines()
			.filter_map(|line| line.trim().split(':').next())
			.map(|label| label.trim_matches('"'))
			.filter(|label| *label != OPTIONS)
			.collect();
		assert!(!labels.is_empty(), "the renderer reads no fenced block");
		for label in labels {
			let form = format!("Form: ` ```{label} `");
			assert!(text.contains(&form), "{form} is missing");
		}
		for label in ["mermaid", "math"] {
			let fence = format!("labelled `{label}`");
			assert!(text.contains(&fence), "{fence} is missing");
		}
	}

	#[test]
	fn the_visual_first_style_is_the_one_the_sdk_finds_in_the_system_plugin() {
		let text = String::from_utf8_lossy(embedded(VISUAL_FIRST));
		let stem = VISUAL_FIRST
			.strip_prefix("output-styles/")
			.and_then(|name| name.strip_suffix(".md"))
			.expect("the style sits in the plugin's output-styles directory");
		let front = text.split("\n---\n").next().expect("the style opens on its front");

		assert_eq!(VISUAL_FIRST_STYLE, format!("{PLUGIN_NAME}:{stem}"));
		assert!(!front.lines().any(|line| line.starts_with("name:")), "got {front}");
		assert!(front.contains("keep-coding-instructions: true"), "got {front}");
	}

	#[test]
	fn the_visual_first_style_keeps_the_brevity_of_concise_and_formats_visual_first() {
		let text = String::from_utf8_lossy(embedded(VISUAL_FIRST));

		for said in [
			"**Lead with the result**",
			"no closing recap of what you already said",
			"**Cut narration, keep substance**",
			"**Format follows the visual-first rule**",
			"a table for any comparison, a Mermaid diagram for a flow or a timeline",
		] {
			assert!(text.contains(said), "{said} is missing");
		}
		assert!(!text.contains("plain prose"), "got {text}");
	}

	#[test]
	fn the_rich_answers_skill_asks_for_the_preview_image_of_a_web_page() {
		let text = String::from_utf8_lossy(embedded(RICH_ANSWERS));
		let said_in_one_breath = text.split_whitespace().collect::<Vec<_>>().join(" ");
		let said =
			"When you know the preview image of the page you opened, write both `image` and `alt`.";

		assert!(said_in_one_breath.contains(said), "{said} is missing");
	}

	#[test]
	fn every_committed_file_is_embedded() {
		let root = committed();

		for file in committed_files(&root) {
			let name = file
				.strip_prefix(&root)
				.expect("the file sits under the plugin")
				.to_string_lossy()
				.replace('\\', "/");
			assert_eq!(embedded(&name), fs::read(&file).expect("it reads"), "got {name}");
		}
	}

	#[test]
	fn the_written_plugin_is_the_embedded_directory() {
		let path = a_path("written");

		write(&path).expect("the plugin is written");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_write_overwrites_a_hand_edit_and_drops_a_stray_file() {
		let path = a_path("rewritten");
		write(&path).expect("the plugin is written");
		private_files::replace(&path.join(MANIFEST), b"{\"name\":\"mine\"}")
			.expect("the hand edit lands");
		let stray = path.join("skills").join("mine").join(SKILL_NAME);
		private_files::replace(&stray, b"mine").expect("the stray file lands");

		write(&path).expect("the plugin is written again");

		for (name, bytes) in FILES {
			assert_eq!(fs::read(path.join(name)).expect("it reads"), bytes, "got {name}");
		}
		assert!(!stray.exists(), "the stray file is gone");
		assert!(!stray.parent().expect("it has a directory").exists(), "the directory is gone");

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_write_prunes_the_library_skill_an_older_version_laid_down() {
		let path = a_path("older-library");
		let library = path.join("skills").join("library").join(SKILL_NAME);
		private_files::replace(&library, b"older").expect("the older skill lands");

		write(&path).expect("the plugin is written");

		assert!(!library.exists(), "the library skill is gone");
		assert!(!path.join("skills").join("library").exists(), "its directory is gone");

		let _ = fs::remove_dir_all(&path);
	}
}
