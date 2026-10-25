import Testing

@testable import Kiroshi

struct WorkingNamesTests {
    let companions = [
        Companion(id: "juniper", name: "Juniper"), Companion(id: "atlas", name: "Atlas"),
        Companion(id: "pico", name: "Pico"),
    ]

    @Test(
        arguments: [
            ([], nil, nil),
            (["juniper"], "Juniper", "Juniper is working…"),
            (["juniper", "atlas"], "Juniper and Atlas", "Juniper and Atlas are working…"),
            (
                ["juniper", "atlas", "pico"], "Juniper and 2 others",
                "Juniper and 2 others are working…"
            ),
            (["ghost"], nil, nil),
            (["ghost", "pico"], "Pico", "Pico is working…"),
        ] as [([String], String?, String?)])
    func namesTheCompanionsItKnowsAndSkipsTheRest(
        ids: [String], joined: String?, line: String?
    ) {
        let names = WorkingNames(ids, among: companions)

        #expect(names.joined == joined)
        #expect(names.line == line)
    }
}
