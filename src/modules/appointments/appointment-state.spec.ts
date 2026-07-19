import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import {
  assertTransition,
  canTransition,
  getValidTransitions,
  NO_SHOW_GRACE_MINUTES,
} from './appointment-state';

describe('appointment-state', () => {
  const validPairs: Array<[AppointmentStatus, AppointmentStatus]> = [
    [AppointmentStatus.PENDING, AppointmentStatus.ACCEPTED],
    [AppointmentStatus.PENDING, AppointmentStatus.REJECTED],
    [AppointmentStatus.PENDING, AppointmentStatus.RESCHEDULE_PROPOSED],
    [AppointmentStatus.PENDING, AppointmentStatus.CANCELLED],
    [AppointmentStatus.RESCHEDULE_PROPOSED, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.RESCHEDULE_PROPOSED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.ACCEPTED, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.ACCEPTED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.CONFIRMED, AppointmentStatus.WAITING],
    [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.WAITING, AppointmentStatus.IN_PROGRESS],
    [AppointmentStatus.WAITING, AppointmentStatus.NO_SHOW],
    [AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED],
  ];

  it.each(validPairs)(
    'allows valid transition %s -> %s',
    (from, to) => {
      const slotStart = new Date('2026-07-19T09:00:00.000Z');
      const now = new Date(
        slotStart.getTime() + (NO_SHOW_GRACE_MINUTES + 1) * 60_000,
      );

      expect(() =>
        assertTransition(from, to, { now, slotStart }),
      ).not.toThrow();
      expect(canTransition(from, to)).toBe(true);
    },
  );

  const invalidPairs: Array<[AppointmentStatus, AppointmentStatus]> = [
    [AppointmentStatus.PENDING, AppointmentStatus.COMPLETED],
    [AppointmentStatus.PENDING, AppointmentStatus.WAITING],
    [AppointmentStatus.PENDING, AppointmentStatus.IN_PROGRESS],
    [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
    [AppointmentStatus.PENDING, AppointmentStatus.NO_SHOW],
    [AppointmentStatus.ACCEPTED, AppointmentStatus.PENDING],
    [AppointmentStatus.ACCEPTED, AppointmentStatus.REJECTED],
    [AppointmentStatus.ACCEPTED, AppointmentStatus.WAITING],
    [AppointmentStatus.REJECTED, AppointmentStatus.ACCEPTED],
    [AppointmentStatus.REJECTED, AppointmentStatus.PENDING],
    [AppointmentStatus.REJECTED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.COMPLETED, AppointmentStatus.WAITING],
    [AppointmentStatus.COMPLETED, AppointmentStatus.PENDING],
    [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
    [AppointmentStatus.CANCELLED, AppointmentStatus.PENDING],
    [AppointmentStatus.CANCELLED, AppointmentStatus.ACCEPTED],
    [AppointmentStatus.NO_SHOW, AppointmentStatus.WAITING],
    [AppointmentStatus.NO_SHOW, AppointmentStatus.COMPLETED],
    [AppointmentStatus.WAITING, AppointmentStatus.COMPLETED],
    [AppointmentStatus.WAITING, AppointmentStatus.CANCELLED],
    [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CANCELLED],
    [AppointmentStatus.IN_PROGRESS, AppointmentStatus.NO_SHOW],
    [AppointmentStatus.CONFIRMED, AppointmentStatus.ACCEPTED],
    [AppointmentStatus.CONFIRMED, AppointmentStatus.NO_SHOW],
    [AppointmentStatus.RESCHEDULE_PROPOSED, AppointmentStatus.ACCEPTED],
  ];

  it.each(invalidPairs)(
    'rejects invalid transition %s -> %s',
    (from, to) => {
      expect(() => assertTransition(from, to)).toThrow(BadRequestException);
      expect(() => assertTransition(from, to)).toThrow(
        `Invalid transition: ${from} -> ${to}`,
      );
      expect(canTransition(from, to)).toBe(false);
    },
  );

  it('rejects NO_SHOW before grace period elapses', () => {
    const slotStart = new Date('2026-07-19T09:00:00.000Z');
    const now = new Date(
      slotStart.getTime() + (NO_SHOW_GRACE_MINUTES - 1) * 60_000,
    );

    expect(() =>
      assertTransition(
        AppointmentStatus.WAITING,
        AppointmentStatus.NO_SHOW,
        { now, slotStart },
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      assertTransition(
        AppointmentStatus.WAITING,
        AppointmentStatus.NO_SHOW,
        { now, slotStart },
      ),
    ).toThrow(/NO_SHOW requires/);
  });

  it('allows NO_SHOW after grace period', () => {
    const slotStart = new Date('2026-07-19T09:00:00.000Z');
    const now = new Date(
      slotStart.getTime() + NO_SHOW_GRACE_MINUTES * 60_000,
    );

    expect(() =>
      assertTransition(
        AppointmentStatus.WAITING,
        AppointmentStatus.NO_SHOW,
        { now, slotStart },
      ),
    ).not.toThrow();
  });

  it('exposes the full valid transition table via getValidTransitions', () => {
    expect(getValidTransitions(AppointmentStatus.PENDING)).toEqual([
      AppointmentStatus.ACCEPTED,
      AppointmentStatus.REJECTED,
      AppointmentStatus.RESCHEDULE_PROPOSED,
      AppointmentStatus.CANCELLED,
    ]);
    expect(getValidTransitions(AppointmentStatus.COMPLETED)).toEqual([]);
    expect(getValidTransitions(AppointmentStatus.REJECTED)).toEqual([]);
    expect(getValidTransitions(AppointmentStatus.CANCELLED)).toEqual([]);
    expect(getValidTransitions(AppointmentStatus.NO_SHOW)).toEqual([]);
  });
});
