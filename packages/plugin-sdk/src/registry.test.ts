import { makeSnapshot } from '@cct/core';
import { PLAIN_CAPABILITIES, Styler, TOWER_DARK } from '@cct/render';
import { describe, expect, it } from 'vitest';
import { definePlugin, type Plugin, type SegmentContext } from './contract.js';
import { findDuplicateSegmentIds, PluginRegistry } from './registry.js';

const context: SegmentContext = {
  snapshot: makeSnapshot(),
  health: { findings: [], overall: 'ok' },
  theme: TOWER_DARK,
  styler: new Styler(PLAIN_CAPABILITIES),
  capabilities: PLAIN_CAPABILITIES,
  glyphs: 'ascii',
  icon: () => '*',
};

const working = definePlugin({
  id: 'working',
  description: 'Renders normally.',
  segments: [
    { id: 'alpha', line: 'identity', priority: 'high', render: () => 'alpha' },
    { id: 'beta', line: 'health', priority: 'normal', render: () => 'beta' },
    { id: 'silent', line: 'health', priority: 'low', render: () => null },
    { id: 'blank', line: 'health', priority: 'low', render: () => '' },
  ],
});

const broken = definePlugin({
  id: 'broken',
  description: 'Throws on render.',
  segments: [
    {
      id: 'explodes',
      line: 'identity',
      priority: 'critical',
      render: () => {
        throw new Error('boom');
      },
    },
  ],
});

describe('PluginRegistry', () => {
  it('groups rendered segments by line', () => {
    const { byLine } = new PluginRegistry([working]).render(context);

    expect(byLine.get('identity')?.map((s) => s.id)).toEqual(['alpha']);
    expect(byLine.get('health')?.map((s) => s.id)).toEqual(['beta']);
  });

  // `null` and `''` are how a segment says "not applicable", not how it fails.
  it('omits segments that render nothing, without recording a failure', () => {
    const { byLine, failures } = new PluginRegistry([working]).render(context);

    expect(byLine.get('health')?.map((s) => s.id)).not.toContain('silent');
    expect(byLine.get('health')?.map((s) => s.id)).not.toContain('blank');
    expect(failures).toEqual([]);
  });

  /**
   * The guarantee that makes it safe to accept third-party plugins: one broken
   * segment costs the user that segment, never the status line.
   */
  it('contains a throwing segment instead of failing the render', () => {
    const { byLine, failures } = new PluginRegistry([broken, working]).render(context);

    expect(failures.map((failure) => failure.segmentId)).toEqual(['explodes']);
    expect(byLine.get('identity')?.map((s) => s.id)).toEqual(['alpha']);
    expect(byLine.get('health')?.map((s) => s.id)).toEqual(['beta']);
  });

  it('records the error so cct doctor can report it', () => {
    const { failures } = new PluginRegistry([broken]).render(context);

    expect(failures[0]?.error).toBeInstanceOf(Error);
  });

  it('honours disabled segments and plugins', () => {
    const disabledSegment = new PluginRegistry([working], { disabledSegments: ['alpha'] });
    expect(disabledSegment.segments().map((s) => s.id)).not.toContain('alpha');

    const disabledPlugin = new PluginRegistry([working, broken], { disabledPlugins: ['broken'] });
    expect(disabledPlugin.render(context).failures).toEqual([]);
  });

  it('collects rules from enabled plugins only', () => {
    const withRule: Plugin = {
      id: 'ruled',
      description: 'Contributes a rule.',
      rules: [{ id: 'custom', description: 'A rule.', evaluate: () => null }],
    };

    expect(new PluginRegistry([withRule]).rules().map((r) => r.id)).toEqual(['custom']);
    expect(new PluginRegistry([withRule], { disabledPlugins: ['ruled'] }).rules()).toEqual([]);
  });

  it('preserves plugin declaration order', () => {
    const second = definePlugin({
      id: 'second',
      description: 'Later.',
      segments: [{ id: 'gamma', line: 'identity', priority: 'low', render: () => 'gamma' }],
    });

    const { byLine } = new PluginRegistry([working, second]).render(context);
    expect(byLine.get('identity')?.map((s) => s.id)).toEqual(['alpha', 'gamma']);
  });
});

describe('findDuplicateSegmentIds', () => {
  // Ids are how users disable and reorder segments, so a collision makes their
  // configuration silently ambiguous.
  it('reports ids claimed by more than one plugin', () => {
    const clashing = definePlugin({
      id: 'clashing',
      description: 'Reuses an id.',
      segments: [{ id: 'alpha', line: 'infra', priority: 'low', render: () => 'other' }],
    });

    expect(findDuplicateSegmentIds([working, clashing])).toEqual(['alpha']);
  });

  it('reports nothing when ids are unique', () => {
    expect(findDuplicateSegmentIds([working, broken])).toEqual([]);
  });
});
