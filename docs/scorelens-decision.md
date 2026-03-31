Perfect. Here’s the doc draft to lock in first.

# `docs/scorelens-decisions.md`

````md
# ScoreLens Progression / Decision Vocabulary v1

## Purpose

This document defines the first canonical progression and decision vocabulary for ScoreLens.

Its job is to keep next-step reasoning consistent across:

- `.tat` programs
- mastery logic
- adaptive support logic
- UI messaging
- future AI decision systems

A diagnostic explains what was observed.  
A goal explains what success should be.  
A decision explains what should happen next.

---

## Core distinctions

### Diagnostic
What was observed.

Examples:
- `intonation`
- `rhythmAccuracy`

### Goal
What the learner is trying to achieve.

Examples:
- `pitchAccuracyGoal`
- `consistencyGoal`

### Progression state
What condition the learner is currently in.

Examples:
- `ready`
- `inProgress`
- `stalled`
- `complete`
- `blocked`

### Decision
What ScoreLens should do next.

Examples:
- `retry`
- `advance`
- `scaffold`
- `teacherIntervention`

---

## Canonical decision vocabulary

### Immediate flow decisions
- `retry`
- `continue`
- `advance`
- `moveOn`
- `pause`

### Support decisions
- `scaffold`
- `model`
- `segment`
- `slowDown`
- `reduceComplexity`

### Readiness decisions
- `mastered`
- `notYetMastered`
- `needsRepetition`
- `needsConsistency`

### Escalation decisions
- `teacherIntervention`
- `manualReview`
- `stopAttempt`

---

## Canonical progression states

- `ready`
- `inProgress`
- `stalled`
- `complete`
- `blocked`

---

## Recommended decision node shape

```json
{
  "kind": "decision",
  "name": "retry",
  "label": "Retry"
}
````

---

## Recommended semantic homes

### Use `value` for:

* `kind`
* `name`
* `label`

### Use `state` for:

* `active`
* `selected`
* `applied`

### Use `meta` for:

* `reason`
* `confidence`
* `source`
* `priority`
* `explanation`

---

## Canonical decision relations

* `decides`
* `appliesTo`
* `triggeredBy`
* `supports`

---

## Example patterns

### Attempt selects a retry decision

```tat
attempt1 : "decides" : retryDecision
retryDecision : "appliesTo" : note2
retryDecision : "triggeredBy" : intonationDiagnostic
retryDecision : "supports" : pitchAccuracyGoal
```

### Teacher intervention decision

```tat
attempt1 : "decides" : teacherInterventionDecision
teacherInterventionDecision : "appliesTo" : note2
teacherInterventionDecision : "triggeredBy" : consistencyGoal
```

---

## Recommended v1 priorities

### Highest-priority decisions

* `retry`
* `advance`
* `moveOn`
* `scaffold`
* `teacherIntervention`

### Highest-priority progression states

* `inProgress`
* `complete`
* `stalled`