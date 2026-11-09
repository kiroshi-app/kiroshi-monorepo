use kiroshi_rune_kit::surfaces::s14_library::{BlockMenuAction, HandleEvent};

use super::State;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BlockMenu {
	pub is_beside: bool,
	pub block: String,
}

impl State {
	pub fn handle_handle(&mut self, is_beside: bool, block: &str, event: HandleEvent) {
		if event == HandleEvent::Press {
			self.block_menu = Some(BlockMenu { is_beside, block: block.to_owned() });
			return;
		}
		let Some(document) = self.document_mut(is_beside) else { return };
		let update = match event {
			HandleEvent::Insert => document.insert_below(block),
			HandleEvent::Move { from, to } => document.move_block(from, to),
			HandleEvent::Press => None,
		};
		self.send(is_beside, update);
	}

	pub fn handle_block_menu(&mut self, action: BlockMenuAction) {
		let Some(BlockMenu { is_beside, block }) = self.block_menu.take() else { return };
		let Some(document) = self.document_mut(is_beside) else { return };
		let Some(at) = document.block_at(&block) else { return };
		let update = match action {
			BlockMenuAction::TurnInto => None,
			BlockMenuAction::Duplicate => document.duplicate(&block),
			BlockMenuAction::MoveUp => at.checked_sub(1).and_then(|to| document.move_block(at, to)),
			BlockMenuAction::MoveDown => document.move_block(at, at + 1),
			BlockMenuAction::Delete => document.remove_block(&block),
		};
		self.send(is_beside, update);
	}

	pub fn close_block_menu(&mut self) {
		self.block_menu = None;
	}

	pub fn handled_block(&self, is_beside: bool) -> Option<&str> {
		if let Some(menu) = self.block_menu.as_ref().filter(|menu| menu.is_beside == is_beside) {
			return Some(&menu.block);
		}
		self.document(is_beside)?.focused().map(|field| field.block.as_str())
	}
}
