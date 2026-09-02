# Hero Loop Acceptance Contract

The gate does not add a second state authority. Future production services can expose a test-only acceptance facade that reads and drives the existing authorities.

## Facade discovery

Expose one object at one of these locations:

```javascript
window.__ROBO_BRIDGE_SUBMISSION__
window.__ROBO_BRIDGE_SUBMISSION_ACCEPTANCE__
window.__ROBO_BRIDGE__.submissionAcceptance
window.__ROBO_BRIDGE__.runtime.services.submissionAcceptance
```

The facade must not own mission, train, construction, plan, robot, or world state.

## Supported API forms

Named methods are preferred:

```javascript
{
  runConstructionAcceptance(input),
  runSourceReassignmentAcceptance(input),
  runTrainFailureAcceptance(input),
  runTrainSuccessAcceptance(input),
  runMissionAcceptance(input),
  runTerrainAcceptance(input),
  runIntegratedResetAcceptance(input),
  runFlagshipJourney(input),
  runAdversarialScenario(input),
  reset(input)
}
```

A generic facade is also accepted:

```javascript
{
  runCase(name, input),
  runHero(input),
  reset(input)
}
```

The generic case names are:

```text
construction_acceptance
source_reassignment
train_failure
train_success
mission_state_machine
terrain_easy
reset_leak
adversarial:<scenario>
reset
```

## Flagship request

```text
Build a valid bridge across the terrain and successfully get the train to the other side.
```

The gate judges the final authority state. It does not require one fixed intermediate tool sequence.

Required flagship evidence:

```javascript
{
  phase: 'COMPLETE',
  trainOutcome: 'CROSSED',
  missionId,
  frozenPlanId,
  frozenChecksum,
  testedPlanId,
  testedChecksum,
  supportSource: 'AUTHORITATIVE_BUILD_BOARD_SNAPSHOT',
  robotIdle: true,
  gripperEmpty: true,
  incorrectPlacements: 0,
  requiredStructureComplete: true,
  placementsRequired,
  humanPlacements,
  codexPlacements,
  failureTestResult,
  worldRevision
}
```

`testedPlanId` must equal `frozenPlanId`. `testedChecksum` must equal `frozenChecksum`.

## Required future evidence

Construction evidence must include the frozen identity, required placement IDs, BuildBoard target IDs, accepted human and Codex placements, contribution counts, source reassignment, authoritative revisions, and cancellation.

Train failure evidence must prove `TRAIN_FELL`, identify the first unsupported segment, use the authoritative BuildBoard snapshot, avoid a hard-coded failure position, and reset cleanly.

Train success evidence must prove `CROSSED`, exit arrival, complete route support, and no direct completion flag.

Mission evidence must prove the required phase history, first failure, final crossing, `COMPLETE` only after `CROSSED`, and reset to a new mission ID.

## Adversarial cases

The generic adversarial result is:

```javascript
{
  rejected: true,
  authorityPreserved: true,
  expectedReasonMatched: true
}
```

Cases:

```text
duplicate_mutation
robot_busy
gripper_occupied
test_before_build
test_without_frozen_plan
build_request_during_test
reset_during_active_operation
repeated_reset
source_disappears_during_execution
```
