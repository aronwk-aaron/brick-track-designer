import { describe, expect, it } from 'vitest';
import { type Design, OPTION_DEFAULTS } from '../src/app/design';
import { buildReport, pngBytes, pushBuilt, readBuilt, readReportZip, reportName, type ReportInput, reportZip, settingsChanged } from '../src/app/report';
import { isZip, unzip } from '../src/geom/unzip';
import { zip } from '../src/geom/zip';

const design: Design = { version: 1, gaugeStuds: 4, name: 'My loop', options: { ballast: 'buddy', printBedX: 256 }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] };
const input = (): ReportInput => ({
  version: 'abc1234', now: new Date(2026, 10, 10, 9, 5, 7), userAgent: 'UA', window: { width: 1400, height: 900, pixelRatio: 1 }, design,
  status: { info: '6 parts to print', problem: 'a warning' }, warnings: ['part too big', 'second'], issues: [{ at: [80, 160], r: 12, text: 'too big' }],
  buildMs: 2345.6, pieces: [{ name: 'track1', size: [100.04, 50, 9.6] }, { name: 'track-bought-1', lego: true }],
  toggles: { auto: true, show3d: true, shown: ['track', 'points'], explode: 0.2, mode: 'select' }, selection: [0],
  plan: { scale: 6, ox: 100.123, oy: 200 }, camera: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1] },
});

describe('a problem report', () => {
  it('names the zip after the design and the time', () => {
    expect(reportName('My loop', new Date(2026, 10, 10, 9, 5, 7))).toBe('btd-report-My-loop-20261110-090507.zip');
    expect(reportName(undefined, new Date(2026, 0, 2, 13, 14, 15))).toBe('btd-report-untitled-20260102-131415.zip');
    expect(reportName('a/b:c', new Date(2026, 0, 2))).toBe('btd-report-a-b-c-20260102-000000.zip');
  });
  it('lists only the settings that differ from the defaults', () => {
    expect(settingsChanged({ ballast: 'buddy', printBedX: OPTION_DEFAULTS.printBedX })).toEqual({ ballast: 'buddy' });
    expect(settingsChanged(undefined)).toEqual({});
    expect(settingsChanged({ ballast: 'none' }, { ballast: 'none' })).toEqual({});
  });
  it('says everything the app knew', () => {
    const r = buildReport(input());
    expect(r.app).toEqual({ version: 'abc1234', userAgent: 'UA' });
    expect(r.date).toBe(new Date(2026, 10, 10, 9, 5, 7).toISOString());
    expect(r.window).toEqual({ width: 1400, height: 900, pixelRatio: 1 });
    expect(r.settingsChanged).toEqual(OPTION_DEFAULTS.ballast === 'buddy' ? {} : { ballast: 'buddy' });
    expect(r.build.status).toBe('6 parts to print');
    expect(r.build.warnings).toEqual(['part too big', 'second']);
    expect(r.build.issues).toEqual([{ at: [10, 20], atUnit: 'studs', radiusMm: 12, text: 'too big' }]);
    expect(r.build.ms).toBe(2346);
    expect(r.build.parts).toEqual([{ name: 'track1', bought: false, sizeMm: [100, 50, 9.6] }, { name: 'track-bought-1', bought: true, sizeMm: null }]);
    expect(r.toggles).toEqual({ auto: true, show3d: true, shown: ['track', 'points'], explode: 0.2, mode: 'select' });
    expect(r.selection).toEqual([0]);
    expect(r.views.plan).toEqual({ scale: 6, ox: 100.12, oy: 200 });
    expect(r.views.view3d).toEqual({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1] });
    expect(r.design).toMatchObject({ name: 'My loop', routes: 1, tables: 0 });
  });
  it('zips the four files, and reads them back', () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const z = reportZip(input(), '  the lever sticks  ', { plan: png, view3d: png });
    expect(isZip(z)).toBe(true);
    expect([...unzip(z).keys()]).toEqual(['design.btd.json', 'report.json', 'plan.png', 'view3d.png', 'note.txt']);
    const back = readReportZip(z);
    expect(back.design).toEqual(JSON.parse(JSON.stringify(design)));
    expect(back.report?.app.version).toBe('abc1234');
    expect(back.note).toBe('the lever sticks');
  });
  it('leaves out a picture there is none of, and turns away a zip that is not a report', () => {
    expect([...unzip(reportZip(input(), '', {})).keys()]).toEqual(['design.btd.json', 'report.json', 'note.txt']);
    expect(() => readReportZip(zip([{ name: 'x.txt', data: new Uint8Array(1) }]))).toThrow(/not one of this app's reports/);
    expect(() => unzip(new Uint8Array(10))).toThrow(/zip/);
  });
  it('reads a PNG from a data URL', () => {
    expect([...pngBytes('data:image/png;base64,iVBORw==')!]).toEqual([137, 80, 78, 71]);
    expect(pngBytes('data:image/jpeg;base64,xx')).toBeUndefined();
  });
});

describe('the designs built lately', () => {
  const e = (n: number, json = `d${n}`) => ({ json, at: n, status: `s${n}` });
  it('puts the newest first and does not keep one twice', () => {
    let l = pushBuilt([], e(1)); l = pushBuilt(l, e(2)); l = pushBuilt(l, e(3, 'd1'));
    expect(l.map((x) => x.json)).toEqual(['d1', 'd2']);
    expect(l[0].at).toBe(3);
  });
  it('keeps the last 20 and stays within a size', () => {
    let l: ReturnType<typeof pushBuilt> = [];
    for (let k = 0; k < 30; k++) l = pushBuilt(l, e(k));
    expect(l.length).toBe(20);
    expect(l[0].json).toBe('d29');
    expect(pushBuilt([e(1), e(2)], { json: 'x'.repeat(100), at: 3, status: '' }, 20, 50).map((x) => x.at)).toEqual([3]);
  });
  it('reads a saved list, leaving out what is not right', () => {
    expect(readBuilt(JSON.stringify([e(1), { json: 3 }, null]))).toEqual([e(1)]);
    expect(readBuilt('nonsense')).toEqual([]);
    expect(readBuilt(null)).toEqual([]);
  });
});
