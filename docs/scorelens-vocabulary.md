Absolutely. Let’s lock it into something you can actually use.

# `scorelens-vocabulary.md`

Create this as your first canonical vocabulary sheet:

````md
# ScoreLens Canonical Vocabulary v1

## Purpose

This document defines the first canonical node and edge vocabulary for ScoreLens.

Its job is to keep `.tat` programs consistent by answering:

- what should be a node
- what should be an edge
- what belongs in `value`
- what belongs in `state`
- what belongs in `meta`

This is a **small stable core**, not a complete ontology of all music theory.

---

## Core modeling rules

### 1. Nodes are things
A node should represent an entity that can be named, inspected, connected, or mutated.

Examples:
- score
- staff
- measure
- voice
- note
- pitch
- rhythm
- attempt
- diagnostic
- goal

### 2. Edges are relationships
An edge should represent how two nodes relate.

Examples:
- contains
- hasPitch
- hasRhythm
- belongsTo
- precedes
- resolvesTo
- evaluates
- diagnosedAs
- targets

### 3. `value` is intrinsic identity
Use `value` for what a thing is.

Examples:
- note kind
- pitch step/octave
- measure number
- clef
- duration label

### 4. `state` is mutable live truth
Use `state` for what is currently true in a session, attempt, or evaluation.

Examples:
- selected
- active
- attempted
- correct
- passed
- needsReview

### 5. `meta` is annotation and explanation
Use `meta` for descriptive overlay information.

Examples:
- feedback
- expectedPitch
- observedPitch
- confidence
- source
- rubric
- explanation
- severity

### 6. Use `branch` for structure
Use branch edges for containment, attribution, and semantic structure.

### 7. Use `progress` for motion
Use progress edges for sequence, resolution, transition, and movement.

### 8. Prefer one canonical verb
Do not create multiple verbs for the same idea unless there is a real semantic difference.

Prefer:
- `contains`
- `hasPitch`
- `hasRhythm`
- `precedes`
- `resolvesTo`

Avoid unnecessary synonyms.

---

## Canonical node kinds

### Structural nodes
- `score`
- `system`
- `staff`
- `measure`
- `voice`
- `note`
- `rest`

### Musical attribute nodes
- `pitch`
- `rhythm`
- `lyric`
- `dynamic`
- `articulation`
- `key`
- `meter`
- `tempo`
- `interval`
- `chord`
- `function`
- `cadence`

### Performance and evaluation nodes
- `attempt`
- `performance`
- `diagnostic`
- `goal`
- `feedback`
- `student`
- `ensemble`

---

## Canonical branch relations

### Structural
- `contains`
- `belongsTo`

### Attribute relations
- `hasPitch`
- `hasRhythm`
- `hasLyric`
- `hasDynamic`
- `hasArticulation`
- `inKey`
- `inMeter`
- `atTempo`

### Human / performance relations
- `sungBy`

### Evaluation / reasoning relations
- `targets`
- `evaluates`
- `diagnosedAs`
- `mapsTo`

---

## Canonical progress relations

- `precedes`
- `leadsTo`
- `movesTo`
- `resolvesTo`
- `progressesTo`
- `cadencesTo`

---

## Canonical modeling patterns

### Score structure
```tat
score : "contains" : staff1
staff1 : "contains" : measure1
measure1 : "contains" : note1
note1 : "hasPitch" : pitch1
note1 : "hasRhythm" : rhythm1
````

### Voice membership

```tat
note1 : "belongsTo" : soprano
```

### Melodic sequence

```tat
note1 : "precedes" : note2
note1 : "movesTo" : note2
```

### Tonal resolution

```tat
note7 : "resolvesTo" : note1
```

### Evaluation

```tat
attempt1 : "evaluates" : note2
note2 : "diagnosedAs" : diagnostic1
goal1 : "targets" : intonationGoal
```

---

## Recommended first-use priorities

### Highest-priority node kinds

* `note`
* `pitch`
* `rhythm`
* `measure`
* `voice`
* `attempt`
* `diagnostic`
* `goal`

### Highest-priority relations

* `contains`
* `hasPitch`
* `hasRhythm`
* `belongsTo`
* `precedes`
* `resolvesTo`
* `evaluates`
* `diagnosedAs`
* `targets`

---

## Canonical semantic homes

### Use `value` for:

* `kind`
* `label`
* `title`
* `number`
* `step`
* `octave`
* `accidental`
* `duration`
* `clef`

### Use `state` for:

* `selected`
* `active`
* `attempted`
* `correct`
* `visible`
* `locked`
* `passed`
* `needsReview`

### Use `meta` for:

* `feedback`
* `expectedPitch`
* `observedPitch`
* `confidence`
* `source`
* `severity`
* `rubric`
* `tags`
* `explanation`

---

## Notes

This vocabulary is intentionally small.

Add new node kinds or relations only when a real `.tat` program needs them and the current vocabulary cannot express the idea cleanly.