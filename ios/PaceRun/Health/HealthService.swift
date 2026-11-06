import Foundation
import HealthKit

// Lecture seule d'Apple Santé : ECG de l'Apple Watch, entraînements, FC au repos, VFC et sommeil.
// Rien n'est écrit dans Santé, rien ne quitte l'iPhone.

struct ECGReading: Codable, Equatable, Identifiable {
    var date: String            // aaaa-mm-jj
    var classification: String  // sinusRhythm | atrialFibrillation | inconclusiveLowHeartRate | inconclusiveHighHeartRate | inconclusivePoorReading | inconclusiveOther | unrecognized
    var avgHR: Double?
    var symptoms: Bool
    var id: String { date + classification + "\(avgHR ?? 0)" }
}

struct WatchWorkout: Codable, Equatable {
    var date: String
    var sport: String           // course | trail | velo | force | autre
    var km: Double
    var min: Double
    var avgHR: Double?
}

/// Mesures du jour et de référence, entrée de Readiness.
struct HealthSnapshot: Codable, Equatable {
    var restingHR7: Double?     // moyenne des 7 derniers jours
    var restingHR30: Double?    // référence sur 30 jours
    var hrv7: Double?           // SDNN, ms
    var hrv30: Double?
    var sleepLastNight: Double? // heures
    var ecgs: [ECGReading] = []
    var workouts: [WatchWorkout] = []
    var at: Double = 0
}

final class HealthService {
    private let store = HKHealthStore()

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType(), HKObjectType.electrocardiogramType()]
        for id in [HKQuantityTypeIdentifier.restingHeartRate, .heartRateVariabilitySDNN, .heartRate, .distanceWalkingRunning, .distanceCycling] {
            s.insert(HKQuantityType(id))
        }
        s.insert(HKCategoryType(.sleepAnalysis))
        return s
    }

    func requestAccess() async throws {
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func snapshot() async -> HealthSnapshot {
        let now = Date()
        let d7 = Calendar.current.date(byAdding: .day, value: -7, to: now)!
        let d30 = Calendar.current.date(byAdding: .day, value: -30, to: now)!
        let d60 = Calendar.current.date(byAdding: .day, value: -60, to: now)!
        async let r7 = average(.restingHeartRate, unit: .count().unitDivided(by: .minute()), from: d7)
        async let r30 = average(.restingHeartRate, unit: .count().unitDivided(by: .minute()), from: d30)
        async let v7 = average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), from: d7)
        async let v30 = average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), from: d30)
        async let sl = sleepLastNight()
        async let e = ecgs(from: d30)
        async let w = workouts(from: d60)
        return HealthSnapshot(restingHR7: await r7, restingHR30: await r30, hrv7: await v7, hrv30: await v30,
                              sleepLastNight: await sl, ecgs: await e, workouts: await w, at: now.timeIntervalSince1970 * 1000)
    }

    private func samples(_ type: HKSampleType, from: Date, limit: Int = HKObjectQueryNoLimit) async -> [HKSample] {
        let pred = HKQuery.predicateForSamples(withStart: from, end: Date())
        let sort = [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]
        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: pred, limit: limit, sortDescriptors: sort) { _, s, _ in
                cont.resume(returning: s ?? [])
            }
            store.execute(q)
        }
    }

    private func average(_ id: HKQuantityTypeIdentifier, unit: HKUnit, from: Date) async -> Double? {
        let s = await samples(HKQuantityType(id), from: from).compactMap { $0 as? HKQuantitySample }
        guard !s.isEmpty else { return nil }
        return s.reduce(0) { $0 + $1.quantity.doubleValue(for: unit) } / Double(s.count)
    }

    // sommeil de la nuit passée : phases « endormi » entre 18 h la veille et 12 h aujourd'hui
    private func sleepLastNight() async -> Double? {
        let cal = Calendar.current
        let noon = cal.date(bySettingHour: 12, minute: 0, second: 0, of: Date())!
        let from = cal.date(byAdding: .hour, value: -18, to: noon)!
        let asleep: Set<Int> = Set([HKCategoryValueSleepAnalysis.asleepCore, .asleepDeep, .asleepREM, .asleepUnspecified].map(\.rawValue))
        let s = await samples(HKCategoryType(.sleepAnalysis), from: from).compactMap { $0 as? HKCategorySample }
            .filter { asleep.contains($0.value) && $0.endDate <= noon }
        guard !s.isEmpty else { return nil }
        return s.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } / 3600
    }

    private func ecgs(from: Date) async -> [ECGReading] {
        await samples(HKObjectType.electrocardiogramType(), from: from, limit: 30).compactMap { $0 as? HKElectrocardiogram }.map { e in
            ECGReading(date: Day.iso(e.startDate), classification: Self.name(e.classification),
                       avgHR: e.averageHeartRate?.doubleValue(for: .count().unitDivided(by: .minute())),
                       symptoms: e.symptomsStatus == .present)
        }
    }

    private func workouts(from: Date) async -> [WatchWorkout] {
        let ws = await samples(HKObjectType.workoutType(), from: from, limit: 300).compactMap { $0 as? HKWorkout }
        return ws.map { w in
            let dist = w.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()
                ?? w.statistics(for: HKQuantityType(.distanceCycling))?.sumQuantity()
            let hr = w.statistics(for: HKQuantityType(.heartRate))?.averageQuantity()
            return WatchWorkout(date: Day.iso(w.startDate), sport: Self.sport(w.workoutActivityType),
                                km: (dist?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0),
                                min: w.duration / 60,
                                avgHR: hr?.doubleValue(for: .count().unitDivided(by: .minute())))
        }
    }

    static func sport(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: "course"
        case .hiking: "trail"
        case .cycling: "velo"
        case .traditionalStrengthTraining, .functionalStrengthTraining, .coreTraining: "force"
        default: "autre"
        }
    }

    static func name(_ c: HKElectrocardiogram.Classification) -> String {
        switch c {
        case .sinusRhythm: "sinusRhythm"
        case .atrialFibrillation: "atrialFibrillation"
        case .inconclusiveLowHeartRate: "inconclusiveLowHeartRate"
        case .inconclusiveHighHeartRate: "inconclusiveHighHeartRate"
        case .inconclusivePoorReading: "inconclusivePoorReading"
        case .inconclusiveOther: "inconclusiveOther"
        default: "unrecognized"
        }
    }
}
