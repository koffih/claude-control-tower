import type { HealthThresholds } from '@cct/core';
import type { Plugin } from '@cct/plugin-sdk';
import { activityPlugin } from './activity-plugin.js';
import { createHealthPlugin, healthPlugin } from './health-plugin.js';
import { infraPlugin } from './infra-plugin.js';
import { sessionPlugin } from './session-plugin.js';

/**
 * `@cct/plugins-builtin` — the four plugins shipped with the tower.
 *
 * These are built against the same public `@cct/plugin-sdk` contract as any
 * third-party plugin, with no privileged access. That is deliberate: if the SDK
 * were not sufficient to build the default experience, it would not be sufficient
 * for anyone else either, and the gap would only be discovered by contributors.
 */

export { activityPlugin } from './activity-plugin.js';
export { createHealthPlugin, healthPlugin } from './health-plugin.js';
export { infraPlugin } from './infra-plugin.js';
export { sessionPlugin } from './session-plugin.js';

/**
 * The default plugin set, in line order.
 *
 * Order matters twice: it fixes the order segments appear within a line, and it
 * fixes which plugins a user sees first in `cct plugins`.
 */
export function builtinPlugins(thresholds?: HealthThresholds): readonly Plugin[] {
  return [
    sessionPlugin,
    thresholds === undefined ? healthPlugin : createHealthPlugin(thresholds),
    activityPlugin,
    infraPlugin,
  ];
}
