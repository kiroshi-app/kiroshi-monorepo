import Foundation
import Testing

@testable import Kiroshi

struct SpaceDecodingTests {
    func space(_ colour: String?) throws -> Space {
        let field = colour.map { #","colour":\#($0)"# } ?? ""
        let json = #"{"id":"studio","name":"Studio","role":"owner","online":true\#(field)}"#
        return try JSONDecoder().decode(Space.self, from: Data(json.utf8))
    }

    @Test(arguments: CompanionTint.allCases)
    func aSpaceWearsTheColourItsHostGaveIt(_ tint: CompanionTint) throws {
        #expect(try space(#""\#(tint.rawValue)""#).colour == tint)
    }

    @Test(arguments: ["null", #""teal""#, #""Blue""#, "3", "{}"])
    func aSpaceWithoutAColourItKnowsHasNone(_ colour: String) throws {
        let decoded = try space(colour)
        #expect(decoded.colour == nil)
        #expect(decoded.name == "Studio")
    }

    @Test func aSpaceFromARelayThatSendsNoColourHasNone() throws {
        #expect(try space(nil).colour == nil)
    }

    @Test func theListKeepsEverySpaceWhateverItsColour() throws {
        let json = #"""
            [{"id":"a","name":"Studio","role":"owner","online":true,"colour":"purple"},
             {"id":"b","name":"Home lab","role":"member","online":false,"colour":"teal"},
             {"id":"c","name":"Side project","role":"owner","online":true}]
            """#
        let spaces = try JSONDecoder().decode([Space].self, from: Data(json.utf8))
        #expect(spaces.map(\.colour) == [.purple, nil, nil])
        #expect(spaces.map(\.role) == [.owner, .member, .owner])
    }
}
