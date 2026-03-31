type SelectedMeasureContext = {
  partId: string;
  measureNumber: number;
  voice?: string | null;
};

type SelectedMeasureGraphState = {
  initialDefaultTarget?: unknown;
  selectedMeasurePartId?: unknown;
  selectedMeasureNumber?: unknown;
  selectedMeasureVoice?: unknown;
  selectedMeasureDefaultTarget?: unknown;
  orderedMeasurePracticeNotes?: unknown;
};

type SelectedMeasureGraphLike = {
  state?: SelectedMeasureGraphState;
} | null;

export function readSelectedMeasureDefaultTargetId(
  graph: SelectedMeasureGraphLike,
  selection: SelectedMeasureContext | null = null,
): string | null {
  if (!graph?.state || !selection) return null;

  if (graph.state.selectedMeasurePartId !== selection.partId) return null;
  if (graph.state.selectedMeasureNumber !== selection.measureNumber) return null;

  const target = graph.state.selectedMeasureDefaultTarget;
  if (!target || typeof target !== "object") return null;

  return typeof target.id === "string" ? target.id : null;
}

export function readOrderedMeasurePracticeNoteIds(
  graph: SelectedMeasureGraphLike,
  selection: SelectedMeasureContext | null = null,
): string[] {
  if (!graph?.state || !selection || !selection.voice) return [];

  if (graph.state.selectedMeasurePartId !== selection.partId) return [];
  if (graph.state.selectedMeasureNumber !== selection.measureNumber) return [];
  if (graph.state.selectedMeasureVoice !== selection.voice) return [];

  const notes = graph.state.orderedMeasurePracticeNotes;
  if (!Array.isArray(notes)) return [];

  return notes
    .map((node) =>
      node && typeof node === "object" && typeof node.id === "string"
        ? node.id
        : null,
    )
    .filter((id): id is string => typeof id === "string");
}

export function readInitialDefaultTargetId(
  graph: SelectedMeasureGraphLike,
): string | null {
  if (!graph?.state) return null;

  const target = graph.state.initialDefaultTarget;
  if (!target || typeof target !== "object") return null;

  return typeof target.id === "string" ? target.id : null;
}
