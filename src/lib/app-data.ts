// B1: every run the app shows (SYNTHETIC fixtures + the team's run records), parsed once.
// App.tsx loads this module with a dynamic import(), so Rollup/Rolldown put it, the bundled
// fixture/run-record data and the ingest parsers in their own chunk instead of the entry
// (https://vite.dev/guide/features#dynamic-import). A new runs/*.json changes this chunk only.
import { loadFixtureRuns, loadTeamRuns } from "./load-fixture-runs";
import { summarizeByHarness } from "./usage-summary";

export const allRuns = [...loadFixtureRuns(), ...loadTeamRuns()];
export const usageRows = summarizeByHarness(allRuns);
