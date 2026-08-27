import "server-only";
import { logActivity, listActivity } from "@/server/activity";
import type { ActivityLogPort, ListActivityFilter, LogActivityInput } from "@/built-ins/runtime/_types";

export const activityLogAdapter: ActivityLogPort = {
  logActivity(input: LogActivityInput) {
    return logActivity({
      idempotencyKey: input.idempotencyKey,
      agencyId: input.agencyId,
      clientId: input.clientId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      category: input.category,
      action: input.action,
      message: input.message,
      metadata: input.metadata,
    });
  },
  listActivity(filter: ListActivityFilter) {
    return listActivity(filter);
  },
};
