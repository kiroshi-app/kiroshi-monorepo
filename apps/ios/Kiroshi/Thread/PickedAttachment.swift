import Foundation

struct PickedAttachment: Identifiable, Equatable, Sendable {
    let id: UUID
    let name: String
    let data: Data
}
