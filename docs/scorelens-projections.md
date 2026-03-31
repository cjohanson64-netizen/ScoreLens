Absolutely — here’s a clean v1 doc draft you can drop in.

# `docs/scorelens-projections.md`

````md
# ScoreLens UI Projections v1

## Purpose

This document defines the first canonical UI-facing projections for ScoreLens.

These projections exist so the UI does **not** need to read the raw graph directly.

Instead of parsing graph nodes, edges, state, and meta inside React components, the projection layer should transform the graph into a few stable views that the interface can render easily.

---

## Core rule

The UI should read projections, not raw graph.

The raw graph remains the source of truth.

The projection layer is the translation layer between:

- TAT graph structure
- ScoreLens semantics
- UI rendering

---

## Canonical projection set

ScoreLens v1 uses four primary UI-facing projections:

1. `structure`
2. `activeTarget`
3. `evaluationSummary`
4. `nextAction`

---

## 1. `structure`

### Purpose

Provides the structural outline of the score for navigation and rendering scaffolding.

### Questions it answers

- what score is loaded
- what parts exist
- what measures exist in each part
- what events are inside each measure
- what order they appear in

### Reads from

- structural nodes
- structural edges
- measure meta
- note/rest meta
- pitch/rhythm/lyric nodes

### Shape

```ts
type StructureProjection = {
  score: {
    id: string;
    title: string | null;
  };
  parts: Array<{
    id: string;
    partId: string;
    name: string;
    abbreviation?: string;
    measures: Array<{
      id: string;
      number: number;
      meta: {
        key?: { fifths: number; mode?: string };
        meter?: { beats: number; beatType: number };
        clef?: { sign: string; line: number; octaveChange?: number };
        tempo?: number;
      };
      events: Array<{
        id: string;
        kind: "note" | "rest";
        voice?: string;
        type?: string;
        pitchText?: string | null;
        lyricText?: string | null;
      }>;
    }>;
  }>;
};
````

### Notes

This projection should stay structural and readable.

It should not include evaluation logic.

---

## 2. `activeTarget`

### Purpose

Provides one focused object representing the currently active learning target.

### Questions it answers

* which target is selected
* where it is located
* what the expected score data is
* what observed data exists, if any
* what the current state is

### Reads from

* `state.selected`
* target node `value`
* target node `meta`
* optional attempt-related info later

### Shape

```ts
type ActiveTargetProjection = {
  target: null | {
    id: string;
    kind: "note" | "measure" | "part";
    label: string;
    location: {
      partId: string;
      measureNumber: number;
      voice?: string;
    };
    expected: {
      pitch?: string | null;
      rhythm?: string | null;
      lyric?: string | null;
    };
    observed: {
      pitch?: string | null;
      rhythm?: string | null;
    };
    state: {
      selected: boolean;
      correct?: boolean;
      needsReview?: boolean;
      progression?: string;
      nextStep?: string;
    };
  };
};
```

### Notes

For v1, the active target will most often be a `note`.

---

## 3. `evaluationSummary`

### Purpose

Provides a human-readable evaluation summary for the active target.

### Questions it answers

* was the target correct
* does it need review
* what diagnostics were found
* what goals are relevant
* what feedback should be shown
* how expected and observed values compare

### Reads from

* target `state`
* target `meta.feedback`
* target `meta.diagnostics`
* target `meta.goals`
* target `meta.expectedPitch`
* target `meta.observedPitch`
* target `meta.expectedRhythm`
* target `meta.observedRhythm`

### Shape

```ts
type EvaluationSummaryProjection = {
  targetId: string | null;
  status: {
    correct?: boolean;
    needsReview?: boolean;
    progression?: string;
  };
  feedback: string | null;
  diagnostics: Array<{
    name: string;
    severity?: string;
    confidence?: number;
    explanation?: string;
  }>;
  goals: Array<{
    name: string;
    threshold?: number;
    met?: boolean;
  }>;
  comparison: {
    expectedPitch?: string | null;
    observedPitch?: string | null;
    expectedRhythm?: string | null;
    observedRhythm?: string | null;
  };
};
```

### Notes

This projection is where ScoreLens begins to feel like an evaluator.

---

## 4. `nextAction`

### Purpose

Provides the immediate next-step guidance for the active target.

### Questions it answers

* what should happen next
* what support action is recommended
* why that decision was made
* what teacher controls constrain the action

### Reads from

* `state.progression`
* `state.nextStep`
* `meta.supportAction`
* `meta.decisionReason`
* `meta.teacherControls`

### Shape

```ts
type NextActionProjection = {
  targetId: string | null;
  progression: string | null;
  nextStep: string | null;
  supportAction: string | null;
  decisionReason: string | null;
  teacherControls: {
    minimumAttempts?: number;
    maximumAttempts?: number;
    allowMoveOn?: boolean;
    allowScaffold?: boolean;
    allowSlowDown?: boolean;
    stopAfterMaximumAttempts?: boolean;
  } | null;
};
```

### Notes

This projection is the UI’s “what now?” contract.

---

## Projection responsibilities

### Projection layer should

* read the raw graph
* resolve node and edge relationships
* extract the current selected target
* flatten semantic data into UI-friendly objects
* hide graph complexity from React

### React components should

* render the projection output
* avoid raw graph traversal
* avoid interpreting ids and edge structure directly

---

## Recommended projection sources by layer

### `structure`

Reads mostly from:

* `value`
* structural edges
* selected measure meta
* note/rest linked pitch/rhythm/lyric nodes

### `activeTarget`

Reads mostly from:

* `state.selected`
* target `value`
* target `meta`

### `evaluationSummary`

Reads mostly from:

* target `state`
* target `meta.feedback`
* target `meta.diagnostics`
* target `meta.goals`
* target `meta.expected*`
* target `meta.observed*`

### `nextAction`

Reads mostly from:

* target `state.progression`
* target `state.nextStep`
* target `meta.supportAction`
* target `meta.decisionReason`
* target `meta.teacherControls`

---

## Recommended first UI layout

### Left column

`structure`

### Center panel

`activeTarget`

### Right upper panel

`evaluationSummary`

### Right lower panel

`nextAction`

---

## Example v1 target interpretation

A selected note might produce these projections:

### `activeTarget`

* current note: `note:P1:2:1:1`
* part: `P1`
* measure: `2`
* expected pitch: `C#5`
* expected rhythm: `quarter`

### `evaluationSummary`

* correct: `false`
* feedback: `"Pitch was sharp and execution was inconsistent"`
* diagnostics:

  * `intonation`
  * `inconsistentExecution`

### `nextAction`

* progression: `inProgress`
* nextStep: `retry`
* supportAction: `slowDown`
* decisionReason: `"Pitch accuracy goal not yet met and attempts remain"`

---

## Notes

These projections are the first canonical UI contracts for ScoreLens.

They should remain stable enough for v1 UI development.

If the raw graph changes later, the projection layer should absorb most of that change so the UI can stay simpler.
