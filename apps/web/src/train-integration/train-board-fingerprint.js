// A derived immutability fingerprint, never a board or inventory authority.
// BuildBoard targets are private and geometry changes use its existing event
// ledger. A reset can empty that ledger, so an empty cursor is never cached.
// Robot TCP samples do not change that ledger. Cache only that
// immutable portion; serialize live source records afresh on every read.
export function createTrainBoardFingerprint({ board, controller }) {
  let boardToken = null, boardJson = null;
  return () => {
    const cursor = board.eventCursor;
    const token = JSON.stringify([board.blueprintId, cursor.count, cursor.latestWorldRevision]);
    if (!cursor.count || token !== boardToken) {
      boardJson = JSON.stringify({ blueprintId: board.blueprintId, targets: board.getTargets(), placements: board.getPlacements() });
      boardToken = token;
    }
    // JSON serialization reads (but never mutates) the controller's own records.
    // Avoid cloning custom-part metadata just to serialize it immediately.
    return `${boardJson}\n${JSON.stringify(controller.bricks)}`;
  };
}
