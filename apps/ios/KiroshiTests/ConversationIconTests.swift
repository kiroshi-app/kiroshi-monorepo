import Foundation
import SwiftUI
import Testing
import UIKit

@testable import Kiroshi

struct ConversationIconTests {
    static let sharedIcons = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .appending(path: "../../../packages/shared/conversation-icons.json")
        .standardizedFileURL

    func conversation(_ fields: String) throws -> GroupConversation {
        let json =
            #"{"id":"group-relay","title":"Relay audit","createdAt":0,\#(fields)"participants":[{"botId":"juniper","name":"Juniper","leftAt":null,"isDeleted":false}]}"#
        return try JSONDecoder().decode(GroupConversation.self, from: Data(json.utf8))
    }

    @Test func listsTheIconsTheDesktopOffersInTheSameOrder() throws {
        let names = try JSONDecoder().decode(
            [String].self, from: Data(contentsOf: Self.sharedIcons))

        #expect(ConversationIcon.allCases.map(\.rawValue) == names)
    }

    @Test(arguments: ConversationIcon.allCases)
    func everyIconDrawsAnSFSymbol(_ icon: ConversationIcon) {
        #expect(UIImage(systemName: icon.symbolName) != nil, "\(icon.symbolName)")
    }

    @Test(arguments: [
        "conversation-cell", "conversation-cell-glyph", "conversation-pile-counter",
        "conversation-pile-counter-glyph",
    ])
    func everyUncolouredCellColourResolvesInTheCatalogue(_ name: String) {
        #expect(UIColor(named: name, in: .main, compatibleWith: nil) != nil)
    }

    @Test func aColouredCellWearsTheConversationIconTonesOfItsHue() throws {
        let hue = try #require(Hue(degrees: 200))
        for (theme, scheme) in [(HueTheme.light, ColorScheme.light), (.dark, .dark)] {
            let cell = try SpaceAccentTests.hex(of: .conversation(.cell(hue)), in: scheme)
                .lowercased()
            let glyph = try SpaceAccentTests.hex(of: .conversation(.glyph(hue)), in: scheme)
                .lowercased()
            #expect(cell == HueTones.tone(hue, theme, .conversationIcon).rgb.hex)
            #expect(glyph == HueTones.tone(hue, theme, .conversationIconForeground).rgb.hex)
        }
    }

    @Test func readsAConversationsHueAndTheNameAnOlderHostSends() throws {
        #expect(try conversation(#""color":200,"#).color == Hue(degrees: 200))
        #expect(try conversation(#""color":"cyan","#).color == .cyan)
    }

    @Test func readsTheIconAndColourOfAConversation() throws {
        let group = try conversation(#""icon":"ShieldKey","color":"red","#)

        #expect(group.icon == .shieldKey)
        #expect(group.color == .red)
    }

    @Test func aConversationWithoutIconOrColourShowsTheMessagePictogramUncoloured() throws {
        let missing = try conversation("")
        let null = try conversation(#""icon":null,"color":null,"#)

        #expect(missing.icon == .messageSquare)
        #expect(missing.color == nil)
        #expect(null.icon == .messageSquare)
        #expect(null.color == nil)
    }

    @Test func anUnknownIconOrColourFallsBackInsteadOfDroppingTheConversation() throws {
        let group = try conversation(#""icon":"Hourglass","color":"teal","#)

        #expect(group.id == "group-relay")
        #expect(group.icon == .messageSquare)
        #expect(group.color == nil)
    }

    @Test func aCompanionsOwnConversationKeepsItsAvatarWhereAGroupOfOneDrawsItsIconCell() throws {
        let happy = Companion(id: "happy", name: "Happy", tint: .orange)
        let group = try conversation(#""icon":"ShieldKey","color":"red","#)

        #expect(group.members.count == 1)
        #expect(ConversationAvatar(.companion(happy)) == .companion(happy))
        #expect(ConversationAvatar(.group(group)) == .icon(.shieldKey, color: .red))
    }

    @Test(arguments: [(1, 1, 0), (2, 2, 0), (3, 3, 0), (4, 2, 2), (5, 2, 3)])
    func thePileShowsThreeBotsThenTwoAndACount(members: Int, shown: Int, hidden: Int) {
        let bots = (0..<members).map { Companion(id: "bot-\($0)", name: "Bot \($0)") }
        let pile = PileContent(members: bots)

        #expect(pile.shown.map(\.id) == bots.prefix(shown).map(\.id))
        #expect(pile.hiddenCount == hidden)
        #expect(pile.slotCount == min(members, PileContent.limit))
    }
}
