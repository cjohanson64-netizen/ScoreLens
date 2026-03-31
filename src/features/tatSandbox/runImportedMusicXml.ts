import { executeTat } from "@core/tat/runtime";
import { generateTatFromMusicXml } from "./importers/generateTatFromMusicXml";

function extractScoreTitle(xmlSource: string): string {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlSource, "application/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    return "Imported Score";
  }

  const movementTitle = xml.querySelector("movement-title")?.textContent?.trim();
  const workTitle = xml.querySelector("work > work-title")?.textContent?.trim();

  return movementTitle || workTitle || "Imported Score";
}

type ImportedPracticeSelection = {
  partId: string | null;
  startMeasureNumber: number | null;
  endMeasureNumber: number | null;
};

type ImportedMeasureSelection = {
  partId: string | null;
  measureNumber: number | null;
  voice?: string | null;
};

type ImportedSelectionOptions = {
  practiceSelection?: ImportedPracticeSelection;
  measureSelection?: ImportedMeasureSelection;
};

export function runImportedMusicXml(
  xmlSource: string,
  options: ImportedSelectionOptions = {},
) {
  const scoreTitle = extractScoreTitle(xmlSource);
  const { practiceSelection, measureSelection } = options;

  const tatSource = generateTatFromMusicXml(xmlSource, {
    programName: "importedScore",
    rootName: "scoreMain",
    includeProjection: false,
    practiceSelection,
    measureSelection,
  });

  const output = executeTat(tatSource);

  return {
    xmlSource,
    tatSource,
    output,
    scoreTitle,
  };
}
