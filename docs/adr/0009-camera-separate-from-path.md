# 9. The camera is a module separate from the flight path

- Status: Accepted
- Date: 2026-10-03

## Context

The flight path gives the aircraft's position and attitude ([ADR 0008](0008-precomputed-flight-path.md)).
More than one way of viewing the same flight may be wanted later.

## Decision

The camera is a separate module that reads the aircraft's state from the path. The first camera
is a first-person view from the aircraft. Its details are not decided yet. Other views may be
added later but are on hold.

## Consequences

The path playback must not assume a particular camera.
