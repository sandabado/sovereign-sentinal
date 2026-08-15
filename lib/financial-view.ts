export type FinancialViewMode = "family" | "personal" | "business";

type FinancialRecord = {
  ownerId?: string;
  householdId?: string;
  entityId?: string;
  shared?: boolean;
};

export function visibleInFinancialView(
  record: FinancialRecord,
  context: {
    mode: FinancialViewMode;
    activeUserId: string | null;
    userId: string | null;
  },
) {
  if (!record.ownerId) return true;
  if (context.activeUserId) return record.ownerId === context.activeUserId;
  if (context.mode === "personal") return record.ownerId === context.userId;
  if (context.mode === "business") return Boolean(record.entityId);
  return true;
}
