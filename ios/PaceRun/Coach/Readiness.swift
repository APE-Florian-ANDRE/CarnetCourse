import Foundation

// « Forme du jour » : savoir quand pousser et quand lever le pied, à partir d'Apple Santé (ECG de l'Apple Watch, FC au repos,
// VFC, sommeil) et du ressenti noté après les séances. Mêmes règles de prudence que le site (feelSafety14) :
// on conseille, on ne diagnostique rien, et le plan de référence n'est jamais réécrit.

struct Readiness: Equatable {
    enum Level: Int, Comparable {
        case go, easy, rest, medical
        static func < (a: Level, b: Level) -> Bool { a.rawValue < b.rawValue }
    }

    var level: Level
    var reasons: [String]
    var positives: [String]

    var title: String {
        switch level {
        case .go: "Feu vert"
        case .easy: "Lève le pied"
        case .rest: "Repos conseillé"
        case .medical: "Avis médical d'abord"
        }
    }

    var advice: String {
        switch level {
        case .go: "Fais ta séance comme prévue."
        case .easy: "Fais la version allégée : tout en facile, un peu plus courte."
        case .rest: "Pas de séance dure aujourd'hui : repos, marche ou mobilité."
        case .medical: "Pas de séance intense avant d'en avoir parlé à un médecin. Pace'Run ne pose aucun diagnostic."
        }
    }

    static func ecgLabel(_ c: String) -> String {
        switch c {
        case "sinusRhythm": "rythme sinusal"
        case "atrialFibrillation": "signes de fibrillation atriale"
        case "inconclusiveHighHeartRate": "non concluant (fréquence élevée)"
        case "inconclusiveLowHeartRate": "non concluant (fréquence basse)"
        case "inconclusivePoorReading": "non concluant (mauvais enregistrement)"
        default: "non concluant"
        }
    }

    static func evaluate(health: HealthSnapshot?, feel: [String: Feel], today: String) -> Readiness {
        var level = Level.go, reasons: [String] = [], positives: [String] = []
        func raise(_ l: Level, _ why: String) { level = max(level, l); reasons.append(why) }
        let ago = { (n: Int) in Day.iso(Calendar(identifier: .gregorian).date(byAdding: .day, value: -n, to: Day.date(today) ?? Date())!) }
        let d7 = ago(7), d30 = ago(30)

        if let h = health {
            let ecgs = h.ecgs.sorted { $0.date > $1.date }
            if let af = ecgs.first(where: { $0.classification == "atrialFibrillation" && $0.date >= d30 }) {
                raise(.medical, "ECG du \(Day.label(af.date, style: "d MMMM")) : \(ecgLabel(af.classification)).")
            }
            if let s = ecgs.first(where: { $0.symptoms && $0.date >= d7 }) {
                raise(.medical, "Symptômes notés avec l'ECG du \(Day.label(s.date, style: "d MMMM")).")
            }
            if let hi = ecgs.first(where: { $0.classification == "inconclusiveHighHeartRate" && $0.date >= d7 }) {
                raise(.easy, "ECG du \(Day.label(hi.date, style: "d MMMM")) : \(ecgLabel(hi.classification)).")
            }
            if let last = ecgs.first, last.classification == "sinusRhythm", last.date >= d30, level < .medical {
                positives.append("Dernier ECG (\(Day.label(last.date, style: "d MMM"))) : rythme sinusal.")
            }
            if let r7 = h.restingHR7, let r30 = h.restingHR30 {
                if r7 - r30 >= 5 { raise(.easy, "FC au repos en hausse : \(Int(r7.rounded())) bpm contre \(Int(r30.rounded())) habituellement.") }
                else if r7 <= r30 { positives.append("FC au repos stable (\(Int(r7.rounded())) bpm).") }
            }
            if let v7 = h.hrv7, let v30 = h.hrv30, v30 > 0 {
                if v7 < v30 * 0.8 { raise(.easy, "Variabilité cardiaque en baisse (\(Int(v7.rounded())) ms contre \(Int(v30.rounded())) ms).") }
            }
            if let s = h.sleepLastNight {
                if s < 6 { raise(.easy, "Nuit courte : \(fmtH(s)) de sommeil.") }
                else if s >= 7 { positives.append("Bonne nuit : \(fmtH(s)) de sommeil.") }
            }
        }

        // ressenti (mêmes seuils que le site)
        let items = feel.filter { $0.key <= today && $0.key >= ago(14) }.sorted { $0.key > $1.key }
        if let p = items.first(where: { ($0.value.pain ?? 0) == 2 && $0.key >= d7 }) {
            raise(.rest, "Douleur forte notée le \(Day.label(p.key, style: "d MMMM")).")
        }
        let rp = items.filter { ($0.value.rpe ?? 0) > 0 }
        if rp.count >= 2, (rp[0].value.rpe ?? 0) >= 9, (rp[1].value.rpe ?? 0) >= 9, rp[0].key >= d7 {
            raise(.rest, "Deux séances d'affilée à RPE 9 ou plus.")
        }
        if items.count >= 2, (items[0].value.pain ?? 0) >= 1, (items[1].value.pain ?? 0) >= 1, items[0].key >= d7, level < .rest {
            raise(.easy, "Une douleur légère est revenue deux séances de suite.")
        }
        return Readiness(level: level, reasons: reasons, positives: positives)
    }

    private static func fmtH(_ h: Double) -> String {
        let m = Int((h * 60).rounded())
        return "\(m / 60) h \(String(format: "%02d", m % 60))"
    }
}

/// « Ma semaine change » (mauvaise semaine, voyage, gêne) : la semaine affichée s'ajuste, le plan de référence reste intact.
enum WeekChange: String, Codable, CaseIterable, Identifiable {
    case fatigue, voyage, gene
    var id: String { rawValue }

    var label: String {
        switch self {
        case .fatigue: "Mauvaise semaine"
        case .voyage: "Voyage, peu de temps"
        case .gene: "Une gêne, une douleur"
        }
    }

    var detail: String {
        switch self {
        case .fatigue: "Malade, fatigué, stressé : tout passe en facile et un peu plus court."
        case .voyage: "Deux séances gardées, les plus utiles. Pas de rattrapage ensuite."
        case .gene: "Pas d'intensité, sorties raccourcies. Si la douleur est forte, repos."
        }
    }

    var icon: String {
        switch self {
        case .fatigue: "bed.double"
        case .voyage: "airplane"
        case .gene: "bandage"
        }
    }

    /// Applique le changement à une semaine. `easyPace` : allure facile du plan (bloc z1), pour les séances recalculées.
    func apply(to wk: PlanWeek, easyPace: String?) -> PlanWeek {
        let runs = wk.days.filter { $0.run != nil && $0.kind != "race" && $0.kind != "before" }
        // voyage : on garde la sortie longue et la première séance de qualité (passée en facile)
        let keep: Set<Int> = {
            guard self == .voyage else { return Set(runs.map(\.i)) }
            let long = runs.first { $0.run?.type == "long" }?.i
            let other = runs.first { $0.run?.type == "q" }?.i ?? runs.first { $0.i != long }?.i
            return Set([long, other].compactMap { $0 })
        }()
        let days = wk.days.map { d -> PlanDay in
            guard let r = d.run, d.kind != "race", d.kind != "before" else { return d }
            if !keep.contains(d.i) {
                return PlanDay(i: d.i, date: d.date, kind: "rest", km: 0, min: 0, kcal: d.kcal, run: nil,
                               renfo: d.renfo, adapted: "Séance retirée (\(label.lowercased())).")
            }
            let isLong = r.type == "long"
            let f: Double = self == .gene ? (isLong ? 0.6 : 0.7) : 0.8
            let mins = max(15, Int((Double(d.min) * f).rounded()))
            let title = isLong ? "Sortie longue allégée" : "Footing facile"
            let block = Block(l: isLong ? "Sortie longue, allure facile" : "Footing facile", min: mins, z: "z1", pace: easyPace, eff: nil, iv: nil)
            let note = switch self {
            case .fatigue: "Semaine difficile : reste en aisance respiratoire, tu dois pouvoir parler. Arrête-toi si ça ne passe pas."
            case .voyage: "Semaine chargée : garde juste le contact avec la course, sans chercher l'allure."
            case .gene: "Gêne notée : si la douleur augmente pendant la séance, arrête-toi. Si elle dure plus de 2 ou 3 jours, demande l'avis d'un médecin ou d'un kinésithérapeute."
            }
            return PlanDay(i: d.i, date: d.date, kind: isLong ? "long" : "easy", km: (d.km * f * 10).rounded() / 10, min: mins, kcal: d.kcal,
                           run: Session(type: isLong ? "long" : "easy", kind: nil, title: title, note: note, dplus: nil, blocks: [block]),
                           renfo: self == .gene ? nil : d.renfo, adapted: "Ajustée : \(label.lowercased()).")
        }
        return PlanWeek(w: wk.w, phase: wk.phase, phaseLabel: wk.phaseLabel, deload: wk.deload,
                        km: (days.reduce(0) { $0 + $1.km } * 10).rounded() / 10, days: days, change: self)
    }
}
