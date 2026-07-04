import { Role } from "./api";

const ROLE_RANK: Record<Role, number> = { member: 0, manager: 1, admin: 2, owner: 3 };

export function hasRole(role: Role | undefined | null, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  member: "Участник",
};
