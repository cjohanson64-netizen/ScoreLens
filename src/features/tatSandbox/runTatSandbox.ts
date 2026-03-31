import { executeTat } from "@core/tat/runtime";
import helloGraphSource from "./programs/helloGraph.tat?raw";
import scoreStructureSource from "./programs/scoreStructure.tat?raw";
import scoreEvaluationSource from "./programs/scoreEvaluation.tat?raw";
import scoreDiagnosticsSource from "./programs/scoreDiagnostics.tat?raw";
import scoreMasterySource from "./programs/scoreMastery.tat?raw";
import scoreDecisionsSource from "./programs/scoreDecisions.tat?raw";
import scoreTeacherControlsSource from "./programs/scoreTeacherControls.tat?raw";
import scorePipelineSource from "./programs/scorePipeline.tat?raw";
import scoreV1SimpleSource from "./programs/scoreV1Simple.tat?raw";
import scoreExcerptSource from "./programs/scoreExcerpt.tat?raw";
import scoreLensDemoXml from "./fixtures/ScoreLensDemo.musicxml?raw";
import { runImportedMusicXml } from "./runImportedMusicXml";

export const sandboxPrograms = {
  helloGraph: { kind: "tat", source: helloGraphSource },
  scoreStructure: { kind: "tat", source: scoreStructureSource },
  scoreEvaluation: { kind: "tat", source: scoreEvaluationSource },
  scoreDiagnostics: { kind: "tat", source: scoreDiagnosticsSource },
  scoreMastery: { kind: "tat", source: scoreMasterySource },
  scoreDecisions: { kind: "tat", source: scoreDecisionsSource },
  scoreTeacherControls: { kind: "tat", source: scoreTeacherControlsSource },
  scorePipeline: { kind: "tat", source: scorePipelineSource },
  scoreV1Simple: { kind: "tat", source: scoreV1SimpleSource },
  scoreExcerpt: { kind: "tat", source: scoreExcerptSource },
  importedScoreLensDemo: { kind: "musicxml", source: scoreLensDemoXml },
} as const;

export type SandboxProgramName = keyof typeof sandboxPrograms;

export function runTatSandbox(program: SandboxProgramName = "scoreExcerpt") {
  const entry = sandboxPrograms[program];

  if (entry.kind === "tat") {
    const execution = executeTat(entry.source);

    return {
      mode: "tat" as const,
      source: entry.source,
      generatedTatSource: null,
      xmlSource: null,
      execution,
    };
  }

  const imported = runImportedMusicXml(entry.source);


  return {
    mode: "musicxml" as const,
    source: imported.xmlSource,
    generatedTatSource: imported.tatSource,
    xmlSource: imported.xmlSource,
    scoreTitle: imported.scoreTitle,
    execution: imported.output,
  };
}
