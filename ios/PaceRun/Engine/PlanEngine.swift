import Foundation
import JavaScriptCore

// Le plan est calculé par le moteur du site (engine.js, généré depuis public/app.js par ios/tools/build-engine.js) :
// l'app et le site donnent exactement le même plan pour le même profil.

struct PlanResult: Decodable, Equatable {
    let start: String?
    let vma: Double
    let sport: String
    let objectif: String
    let raceDate: String?
    let incomplete: Bool
    let unreal: Unreal?
    let weeks: [PlanWeek]

    struct Unreal: Decodable, Equatable { let used: String }
}

struct PlanWeek: Decodable, Equatable, Identifiable {
    let w: Int
    let phase: String
    let phaseLabel: String
    let deload: Bool
    let km: Double
    let days: [PlanDay]
    var id: Int { w }

    var sessions: [PlanDay] { days.filter(\.hasSession) }
}

struct PlanDay: Decodable, Equatable, Identifiable {
    let i: Int
    let date: String?
    let kind: String
    let km: Double
    let min: Int
    let kcal: Int
    let run: Session?
    let renfo: Renfo?
    var id: String { date ?? "d\(i)" }

    var hasSession: Bool { run != nil || renfo != nil }
    var isBeforePlan: Bool { kind == "before" }
    var title: String { run?.title ?? renfo?.t ?? (isBeforePlan ? "Avant le plan" : "Repos") }
    var colorType: String { run?.type ?? (renfo != nil ? "renfo" : "rest") }
}

struct Session: Decodable, Equatable {
    let type: String
    let kind: String?
    let title: String
    let note: String?
    let dplus: Double?
    let blocks: [Block]
}

struct Block: Decodable, Equatable, Identifiable {
    let l: String
    let min: Int
    let z: String?
    let pace: String?
    let eff: String?
    let iv: Interval?
    var id: String { l + "\(min)" }

    struct Interval: Decodable, Equatable {
        let n: Int
        let on: Double
        let off: Double
        let onL: String?
        let offL: String?
    }
}

struct Renfo: Decodable, Equatable {
    let t: String
    let m: String
    let rows: [[String]]
}

enum PlanEngineError: Error { case missingBundle, jsException(String), badOutput }

final class PlanEngine {
    private let context: JSContext
    private var lastError: String?

    init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "engine", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else { throw PlanEngineError.missingBundle }
        guard let ctx = JSContext() else { throw PlanEngineError.missingBundle }
        context = ctx
        context.exceptionHandler = { [weak self] _, exc in self?.lastError = exc?.toString() }
        context.evaluateScript(source, withSourceURL: url)
        if let e = lastError { throw PlanEngineError.jsException(e) }
    }

    /// Profil d'exemple du site (valeurs par défaut de chaque champ).
    func exampleProfile() -> [String: JSONValue] {
        guard let s = context.evaluateScript("PaceRun.example()")?.toString(),
              let data = s.data(using: .utf8),
              let v = try? JSONDecoder().decode([String: JSONValue].self, from: data) else { return [:] }
        return v
    }

    func plan(docJSON: String) throws -> PlanResult {
        lastError = nil
        let fn = context.objectForKeyedSubscript("PaceRun")?.objectForKeyedSubscript("plan")
        let out = fn?.call(withArguments: [docJSON])
        if let e = lastError { throw PlanEngineError.jsException(e) }
        guard let s = out?.toString(), let data = s.data(using: .utf8) else { throw PlanEngineError.badOutput }
        return try JSONDecoder().decode(PlanResult.self, from: data)
    }
}
