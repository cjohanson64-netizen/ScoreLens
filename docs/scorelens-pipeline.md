# ScoreLens Evaluation Pipeline v1

## Purpose

This document defines the first canonical evaluation pipeline for ScoreLens.

It describes how ScoreLens moves from teacher-defined expectations to learner attempts, graph evaluation, adaptive decisions, and progression outcomes.

---

## Pipeline stages

1. Teacher config
2. Target selection
3. Attempt capture
4. Diagnostic evaluation
5. Goal comparison
6. Decision selection
7. Progression outcome
8. Next learning state

---

## 1. Teacher config

The teacher defines:

- evaluation scope
- active goals
- mastery thresholds
- attempt limits
- support permissions
- override rules

Main graph entities:
- goal nodes
- goal meta
- control nodes
- control relations

Output:
- configured evaluation context

---

## 2. Target selection

ScoreLens identifies the current focus target.

Possible targets:
- note
- measure
- phrase
- voice line
- diagnostic area
- goal scope

Main graph entities:
- structural nodes
- active goals targeting the structure

Output:
- active target

---

## 3. Attempt capture

The learner performs the target.

ScoreLens records:
- attempt
- evaluated target
- observed evidence
- session state

Main graph entities:
- attempt nodes
- `evaluates` edges
- target state
- observed meta

Output:
- performed evidence

---

## 4. Diagnostic evaluation

ScoreLens interprets the attempt into named findings.

Examples:
- intonation
- rhythmAccuracy
- resonance
- inconsistentExecution

Main graph entities:
- diagnostic nodes
- `diagnosedAs` edges
- diagnostic state
- diagnostic meta

Output:
- findings

---

## 5. Goal comparison

ScoreLens compares findings against configured success criteria.

Questions:
- was the goal met?
- was it close?
- is repetition still useful?
- are attempt limits reached?

Main graph entities:
- goal nodes
- goal state
- goal meta thresholds
- target relations

Output:
- readiness judgment

---

## 6. Decision selection

ScoreLens selects the next-step action.

Examples:
- retry
- advance
- moveOn
- scaffold
- slowDown
- teacherIntervention

Main graph entities:
- decision nodes
- `decides`
- `appliesTo`
- `triggeredBy`
- `supports`
- decision state
- decision meta

Output:
- selected next-step action

---

## 7. Progression outcome

ScoreLens updates the current learning-flow status.

Canonical progression states:
- ready
- inProgress
- stalled
- complete
- blocked

Main graph entities:
- state on notes, goals, attempts, or larger targets

Output:
- updated progression condition

---

## 8. Next learning state

The system determines what becomes active in the next cycle.

Possibilities:
- retry current target
- advance to next target
- apply support mode
- require teacher intervention

Output:
- next cycle context

---

## Canonical layer model

### Structure
What the music is.

### Observation
What happened in the attempt.

### Interpretation
What it means.

### Expectation
What success should be.

### Action
What should happen next.

### Progression
What learning state now exists.

---

## Notes

This pipeline is the first canonical ScoreLens evaluation loop.

Future `.tat` programs, UI flows, and AI orchestration should align to this model unless a stronger replacement is intentionally adopted.