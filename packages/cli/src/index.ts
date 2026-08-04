/**
 * `claude-control-tower` — the published package.
 *
 * The CLI is the product; this entry point exists so that the render pipeline can
 * be embedded (an editor extension, a web dashboard) without shelling out. Both
 * surfaces run exactly the same code.
 */

export { runCli, VERSION, type CliDeps } from './cli.js';
export { renderTower, type RenderTowerOptions, type TowerRender } from './tower.js';
export {
  DEFAULT_CONFIG,
  loadConfig,
  parseConfig,
  configSearchPaths,
  type LoadedConfig,
  type TowerConfig,
} from './config/config.js';
export { demoInput, demoStatusInput, DEMO_SCENARIOS, type DemoScenario } from './demo.js';
