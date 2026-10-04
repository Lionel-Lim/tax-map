import type { SharedState } from './data/state.js';
import type { AreaComparisonOptions } from './domain/tax/area.js';

export const COMPARISON_SESSION = Symbol('comparison-session');

export interface ComparisonDraft {
  query: string;
  scenario: SharedState;
  overrides: AreaComparisonOptions['overrides'];
  postcodeInput: string;
  matchedPostcode: string | null;
  postcodeLocation: [number, number] | null;
  postcodeMessage: string;
  postcodeStatus: string;
  search: string;
  isExample: boolean;
  settingsError: string;
}

/** Owned by the layout: personal figures stay in this tab's memory only. */
export interface ComparisonSession {
  saved: ComparisonDraft | null;
  resume: boolean;
}
