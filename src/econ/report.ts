// Optional record of one economy day, for tools (CSV export, Section 4.3).
// The game does not keep it.

export type ReportField = 'produced' | 'consumed' | 'flowIn' | 'flowOut' | 'offMap';

export interface ReportRow {
  produced: number;
  consumed: number;
  flowIn: number;
  flowOut: number;
  offMap: number;
}

export class DayReport {
  readonly rows = new Map<string, ReportRow>();
  /** Output ratio of each producer location id. */
  readonly outputRatio = new Map<number, number>();

  add(locationId: number, commodity: string, field: ReportField, qty: number): void {
    const key = `${locationId}:${commodity}`;
    let row = this.rows.get(key);
    if (!row) {
      row = { produced: 0, consumed: 0, flowIn: 0, flowOut: 0, offMap: 0 };
      this.rows.set(key, row);
    }
    row[field] += qty;
  }

  get(locationId: number, commodity: string): ReportRow | undefined {
    return this.rows.get(`${locationId}:${commodity}`);
  }
}
