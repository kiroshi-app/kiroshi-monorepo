use std::collections::HashSet;

use super::*;

const EVERY_KIND: &str = "# Plan\n\nIntro text.\n\n- one\n- two\n\n* [ ] task\n* [x] done\n\n> quoted\n\n```rust\nfn main() {}\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\n![chart](chart.png)";

fn kinds(text: &str) -> Vec<BlockKind> {
	blocks_of(text).iter().map(|block| block.kind).collect()
}

fn ids(text: &str) -> Vec<Option<String>> {
	blocks_of(text).into_iter().map(|block| block.id).collect()
}

fn sources(text: &str) -> Vec<&str> {
	blocks_of(text).into_iter().map(|block| &text[block.content]).collect()
}

fn applied(text: &str, splices: &[Splice]) -> String {
	let mut text = text.to_owned();
	for splice in splices.iter().rev() {
		text.replace_range(splice.range.clone(), &splice.text);
	}
	text
}

fn backfilled(text: &str) -> String {
	applied(text, &backfill(text))
}

#[test]
fn every_top_level_kind_is_one_block() {
	assert_eq!(
		kinds(EVERY_KIND),
		[
			BlockKind::Heading,
			BlockKind::Paragraph,
			BlockKind::List,
			BlockKind::Checklist,
			BlockKind::Quote,
			BlockKind::Code,
			BlockKind::Table,
			BlockKind::Rule,
			BlockKind::Image,
		]
	);
	assert_eq!(
		blocks_of("## Goal\n\nSub\n===").iter().map(|block| block.level).collect::<Vec<_>>(),
		[Some(2), Some(1)]
	);
}

#[test]
fn a_list_holds_its_loose_items_and_nested_lines_and_ends_at_an_unindented_paragraph() {
	let text = "- one\n\n- two\n  more of two\n  - nested\n\nAfter.";

	assert_eq!(kinds(text), [BlockKind::List, BlockKind::Paragraph]);
	assert_eq!(sources(text)[0], "- one\n\n- two\n  more of two\n  - nested");
}

#[test]
fn a_fence_holds_blank_lines_and_marker_shaped_lines_as_code() {
	let text = "```\n# not a heading\n\n^abc123\n```";

	assert_eq!(kinds(text), [BlockKind::Code]);
	assert_eq!(ids(text), [None]);
}

#[test]
fn a_paragraph_interrupted_by_a_heading_is_two_blocks() {
	assert_eq!(
		kinds("Text\n# Title\nMore"),
		[BlockKind::Paragraph, BlockKind::Heading, BlockKind::Paragraph]
	);
}

#[test]
fn backfill_gives_every_block_a_unique_id_and_keeps_its_kind_and_content() {
	let text = backfilled(EVERY_KIND);

	assert_eq!(kinds(&text), kinds(EVERY_KIND));
	assert_eq!(sources(&text), sources(EVERY_KIND));
	let held: Vec<String> =
		ids(&text).into_iter().map(|id| id.expect("every block holds an id")).collect();
	assert_eq!(held.iter().collect::<HashSet<_>>().len(), held.len());
	assert!(held
		.iter()
		.all(|id| id.len() == 6 && id.bytes().all(|byte| ID_ALPHABET.contains(&byte))));
	assert!(backfill(&text).is_empty());
	assert!(!text.contains('<'), "{text}");
}

#[test]
fn an_id_ends_the_last_line_of_a_heading_or_a_paragraph_and_stands_below_any_other_block() {
	let text = backfilled("# Plan\n\nIntro.\n\n- one\n\n---");
	let held: Vec<String> = ids(&text).into_iter().flatten().collect();

	assert_eq!(
		text,
		format!(
			"# Plan ^{}\n\nIntro. ^{}\n\n- one\n\n^{}\n\n---\n\n^{}",
			held[0], held[1], held[2], held[3]
		)
	);
}

#[test]
fn backfill_keeps_every_existing_id_and_renews_only_a_duplicate() {
	let text = "# Plan ^aaaaaa\n\nOne. ^bbbbbb\n\nCopy. ^bbbbbb\n\nNew.";
	let filled = backfilled(text);
	let held = ids(&filled);

	assert_eq!(held[0].as_deref(), Some("aaaaaa"));
	assert_eq!(held[1].as_deref(), Some("bbbbbb"));
	assert!(held[2].as_deref().is_some_and(|id| id != "bbbbbb"));
	assert!(held[3].is_some());
	assert_eq!(sources(&filled), ["# Plan", "One.", "Copy.", "New."]);
	assert!(backfill(&filled).is_empty());
}

#[test]
fn a_block_glued_to_the_next_one_gets_its_id_on_a_line_apart_from_both() {
	let text = backfilled("```\ncode\n```\nAfter.");

	assert_eq!(kinds(&text), [BlockKind::Code, BlockKind::Paragraph]);
	assert_eq!(sources(&text), ["```\ncode\n```", "After."]);
	assert!(ids(&text).iter().all(Option::is_some));
}

#[test]
fn an_unclosed_fence_is_closed_before_its_id_so_the_id_stays_out_of_the_code() {
	let text = backfilled("Intro.\n\n```\ncode");

	assert_eq!(kinds(&text), [BlockKind::Paragraph, BlockKind::Code]);
	assert_eq!(sources(&text)[1], "```\ncode\n```");
	assert!(ids(&text).iter().all(Option::is_some));
}

#[test]
fn a_heading_with_a_closing_sequence_gets_its_id_below_it() {
	let text = backfilled("# Plan #");

	assert_eq!(sources(&text), ["# Plan #"]);
	assert!(text.starts_with("# Plan #\n\n^"), "{text}");
}

#[test]
fn a_marker_with_no_block_to_name_is_no_block() {
	assert_eq!(kinds("^abcdef\n\n# Plan ^aaaaaa\n\n^bbbbbb"), [BlockKind::Heading]);
	assert_eq!(ids("^abcdef\n\n# Plan ^aaaaaa\n\n^bbbbbb"), [Some("aaaaaa".to_owned())]);
}

#[test]
fn written_markdown_drops_every_marker_the_agent_sent_and_names_each_block_anew() {
	let mut taken = HashSet::from(["aaaaaa".to_owned()]);

	let written = written(
		"# Title ^aaaaaa\nBody. ^bbbbbb ^cccccc\n\n- item\n\n^dddddd\n\n^eeeeee",
		None,
		&mut taken,
	)
	.expect("blocks are written");

	assert_eq!(written.ids.len(), 3);
	assert!(written
		.ids
		.iter()
		.all(|id| !["aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee"].contains(&id.as_str())));
	assert_eq!(sources(&written.text), ["# Title", "Body.", "- item"]);
	assert_eq!(ids(&written.text), written.ids.iter().cloned().map(Some).collect::<Vec<_>>());
}

#[test]
fn a_replacement_keeps_the_replaced_id_on_its_first_block() {
	let mut taken = HashSet::from(["aaaaaa".to_owned()]);

	let written =
		written("# New\n\nMore.", Some("aaaaaa"), &mut taken).expect("blocks are written");

	assert_eq!(written.ids[0], "aaaaaa");
	assert_ne!(written.ids[1], "aaaaaa");
}

#[test]
fn markdown_of_nothing_but_markers_writes_no_block() {
	assert_eq!(written("^abcdef\n\n  \n", None, &mut HashSet::new()), None);
}

#[test]
fn an_insertion_stands_a_blank_line_apart_from_its_neighbours() {
	assert_eq!(separated("# A", "B. ^bbbbbb", "\nC."), "\n\nB. ^bbbbbb\n");
	assert_eq!(separated("", "B. ^bbbbbb", "C."), "B. ^bbbbbb\n\n");
	assert_eq!(separated("A.\n\n", "B. ^bbbbbb", "\n\nC."), "B. ^bbbbbb");
	assert_eq!(separated("A.", "B. ^bbbbbb", ""), "\n\nB. ^bbbbbb");
}

#[test]
fn a_removal_keeps_its_neighbours_two_blocks_apart() {
	let text = "# A ^aaaaaa\n\nB. ^bbbbbb\n\nC. ^cccccc\n\nD. ^dddddd";
	let spans: Vec<Range<usize>> = blocks_of(text).iter().map(Block::span).collect();
	let removed = |run: Range<usize>| applied(text, &[removal(text, &spans, run)]);

	assert_eq!(removed(0..1), "B. ^bbbbbb\n\nC. ^cccccc\n\nD. ^dddddd");
	assert_eq!(removed(1..3), "# A ^aaaaaa\n\nD. ^dddddd");
	assert_eq!(removed(3..4), "# A ^aaaaaa\n\nB. ^bbbbbb\n\nC. ^cccccc");
	assert_eq!(removed(0..4), "");
	let glued = "Para.\n# Head\nNext.";
	let spans: Vec<Range<usize>> = blocks_of(glued).iter().map(Block::span).collect();
	assert_eq!(applied(glued, &[removal(glued, &spans, 1..2)]), "Para.\n\nNext.");
}

#[test]
fn a_preview_shows_the_first_words_of_a_block_without_its_syntax() {
	assert_eq!(preview(BlockKind::Heading, "## Launch plan"), "Launch plan");
	assert_eq!(preview(BlockKind::Checklist, "- [ ] buy milk\n- [x] call"), "buy milk call");
	assert_eq!(preview(BlockKind::Table, "| a | b |\n| - | - |\n| 1 | 2 |"), "a b 1 2");
	assert_eq!(preview(BlockKind::Code, "```rust\nfn main() {}\n```"), "fn main() {}");
	assert_eq!(preview(BlockKind::Rule, "---"), "");
	let long = "word ".repeat(30);
	let shown = preview(BlockKind::Paragraph, &long);
	assert!(shown.ends_with('…') && shown.chars().count() <= PREVIEW_CHARS + 1, "{shown}");
}
