import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';

export const NO_SHOW_GRACE_MINUTES = 10;

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [
    AppointmentStatus.ACCEPTED,
    AppointmentStatus.REJECTED,
    AppointmentStatus.RESCHEDULE_PROPOSED,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.RESCHEDULE_PROPOSED]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.ACCEPTED]: [
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.CONFIRMED]: [
    AppointmentStatus.WAITING,
    AppointmentStatus.CANCELLED,
  ],
  [AppointmentStatus.WAITING]: [
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.NO_SHOW,
  ],
  [AppointmentStatus.IN_PROGRESS]: [AppointmentStatus.COMPLETED],
  [AppointmentStatus.REJECTED]: [],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

export type TransitionContext = {
  now?: Date;
  slotStart?: Date;
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
  ctx: TransitionContext = {},
): void {
  if (!canTransition(from, to)) {
    throw new BadRequestException(`Invalid transition: ${from} -> ${to}`);
  }

  if (to === AppointmentStatus.NO_SHOW) {
    const now = ctx.now ?? new Date();
    if (!ctx.slotStart) {
      throw new BadRequestException(
        'slotStart is required to transition to NO_SHOW',
      );
    }

    const graceMs = NO_SHOW_GRACE_MINUTES * 60_000;
    if (now.getTime() < ctx.slotStart.getTime() + graceMs) {
      throw new BadRequestException(
        `Invalid transition: ${from} -> ${to} (NO_SHOW requires ${NO_SHOW_GRACE_MINUTES} minutes after slotStart)`,
      );
    }
  }
}

export function getValidTransitions(
  from: AppointmentStatus,
): AppointmentStatus[] {
  return [...VALID_TRANSITIONS[from]];
}
