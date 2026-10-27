import Foundation
import Testing

@testable import Kiroshi

struct SpaceDecodingTests {
    func space(_ colour: String?) throws -> Space {
        let field = colour.map { #","colour":\#($0)"# } ?? ""
        let json = #"{"id":"studio","name":"Studio","role":"owner","online":true\#(field)}"#
        return try JSONDecoder().decode(Space.self, from: Data(json.utf8))
    }

    @Test(arguments: [0, 17, 200, 359])
    func aSpaceWearsTheHueItsHostGaveIt(_ degrees: Int) throws {
        #expect(try space("\(degrees)").colour?.degrees == degrees)
    }

    @Test(arguments: Hue.presets.sorted { $0.key < $1.key }.map { ($0.key, $0.value) })
    func aSpaceFromAnOlderHostOrTheRelayReadsItsNameAsThePresetsHue(name: String, hue: Hue)
        throws
    {
        #expect(try space(#""\#(name)""#).colour == hue)
    }

    @Test func theEightNamesReadAsTheDesktopsPresetHues() {
        #expect(
            Hue.presets.mapValues(\.degrees) == [
                "red": 42, "orange": 63, "yellow": 82, "green": 132,
                "cyan": 186, "blue": 257, "purple": 296, "pink": 358,
            ])
    }

    @Test(arguments: ["null", #""teal""#, #""Blue""#, "360", "-1", "12.5", #""200""#, "{}"])
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
             {"id":"c","name":"Side project","role":"owner","online":true},
             {"id":"d","name":"Lab","role":"member","online":true,"colour":200},
             {"id":"e","name":"Shed","role":"member","online":true,"colour":400}]
            """#
        let spaces = try JSONDecoder().decode([Space].self, from: Data(json.utf8))
        #expect(spaces.map(\.colour) == [.purple, nil, nil, Hue(degrees: 200), nil])
        #expect(spaces.map(\.role) == [.owner, .member, .owner, .member, .member])
    }
}
