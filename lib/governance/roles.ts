export type Role = 'data_entry' | 'data_steward' | 'admin' | 'auditor';

export const PERMISSIONS: Record<Role, string[]> = {
  data_entry: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read'],
  data_steward: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read', 'review:decide', 'matching:run'],
  admin: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read', 'review:decide', 'matching:run', 'config:write', 'dictionary:write', 'mappings:reverse', 'audit:read'],
  auditor: ['records:read', 'dashboard:read', 'mappings:read', 'audit:read'],
};

export const ROLE_LABEL: Record<Role, string> = {
  data_entry: 'Data Entry',
  data_steward: 'Data Steward',
  admin: 'MDM Admin',
  auditor: 'Auditor',
};

export function can(role: string | undefined, permission: string): boolean {
  return !!role && (PERMISSIONS[role as Role] ?? []).includes(permission);
}
