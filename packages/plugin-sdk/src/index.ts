/**
 * `@cct/plugin-sdk` — the public extension contract for Claude Control Tower.
 *
 * Everything a plugin author needs is exported from here, and nothing exported
 * from here changes without a major version. Depend on this package rather than
 * reaching into `@cct/core` or `@cct/render` directly.
 *
 * @see ../../../docs/plugins.md for the authoring guide.
 */

export type { LineId, Plugin, Segment, SegmentContext } from './contract.js';
export { definePlugin, defineSegment, LINE_ORDER } from './contract.js';

export type { RegistryOptions, RenderResult, SegmentFailure } from './registry.js';
export { findDuplicateSegmentIds, PluginRegistry } from './registry.js';

// Re-exported so that a plugin needs exactly one dependency.
export type { Finding, HealthReport, HealthRule, SessionSnapshot, Severity } from '@cct/core';
export type { SegmentPriority, Theme } from '@cct/render';
