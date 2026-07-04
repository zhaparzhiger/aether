"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teamApi, Member, Role, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasRole, ROLE_LABELS } from "@/lib/roles";

const INVITABLE_ROLES: Role[] = ["admin", "manager", "member"];

export default function TeamPage() {
  const { currentOrg } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);

  const orgId = currentOrg!.organizationId;
  const canManage = hasRole(currentOrg?.role, "admin");
  const isOwner = currentOrg?.role === "owner";

  async function load() {
    setLoading(true);
    try {
      const { members } = await teamApi.list(orgId);
      setMembers(members);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить команду");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await teamApi.invite(orgId, { email: inviteEmail, role: inviteRole });
      toast.success("Приглашение отправлено");
      setDialogOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось отправить приглашение");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: Role) {
    try {
      await teamApi.updateRole(orgId, memberId, role);
      toast.success("Роль обновлена");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось изменить роль");
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await teamApi.remove(orgId, memberId);
      toast.success("Сотрудник удалён");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось удалить сотрудника");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Команда</h1>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button>Пригласить сотрудника</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Пригласить сотрудника</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Роль</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)} items={ROLE_LABELS}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITABLE_ROLES.filter((r) => r !== "admin" || isOwner).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? "Отправляем..." : "Отправить приглашение"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сотрудник</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              {canManage && <TableHead className="text-right">Действия</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{m.userName ?? m.invitedEmail}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.userEmail ?? m.invitedEmail}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {canManage && m.role !== "owner" && !(m.role === "admin" && !isOwner) ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleRoleChange(m.id, v as Role)}
                      items={ROLE_LABELS}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVITABLE_ROLES.filter((r) => r !== "admin" || isOwner).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={m.status === "active" ? "default" : "outline"}>
                    {m.status === "active" ? "Активен" : "Приглашён"}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {m.role !== "owner" && !(m.role === "admin" && !isOwner) && (
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(m.id)}>
                        Удалить
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
