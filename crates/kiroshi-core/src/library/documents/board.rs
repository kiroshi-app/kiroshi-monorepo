use yrs::{Doc, ReadTxn, Transact};

use super::writer_of;
use crate::board::{
	edit_board, export_canvas, import_canvas, read_board, write_board, Board, BoardEdit, BoardError,
};
use crate::library::contract::LibraryError;
use crate::library::{unwritable, within, MAX_DOCUMENT_BYTES};

pub(super) fn imported(text: &str, name: &str) -> Result<(Doc, Board), LibraryError> {
	let board = import_canvas(text).map_err(|refusal| invalid(name, &refusal))?;
	let doc = Doc::new();
	write_board(&doc, &board);
	Ok((doc, board))
}

pub(super) fn read(doc: &Doc, name: &str) -> Result<Board, LibraryError> {
	read_board(doc).map_err(|refusal| invalid(name, &refusal))
}

pub(super) fn update_of(
	doc: &Doc,
	writer: u64,
	name: &str,
	edit: &BoardEdit,
) -> Result<Vec<u8>, LibraryError> {
	let copy = writer_of(doc, writer, name)?;
	let before = copy.transact().state_vector();
	edit_board(&copy, edit);
	let update = copy.transact().encode_state_as_update_v1(&before);
	Ok(update)
}

pub(super) fn canvas_of(board: &Board, name: &str) -> Result<String, LibraryError> {
	let canvas = export_canvas(board).map_err(unwritable)?;
	within(name, canvas.len() as u64, MAX_DOCUMENT_BYTES)?;
	Ok(canvas)
}

pub(super) fn exported(doc: &Doc, name: &str) -> Result<Vec<u8>, LibraryError> {
	canvas_of(&read(doc, name)?, name).map(String::into_bytes)
}

pub(super) fn bounded(doc: &Doc, name: &str) -> Result<(), LibraryError> {
	exported(doc, name).map(drop)
}

pub(super) fn is_diverged(on_disk: &[u8], written: &Board) -> bool {
	let imported = std::str::from_utf8(on_disk).ok().and_then(|text| import_canvas(text).ok());
	imported.as_ref() != Some(written)
}

fn invalid(name: &str, refusal: &BoardError) -> LibraryError {
	LibraryError::InvalidBoard { name: name.to_owned(), detail: format!("{refusal:?}") }
}
