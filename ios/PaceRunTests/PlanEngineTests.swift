import Testing
import Foundation
@testable import PaceRun

@MainActor
struct PlanEngineTests {
    private func plan(_ profile: [String: String]) throws -> PlanResult {
        let engine = try PlanEngine()
        var doc = Doc()
        doc.profile = engine.exampleProfile().merging(profile.mapValues(JSONValue.string)) { $1 }
        let data = try JSONEncoder().encode(doc)
        return try engine.plan(docJSON: String(decoding: data, as: UTF8.self))
    }

    @Test func runningPlanEndsOnRaceWeek() throws {
        let race = Day.iso(Calendar.current.date(byAdding: .day, value: 120, to: Date())!)
        let p = try plan(["sport": "course", "objectif": "10", "raceDate": race, "age": "30", "taille": "175", "poids": "70"])
        #expect(p.weeks.count >= 8)
        #expect(p.weeks.last?.phase == "race")
        #expect(p.weeks.last?.days.contains { $0.kind == "race" && $0.date == race } == true)
        #expect(p.vma > 7 && p.vma < 25)
        #expect(p.weeks.allSatisfy { !$0.sessions.isEmpty })
    }

    @Test func everySportBuilds() throws {
        for s in ["course", "trail", "vtt", "force", "forme"] {
            let p = try plan(["sport": s, "objectif": s == "course" || s == "trail" ? "21" : "forme"])
            #expect(!p.weeks.isEmpty, "sport \(s)")
        }
    }

    @Test func beginnerIsCapped() throws {
        let p = try plan(["niveau": "deb", "seances": "4", "objectif": "10"])
        #expect(p.weeks.allSatisfy { $0.days.filter { $0.run != nil }.count <= 4 })
    }

    @Test func storeMarksSessionDone() {
        let store = AppStore(fileURL: nil)
        store.mark("2026-11-06", "done")
        #expect(store.status("2026-11-06") == "done")
        store.mark("2026-11-06", "none")
        #expect(store.status("2026-11-06") == nil)
    }

    @Test func mondayOf() {
        #expect(Day.monday(of: "2026-11-06") == "2026-11-02")
        #expect(Day.monday(of: "2026-11-02") == "2026-11-02")
        #expect(Day.monday(of: "2026-11-08") == "2026-11-02")
    }
}
