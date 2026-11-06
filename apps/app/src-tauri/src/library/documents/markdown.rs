use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Assoc, Doc, GetString, IndexedSequence, ReadTxn, StickyIndex, Text, TextRef, Transact};

use super::{decoded, merged_into, writer_of, RemoveStep, WriteStep};
use crate::library::blocks::Splice;
use crate::library::contract::LibraryError;
use crate::library::{undecodable, within, MAX_DOCUMENT_BYTES};

const TEXT_NAME: &str = "markdown";

pub(super) fn exported(doc: &Doc) -> Vec<u8> {
	text_of(doc).into_bytes()
}

pub(super) fn bounded(doc: &Doc, name: &str) -> Result<(), LibraryError> {
	within(name, text_of(doc).len() as u64, MAX_DOCUMENT_BYTES)
}

pub(crate) fn text_of_state(state: &[u8], name: &str) -> Result<String, LibraryError> {
	Ok(text_of(&doc_of_state(state, name)?))
}

pub(crate) fn carets_at(
	state: &[u8],
	name: &str,
	offsets: &[usize],
) -> Result<Vec<Vec<u8>>, LibraryError> {
	let doc = doc_of_state(state, name)?;
	let text = doc.get_or_insert_text(TEXT_NAME);
	let txn = doc.transact();
	offsets.iter().map(|offset| caret_at(&text, &txn, *offset, name)).collect()
}

fn doc_of_state(state: &[u8], name: &str) -> Result<Doc, LibraryError> {
	let doc = Doc::new();
	merged_into(&doc, name, decoded(name, state)?)?;
	Ok(doc)
}

pub(super) fn spliced_by(
	doc: &Doc,
	name: &str,
	writer: u64,
	plan: impl FnOnce(&str) -> Vec<Splice>,
) -> Result<Vec<u8>, LibraryError> {
	let writer = writer_of(doc, writer, name)?;
	let text = writer.get_or_insert_text(TEXT_NAME);
	let mut txn = writer.transact_mut();
	let splices = plan(&text.get_string(&txn));
	for splice in splices.iter().rev() {
		let start = byte_index(splice.range.start, name)?;
		let removed = byte_index(splice.range.end, name)? - start;
		if removed > 0 {
			text.remove_range(&mut txn, start, removed);
		}
		text.insert(&mut txn, start, &splice.text);
	}
	Ok(txn.encode_state_as_update_v1(&doc.transact().state_vector()))
}

fn byte_index(index: usize, name: &str) -> Result<u32, LibraryError> {
	u32::try_from(index).map_err(|_| undecodable(name, format!("no caret stands at byte {index}")))
}

pub(super) fn inserted_by(
	doc: &Doc,
	name: &str,
	step: &WriteStep<'_>,
) -> Result<(Vec<u8>, Vec<u8>), LibraryError> {
	let writer = writer_of(doc, step.writer, name)?;
	let text = writer.get_or_insert_text(TEXT_NAME);
	let mut txn = writer.transact_mut();
	let index = index_of(step.caret, &text, &txn, name)?;
	text.insert(&mut txn, index, step.text);
	let caret = caret_at(&text, &txn, index as usize + step.text.len(), name)?;
	let update = txn.encode_state_as_update_v1(&doc.transact().state_vector());
	Ok((update, caret))
}

pub(super) fn removed_by(
	doc: &Doc,
	name: &str,
	step: &RemoveStep<'_>,
) -> Result<(Vec<u8>, Vec<u8>), LibraryError> {
	let writer = writer_of(doc, step.writer, name)?;
	let text = writer.get_or_insert_text(TEXT_NAME);
	let mut txn = writer.transact_mut();
	let start = index_of(step.start, &text, &txn, name)?;
	let end = index_of(step.end, &text, &txn, name)?;
	if end > start {
		text.remove_range(&mut txn, start, end - start);
	}
	let caret = caret_at(&text, &txn, start as usize, name)?;
	let update = txn.encode_state_as_update_v1(&doc.transact().state_vector());
	Ok((update, caret))
}

fn index_of<T: ReadTxn>(
	caret: &[u8],
	text: &TextRef,
	txn: &T,
	name: &str,
) -> Result<u32, LibraryError> {
	let anchor =
		StickyIndex::decode_v1(caret).map_err(|error| undecodable(name, error.to_string()))?;
	Ok(anchor.get_offset(txn).map_or_else(|| text.len(txn), |offset| offset.index))
}

fn caret_at<T: ReadTxn>(
	text: &TextRef,
	txn: &T,
	index: usize,
	name: &str,
) -> Result<Vec<u8>, LibraryError> {
	u32::try_from(index)
		.ok()
		.and_then(|index| text.sticky_index(txn, index, Assoc::Before))
		.map(|caret| caret.encode_v1())
		.ok_or_else(|| undecodable(name, format!("no caret stands at byte {index}")))
}

fn text_of(doc: &Doc) -> String {
	doc.get_or_insert_text(TEXT_NAME).get_string(&doc.transact())
}

pub(super) fn reconciled(doc: &Doc, wanted: &str) -> bool {
	let text = doc.get_or_insert_text(TEXT_NAME);
	let mut txn = doc.transact_mut();
	let current = text.get_string(&txn);
	if current == wanted {
		return false;
	}
	let prefix = shared_bytes(current.chars(), wanted.chars());
	let suffix = shared_bytes(current[prefix..].chars().rev(), wanted[prefix..].chars().rev());
	let removed = current.len() - prefix - suffix;
	text.remove_range(&mut txn, prefix as u32, removed as u32);
	text.insert(&mut txn, prefix as u32, &wanted[prefix..wanted.len() - suffix]);
	true
}

fn shared_bytes(left: impl Iterator<Item = char>, right: impl Iterator<Item = char>) -> usize {
	left.zip(right).take_while(|(a, b)| a == b).map(|(a, _)| a.len_utf8()).sum()
}
