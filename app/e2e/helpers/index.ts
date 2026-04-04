/**
 * Helpers – barrel export
 */
export {
  generateRandomTask,
  generateEditedTask,
  randomTaskName,
  randomTaskLink,
  randomProductType,
  randomSquads,
  randomStatus,
  randomReturns,
  randomNotes,
  PRODUCT_TYPES,
  SQUADS_BY_TYPE,
  STATUSES,
} from './test-data';
export type { RandomTaskData, ProductType } from './test-data';

export { createTaskViaAPI, deleteTaskViaAPI } from './api-helpers';
export type { CreatedTask } from './api-helpers';
