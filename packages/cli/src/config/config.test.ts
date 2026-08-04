import { DEFAULT_THRESHOLDS } from '@cct/core';
import { describe, expect, it } from 'vitest';
import { configSearchPaths, DEFAULT_CONFIG, parseConfig } from './config.js';

/**
 * Config is read on the render path, so like the stdin parser it fails soft: a
 * malformed file degrades to defaults rather than blanking the status line.
 */

describe('parseConfig', () => {
  it('returns defaults for an empty object', () => {
    expect(parseConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it.each([[null], [undefined], ['string'], [42], [[]]])(
    'returns defaults for junk input %j',
    (junk) => {
      expect(parseConfig(junk)).toEqual(DEFAULT_CONFIG);
    },
  );

  it('reads the fields it recognises', () => {
    const config = parseConfig({
      theme: 'tower-light',
      glyphs: 'nerdfont',
      lines: ['health', 'identity'],
      disabledSegments: ['cost', 'duration'],
      mutedRules: ['cost-velocity'],
    });

    expect(config.theme).toBe('tower-light');
    expect(config.glyphs).toBe('nerdfont');
    expect(config.lines).toEqual(['health', 'identity']);
    expect(config.disabledSegments).toEqual(['cost', 'duration']);
    expect(config.mutedRules).toEqual(['cost-velocity']);
  });

  it('rejects an unrecognised glyph tier', () => {
    expect(parseConfig({ glyphs: 'emoji' }).glyphs).toBe(DEFAULT_CONFIG.glyphs);
  });

  it('drops unknown line names but keeps valid ones', () => {
    expect(parseConfig({ lines: ['health', 'nonsense'] }).lines).toEqual(['health']);
  });

  // An empty line list would render nothing at all, which reads as a broken
  // install rather than as a configuration choice.
  it('falls back to the default lines when none survive', () => {
    expect(parseConfig({ lines: ['nonsense'] }).lines).toEqual(DEFAULT_CONFIG.lines);
    expect(parseConfig({ lines: [] }).lines).toEqual(DEFAULT_CONFIG.lines);
  });

  it('filters non-strings out of string arrays', () => {
    expect(parseConfig({ disabledSegments: ['cost', 42, null] }).disabledSegments).toEqual(['cost']);
  });

  it('merges partial thresholds over the defaults', () => {
    const config = parseConfig({ thresholds: { context: { warnPercentage: 60 } } });

    expect(config.thresholds.context.warnPercentage).toBe(60);
    expect(config.thresholds.context.criticalPercentage).toBe(
      DEFAULT_THRESHOLDS.context.criticalPercentage,
    );
    expect(config.thresholds.quota).toEqual(DEFAULT_THRESHOLDS.quota);
  });

  it('rejects negative and non-numeric thresholds', () => {
    const config = parseConfig({
      thresholds: { context: { warnPercentage: -5, criticalPercentage: 'high' } },
    });

    expect(config.thresholds.context.warnPercentage).toBe(
      DEFAULT_THRESHOLDS.context.warnPercentage,
    );
    expect(config.thresholds.context.criticalPercentage).toBe(
      DEFAULT_THRESHOLDS.context.criticalPercentage,
    );
  });

  it('ignores unknown keys', () => {
    expect(parseConfig({ futureFeature: true }).theme).toBe(DEFAULT_CONFIG.theme);
  });
});

describe('configSearchPaths', () => {
  it('prefers project-local config over the home directory', () => {
    const paths = configSearchPaths('/work/project', '/home/dev');

    expect(paths[0]).toContain('project');
    expect(paths.at(-1)).toContain('dev');
  });

  it('offers both a bare and a .claude-scoped location at each level', () => {
    expect(configSearchPaths('/work/project', '/home/dev')).toHaveLength(4);
  });
});
