Absolutely — this is the right follow-up.

Now that diagnostics are defined, **goals** should become the next canonical layer, because goals tell ScoreLens what success looks like and when it should move on.

# `docs/scorelens-goals.md`

````md
# ScoreLens Goal Vocabulary v1

## Purpose

This document defines the first canonical goal vocabulary for ScoreLens.

Its job is to keep instructional targets consistent across:

- `.tat` programs
- teacher-defined expectations
- evaluation logic
- progression decisions
- feedback systems
- future AI reasoning

A goal describes what a learner is trying to achieve or demonstrate.

---

## Core modeling rules

### 1. A goal is a target state, not an observation
A goal defines the desired outcome.
A diagnostic defines what was observed.

Examples:
- goal: `pitchAccuracyGoal`
- diagnostic: `intonation`

### 2. Goals should be reusable instructional concepts
Prefer:
- `pitchAccuracyGoal`
- `rhythmAccuracyGoal`
- `vowelUnityGoal`

Avoid:
- `stop singing sharp`
- `sing this better`
- `fix measure 12`

Those belong in teacher feedback, not canonical goal names.

### 3. Goals can target diagnostics, structures, or behaviors
A goal may target:
- a diagnostic area
- a note/measure/phrase
- a performance behavior
- a skill area

### 4. Goals should be distinct from pass/fail results
A goal describes what success means.
Whether the learner met that goal belongs in `state`, `meta`, or evaluation logic.

### 5. Goals should support progression logic
Goals should be usable by ScoreLens to determine:
- whether a learner should continue
- whether repetition is needed
- whether scaffolding is needed
- whether human intervention is needed

---

## Canonical goal categories

### Pitch goals
- `pitchAccuracyGoal`
- `intonationGoal`
- `intervalAccuracyGoal`
- `tonalResolutionGoal`
- `pitchStabilityGoal`

#### Notes
- Use `pitchAccuracyGoal` for general pitch correctness.
- Use `intonationGoal` for tuning quality.
- Use `intervalAccuracyGoal` for interval precision.
- Use `tonalResolutionGoal` for tendency-tone and tonal goal behavior.
- Use `pitchStabilityGoal` when consistency across sustain or repetition matters.

---

### Rhythm goals
- `rhythmAccuracyGoal`
- `pulseStabilityGoal`
- `entranceTimingGoal`
- `releaseTimingGoal`
- `subdivisionAccuracyGoal`
- `tempoConsistencyGoal`

#### Notes
- Use `rhythmAccuracyGoal` for general rhythmic correctness.
- Use `pulseStabilityGoal` for beat steadiness.
- Use `entranceTimingGoal` for clean starts.
- Use `releaseTimingGoal` for cutoffs/releases.
- Use `subdivisionAccuracyGoal` for internal beat division.
- Use `tempoConsistencyGoal` for tempo stability.

---

### Tone goals
- `resonanceGoal`
- `breathFlowGoal`
- `breathinessReductionGoal`
- `forcedToneReductionGoal`
- `vowelUnityGoal`
- `formantAlignmentGoal`
- `singerFormantGoal`
- `toneFocusGoal`

#### Notes
- Use `resonanceGoal` for resonance efficiency and ring.
- Use `breathFlowGoal` for support and airflow coordination.
- Use `breathinessReductionGoal` when excess air/noise is the issue.
- Use `forcedToneReductionGoal` when pressing/forcing must be reduced.
- Use `vowelUnityGoal` for ensemble vowel consistency.
- Use `formantAlignmentGoal` for acoustic vowel shaping alignment.
- Use `singerFormantGoal` when projection/resonance cluster work is the focus.
- Use `toneFocusGoal` for centering tone.

---

### Musicianship goals
- `phrasingGoal`
- `dynamicControlGoal`
- `articulationClarityGoal`
- `dictionGoal`
- `lineContinuityGoal`
- `styleAccuracyGoal`

---

### Learning-process goals
- `consistencyGoal`
- `independenceGoal`
- `transferGoal`
- `selfCorrectionGoal`

#### Notes
- Use `consistencyGoal` when repetition must become stable.
- Use `independenceGoal` when the learner should perform without prompting.
- Use `transferGoal` when a skill should generalize across contexts.
- Use `selfCorrectionGoal` when the learner should identify and repair errors.

---

## Recommended goal node shape

A goal node should usually keep a simple intrinsic identity in `value`.

Example:

```json
{
  "kind": "goal",
  "name": "pitchAccuracyGoal",
  "label": "Pitch Accuracy Goal"
}
````

Optional scoped example:

```json
{
  "kind": "goal",
  "name": "releaseTimingGoal",
  "label": "Release Timing Goal",
  "scope": "measure"
}
```

---

## Recommended semantic homes

### Use `value` for:

* `kind`
* `name`
* `label`
* `scope`

### Use `state` for:

* `active`
* `met`
* `passed`
* `needsWork`
* `locked`
* `unlocked`

### Use `meta` for:

* `threshold`
* `minimumAttempts`
* `maximumAttempts`
* `masteryWindow`
* `explanation`
* `priority`
* `source`

---

## Canonical threshold vocabulary

Use `meta.threshold` when the goal has a measurable success boundary.

Examples:

* `0.9`
* `0.85`
* `1.0`

Use `meta.masteryWindow` when success depends on repeated consistency.

Examples:

* `2`
* `3`
* `4`

Use `meta.minimumAttempts` and `meta.maximumAttempts` for attempt policy.

Examples:

* `2`
* `4`

These align well with the ScoreLens progression ideas you already outlined.

---

## Canonical relation patterns

### A goal targets a diagnostic area

```tat
goal1 : "targets" : diagnostic1
```

### An attempt evaluates a note relative to a goal

```tat
attempt1 : "evaluates" : note2
```

### A goal applies to a note, measure, phrase, or performance

```tat
goal1 : "targets" : note2
goal1 : "targets" : measure1
```

### A goal can target both a structure and a diagnostic

```tat
pitchAccuracyGoal : "targets" : note2
pitchAccuracyGoal : "targets" : intonationDiagnostic
```

---

## Example goal nodes

### Pitch accuracy

```json
{
  "kind": "goal",
  "name": "pitchAccuracyGoal",
  "label": "Pitch Accuracy Goal"
}
```

### Vowel unity

```json
{
  "kind": "goal",
  "name": "vowelUnityGoal",
  "label": "Vowel Unity Goal"
}
```

### Consistency

```json
{
  "kind": "goal",
  "name": "consistencyGoal",
  "label": "Consistency Goal"
}
```

---

## Goal/result distinction

Keep these concepts separate:

### Goal

What success is supposed to be.

### Diagnostic

What kind of issue or strength was observed.

### Feedback

Human-readable explanation.

### State

Whether the goal is currently met, active, passed, or needs work.

Example split:

* goal node name: `pitchAccuracyGoal`
* diagnostic node name: `intonation`
* note state: `correct = false`
* note meta: `feedback = "Pitch was sharp during the attempt"`