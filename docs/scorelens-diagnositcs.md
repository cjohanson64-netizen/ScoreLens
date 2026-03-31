Absolutely. Let’s draft it in a way that is **small, usable, and extensible**.

# `docs/scorelens-diagnostics.md`

````md
# ScoreLens Diagnostic Vocabulary v1

## Purpose

This document defines the first canonical diagnostic vocabulary for ScoreLens.

Its job is to keep evaluation language consistent across:

- `.tat` programs
- diagnostic nodes
- goals
- feedback
- future AI reasoning
- future UI labels

This vocabulary should stay small and stable. Add new diagnostic terms only when a real evaluation case requires them.

---

## Core modeling rules

### 1. A diagnostic is a named evaluative finding
A diagnostic identifies *what kind of issue or strength has been observed*.

Examples:
- intonation
- rhythmAccuracy
- resonance
- vowelUnity

### 2. Diagnostics should be domain concepts, not sentence fragments
Prefer:
- `intonation`
- `pulseStability`
- `vowelUnity`

Avoid:
- `wasSharp`
- `sangTooBreathy`
- `didNotSupportBreath`

Those can appear in `meta.feedback` or `meta.explanation`, but not as canonical diagnostic names.

### 3. Diagnostics can represent both problems and strengths
A diagnostic is not always negative.

Examples:
- `pitchAccuracy`
- `rhythmAccuracy`
- `resonance`

The evaluation outcome can be expressed in `state`, `meta`, or related goal/result structures.

### 4. Diagnostics should stay distinct from goals
A diagnostic says what was observed.
A goal says what the learner is trying to improve.

Examples:
- diagnostic: `intonation`
- goal: `pitchAccuracyGoal`

### 5. Diagnostics should stay distinct from feedback text
Use diagnostic nodes for canonical categories.
Use `meta.feedback` and `meta.explanation` for human-readable descriptions.

---

## Canonical diagnostic categories

### Pitch diagnostics
These describe pitch-related findings.

- `pitchAccuracy`
- `intonation`
- `intervalAccuracy`
- `tonalResolution`
- `pitchCenter`
- `pitchStability`

#### Notes
- Use `pitchAccuracy` for general pitch correctness.
- Use `intonation` when the issue is tuning quality or deviation.
- Use `intervalAccuracy` when the issue is the size or quality of melodic/harmonic intervals.
- Use `tonalResolution` when evaluating tendency tones or tonal goal behavior.
- Use `pitchCenter` when evaluating whether the tone is centered or unfocused.
- Use `pitchStability` when pitch drifts or wobbles over time.

---

### Rhythm diagnostics
These describe rhythmic findings.

- `rhythmAccuracy`
- `pulseStability`
- `entranceTiming`
- `releaseTiming`
- `subdivisionAccuracy`
- `tempoConsistency`

#### Notes
- Use `rhythmAccuracy` for general rhythmic correctness.
- Use `pulseStability` for steady beat consistency.
- Use `entranceTiming` for attacks/entries.
- Use `releaseTiming` for cutoffs/releases.
- Use `subdivisionAccuracy` when internal beat division is incorrect.
- Use `tempoConsistency` when overall tempo drifts.

---

### Tone diagnostics
These describe vocal tone production and resonance findings.

- `resonance`
- `breathFlow`
- `breathiness`
- `forcedTone`
- `vowelUnity`
- `formantAlignment`
- `singerFormant`
- `toneFocus`

#### Notes
- Use `resonance` for general ring, resonance space, and tonal efficiency.
- Use `breathFlow` for support/air coordination issues.
- Use `breathiness` when excess air/noise weakens tone.
- Use `forcedTone` when the tone is pressed or overdriven.
- Use `vowelUnity` when vowel alignment across singers or notes is inconsistent.
- Use `formantAlignment` when vowel shaping/acoustic alignment is the issue.
- Use `singerFormant` when upper resonance clustering/projection is relevant.
- Use `toneFocus` for centered vs diffuse tone.

---

### Musicianship diagnostics
These describe expressive and interpretive findings.

- `phrasing`
- `dynamicControl`
- `articulationClarity`
- `diction`
- `lineContinuity`
- `styleAccuracy`

#### Notes
- Use `phrasing` for shaping and musical contour.
- Use `dynamicControl` for dynamic contrast and control.
- Use `articulationClarity` for attacks, releases, and articulation precision.
- Use `diction` for textual clarity and intelligibility.
- Use `lineContinuity` for sustained phrase connection and musical line.
- Use `styleAccuracy` for historically/stylistically appropriate choices.

---

### Learning-process diagnostics
These describe instructional and repetition patterns.

- `repeatedError`
- `inconsistentExecution`
- `needsModeling`
- `needsScaffolding`
- `transferNotEstablished`

#### Notes
- Use `repeatedError` when the same issue persists across attempts.
- Use `inconsistentExecution` when success is unstable or non-repeatable.
- Use `needsModeling` when the learner likely needs demonstration.
- Use `needsScaffolding` when smaller instructional steps are needed.
- Use `transferNotEstablished` when a concept does not generalize across contexts.

---

## Recommended diagnostic node shape

A diagnostic node should usually use a simple intrinsic identity in `value`.

Example:

```json
{
  "kind": "diagnostic",
  "name": "intonation"
}
````

Optional example with label:

```json
{
  "kind": "diagnostic",
  "name": "vowelUnity",
  "label": "Vowel Unity"
}
```

---

## Recommended semantic homes

### Use `value` for:

* `kind`
* `name`
* `label`

### Use `state` for:

* `active`
* `confirmed`
* `resolved`

### Use `meta` for:

* `feedback`
* `explanation`
* `severity`
* `confidence`
* `observedPitch`
* `expectedPitch`
* `observedRhythm`
* `expectedRhythm`
* `attemptCount`

---

## Recommended severity vocabulary

Use these canonical severity values in `meta.severity`:

* `low`
* `moderate`
* `high`

Optional future extension:

* `critical`

---

## Recommended confidence vocabulary

Use numeric confidence when available:

* `0` to `1`

Example:

* `0.82`

---

## Canonical relation patterns

### A note diagnosed with an issue

```tat
note2 : "diagnosedAs" : diagnostic1
```

### An attempt evaluates a note

```tat
attempt1 : "evaluates" : note2
```

### A goal targets a diagnostic area

```tat
goal1 : "targets" : diagnostic1
```

---

## Example diagnostic nodes

### Intonation

```json
{
  "kind": "diagnostic",
  "name": "intonation",
  "label": "Intonation"
}
```

### Rhythm accuracy

```json
{
  "kind": "diagnostic",
  "name": "rhythmAccuracy",
  "label": "Rhythm Accuracy"
}
```

### Vowel unity

```json
{
  "kind": "diagnostic",
  "name": "vowelUnity",
  "label": "Vowel Unity"
}
```