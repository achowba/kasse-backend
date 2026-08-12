/**
 * Heap ceiling above which the process is considered unready.
 *
 * @remarks
 * Readiness rather than liveness: a process near its heap limit should stop
 * receiving new traffic, but restarting it loses whatever it is working on and
 * usually returns to the same place.
 */
export const HEAP_LIMIT_BYTES = 512 * 1024 * 1024;

/**
 * How long the database ping may take before readiness fails.
 *
 * @remarks
 * Bounded so an unreachable database fails readiness quickly rather than holding
 * the probe open until the orchestrator times it out, which reads as a hang
 * instead of a dependency problem.
 */
export const DATABASE_PING_TIMEOUT_MS = 1_500;
