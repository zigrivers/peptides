export type AuditCategory =
  | 'Auth'
  | 'Admin'
  | 'Protocol'
  | 'Order'
  | 'Reconstitution'
  | 'Security'
  | 'Notification';

// Recursive JSON-serializable type — excludes functions, symbols, and undefined.
// Callers must use this type for metadata/oldValues/newValues to prevent non-serializable
// values from reaching Prisma's JSON field writer.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type AuditAction =
  // Auth
  | 'USER_REGISTERED'
  | 'USER_LOGGED_IN'
  | 'USER_LOGGED_OUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'OTHER_SESSIONS_INVALIDATED'
  | 'EMAIL_CHANGE_REQUESTED'
  | 'EMAIL_CHANGE_VERIFIED'
  | 'EMAIL_CHANGE_APPLIED'
  | 'EMAIL_CHANGE_REVERTED'
  | 'EMAIL_CHANGE_CANCELLED'
  | 'ACCOUNT_DELETION_SCHEDULED'
  | 'ACCOUNT_DELETION_CANCELLED'
  | 'ACCOUNT_DELETED'
  // Auth — Onboarding
  | 'ONBOARDING_STEP_ADVANCED'
  | 'ONBOARDING_DISMISSED'
  | 'PERSONALIZATION_UPDATED'
  // Admin
  | 'USER_INVITED'
  | 'INVITE_RESENT'
  | 'INVITE_ACCEPTED'
  | 'MANAGED_USER_DEACTIVATED'
  | 'MANAGED_USER_DELETION_REQUESTED'
  | 'MANAGED_USER_DELETION_CANCELLED'
  | 'MANAGED_USER_DELETED'
  | 'MANAGED_USER_PASSWORD_RESET_TRIGGERED'
  | 'DATA_EXPORT_REQUESTED'
  | 'DATA_EXPORT_DELIVERED'
  | 'DATA_EXPORT_FAILED'
  // Protocol
  | 'PROTOCOL_CREATED'
  | 'PROTOCOL_UPDATED'
  | 'PROTOCOL_PAUSED'
  | 'PROTOCOL_RESUMED'
  | 'PROTOCOL_CLONED'
  | 'PROTOCOL_DEACTIVATED'
  | 'OBSERVED_BENEFIT_TOGGLED'
  | 'DOSE_LOGGED'
  | 'DOSE_SKIPPED'
  | 'DOSE_RESCHEDULED'
  | 'DOSE_LOG_REVERTED'
  | 'CYCLE_CREATED'
  | 'CYCLE_UPDATED'
  | 'CYCLE_RESTARTED'
  | 'OUTCOME_LOGGED'
  | 'OUTCOME_UPDATED'
  | 'PROTOCOL_RATED'
  // Order
  | 'VENDOR_CREATED'
  | 'VENDOR_UPDATED'
  | 'VENDOR_DISABLED'
  | 'VENDOR_PRODUCT_ADDED'
  | 'VENDOR_PRODUCT_UPDATED'
  | 'VENDOR_PRODUCT_ARCHIVED'
  | 'ORDER_DRAFTED'
  | 'ORDER_SEND_ATTEMPTED'
  | 'ORDER_SENT'
  | 'ORDER_MANUAL_FALLBACK_PROVIDED'  // written when no Telegram session; order stays DRAFT
  | 'ORDER_CONFIRMED'
  | 'PAYMENT_ACKNOWLEDGED'
  | 'ORDER_PAYMENT_SENT'
  | 'ORDER_RECEIVED'
  | 'ORDER_CANCELLED'
  | 'ORDER_MARKED_STALE'
  | 'DUPLICATE_SEND_BLOCKED'  // written when a 60s duplicate guard fires
  // Reconstitution
  | 'VIAL_RECONSTITUTED'
  | 'VIAL_EXPIRED'
  | 'VIALS_REORDERED'
  | 'SAFETY_WARNING_TRIGGERED'
  | 'SYRINGE_PREFERENCES_UPDATED'
  | 'DRY_VIALS_ADDED'
  | 'VIAL_DELETED'
  | 'VIAL_QUANTITY_UPDATED'
  // Security
  | 'TELEGRAM_SESSION_LINK_INITIATED'
  | 'TELEGRAM_SESSION_LINKED'
  | 'TELEGRAM_SESSION_REVOKED'
  | 'AUDIT_WRITE_FAILURE'
  | 'AI_REQUEST_INITIATED'
  | 'AI_REQUEST_FAILED'
  // Notification
  | 'REMINDER_PREFERENCE_UPDATED'
  | 'PUSH_PERMISSION_STATE_CHANGED'
  | 'PUSH_SUBSCRIPTION_REGISTERED'
  | 'PUSH_SUBSCRIPTION_REMOVED'
  | 'PUSH_SUBSCRIPTION_PRUNED'
  | 'TEST_PUSH_SENT'
  | 'REMINDER_DISPATCHED';

export interface CreateAuditEventInput {
  actorUserId: string;
  subjectUserId?: string;
  category: AuditCategory;
  action: AuditAction;
  resourceId: string;
  resourceType: string;
  metadata?: JsonValue;
  oldValues?: JsonValue;
  newValues?: JsonValue;
}
