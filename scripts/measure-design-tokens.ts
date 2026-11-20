/**
 * Print WCAG contrast and Machado CVD measurements for src/index.css.
 * Run: npm run measure:tokens
 * Cited from docs/design-token-review.md.
 */
import { measureIndexCss, renderReviewMarkdown } from "./design-token-lib.ts";

const report = measureIndexCss();
process.stdout.write(`${renderReviewMarkdown(report)}\n`);
const failed =
  report.textPairs.filter((p) => !p.pass).length +
  report.uiPairs.filter((p) => !p.pass).length +
  report.chartPairs.filter((p) => !p.pass).length;
process.stderr.write(`measure-design-tokens: contrast-fail=${failed}\n`);
