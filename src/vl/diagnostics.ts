import { VlGraph } from './graph';
import { parseXml } from './xml';
import { Diagnostic, validateGraph } from './validation';

export function validateDocumentText(sourceText: string): Diagnostic[] {
  try {
    const report = validateGraph(new VlGraph(parseXml(sourceText)));
    return report.errors;
  } catch (error) {
    return [{
      code: 'xml-parse',
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    }];
  }
}
