// Route geometry lives in @rails/shared so the game rules (disasters) and the board agree on where
// every train piece sits. Re-exported here for the board and editor.
export {
  arcMiddle,
  arcPoints,
  autoSlotTransforms,
  chordNormal,
  clampBend,
  DEFAULT_SLOT_OPTIONS,
  laneOffset,
  MAX_BEND_RATIO,
  offsetPolyline,
  polylineLength,
  routePolyline,
  slotOptionsFor,
  slotTransforms,
  TRAIN_LENGTH_RATIO,
  TRAIN_WIDTH_RATIO,
  type SlotOptions,
  type SlotTransform,
} from '@rails/shared';
