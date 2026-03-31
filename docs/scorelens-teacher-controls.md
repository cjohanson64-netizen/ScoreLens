Absolutely — here’s the doc draft ready to drop in.

# `docs/scorelens-teacher-controls.md`

````md
# ScoreLens Teacher-Control Vocabulary v1

## Purpose

This document defines the first canonical teacher-control vocabulary for ScoreLens.

Its job is to keep teacher-defined evaluation policies consistent across:

- `.tat` programs
- goal configuration
- support permissions
- progression rules
- human override behavior

A goal defines what success should be.  
A decision defines what the system should do next.  
A teacher control defines what the system is allowed or required to do.

---

## Core distinctions

### Goal
What success means.

Examples:
- `pitchAccuracyGoal`
- `consistencyGoal`

### Decision
What ScoreLens should do next.

Examples:
- `retry`
- `advance`
- `scaffold`

### Teacher control
What ScoreLens is allowed, required, or limited to do.

Examples:
- `maximumAttempts`
- `allowSlowDown`
- `allowMoveOn`
- `requireTeacherIntervention`

---

## Canonical teacher-control vocabulary

### Evaluation scope controls
- `evaluatePitch`
- `evaluateRhythm`
- `evaluateTone`
- `evaluateDiction`
- `evaluatePhrasing`
- `evaluateDynamics`

### Threshold and mastery controls
- `threshold`
- `masteryWindow`
- `minimumAttempts`
- `maximumAttempts`
- `passOnSingleSuccess`
- `requireConsistency`

### Attempt-flow controls
- `allowRetry`
- `allowMoveOn`
- `allowPause`
- `autoAdvance`
- `requireRetryBeforeAdvance`

### Support-policy controls
- `allowScaffold`
- `allowModel`
- `allowSegmenting`
- `allowSlowDown`
- `allowComplexityReduction`

### Override and intervention controls
- `requireTeacherIntervention`
- `allowManualReview`
- `allowStudentChoiceToMoveOn`
- `lockProgressionUntilTeacherReview`
- `stopAfterMaximumAttempts`

---

## Recommended semantic homes

### Use goal `meta` for simple controls
Use `meta` when the control is a local setting on a goal or evaluation target.

Examples:
- `threshold`
- `masteryWindow`
- `minimumAttempts`
- `maximumAttempts`
- `allowMoveOn`
- `allowScaffold`
- `allowSlowDown`

### Use control nodes when controls need identity
Use `control` nodes only when a setting must be reusable, targetable, or explicitly overridden.

Example node shape:

```json
{
  "kind": "control",
  "name": "maximumAttempts",
  "label": "Maximum Attempts"
}
````

---

## Canonical control relations

* `configures`
* `appliesTo`
* `permits`
* `overrides`

---

## Example patterns

### Goal meta as teacher controls

```json
{
  "threshold": 0.9,
  "minimumAttempts": 2,
  "maximumAttempts": 4,
  "allowMoveOn": true,
  "allowScaffold": true,
  "allowSlowDown": true,
  "stopAfterMaximumAttempts": true
}
```

### Control node pattern

```tat
teacherPreset1 : "configures" : pitchAccuracyGoal
allowSlowDownControl : "permits" : slowDownDecision
teacherOverride1 : "overrides" : retryDecision
```

---

## Recommended v1 priorities

### Highest-priority controls

* `threshold`
* `minimumAttempts`
* `maximumAttempts`
* `allowMoveOn`
* `allowScaffold`
* `allowSlowDown`
* `stopAfterMaximumAttempts`
* `requireTeacherIntervention`