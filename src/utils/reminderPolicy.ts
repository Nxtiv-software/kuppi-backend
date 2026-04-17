export type ReminderSkipReason =
  | 'cooldown_active'
  | 'max_sends_reached'
  | 'cooldown_and_max_sends'
  | 'no_eligible_recipients'
  | 'no_audience_users'
  | 'quiet_hours'
  | 'locked';

export interface RecipientDeliveryStats {
  totalSent: number;
  lastSentAt: Date | null;
}

export const isSafeActionUrl = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return true;

  if (raw.startsWith('/')) {
    return true;
  }

  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const evaluateRecipientEligibility = ({
  stats,
  now,
  cooldownMinutes,
  maxSendsPerUser
}: {
  stats?: RecipientDeliveryStats;
  now: Date;
  cooldownMinutes: number;
  maxSendsPerUser: number;
}) => {
  const totalSent = Number(stats?.totalSent || 0);
  const lastSentAt = stats?.lastSentAt ? new Date(stats.lastSentAt) : null;

  const reachedMaxSends = maxSendsPerUser > 0 && totalSent >= maxSendsPerUser;
  const cooldownCutoff = cooldownMinutes > 0 ? new Date(now.getTime() - cooldownMinutes * 60 * 1000) : null;
  const reachedCooldown = Boolean(cooldownCutoff && lastSentAt && lastSentAt >= cooldownCutoff);

  if (reachedMaxSends && reachedCooldown) {
    return { eligible: false, reason: 'cooldown_and_max_sends' as const };
  }

  if (reachedMaxSends) {
    return { eligible: false, reason: 'max_sends_reached' as const };
  }

  if (reachedCooldown) {
    return { eligible: false, reason: 'cooldown_active' as const };
  }

  return { eligible: true, reason: null };
};

export const summarizeSkipBreakdown = (reasonCounts: Record<string, number>) => {
  const cooldownOnly = Number(reasonCounts.cooldown_active || 0);
  const maxSendsOnly = Number(reasonCounts.max_sends_reached || 0);
  const both = Number(reasonCounts.cooldown_and_max_sends || 0);

  return {
    cooldownOnly,
    maxSendsOnly,
    both,
    total: cooldownOnly + maxSendsOnly + both
  };
};
