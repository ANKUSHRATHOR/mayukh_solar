import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import {
  ALL_ROLES,
  MODULES,
  MODULE_KEYS,
  defaultAllowed,
  roleLabel,
  type AppRole,
  type ModuleKey,
} from '@/lib/modules';

const key = (role: AppRole, module: ModuleKey) => `${role}:${module}`;

const buildDefaults = (): Record<string, boolean> => {
  const map: Record<string, boolean> = {};
  ALL_ROLES.forEach((role) =>
    MODULE_KEYS.forEach((m) => {
      map[key(role, m)] = defaultAllowed(role, m);
    })
  );
  return map;
};

const RoleAccessPanel = () => {
  const { toast } = useToast();
  const [access, setAccess] = useState<Record<string, boolean>>(buildDefaults);
  const [initial, setInitial] = useState<Record<string, boolean>>(buildDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const base = buildDefaults();
    try {
      const { data, error } = await (supabase as any)
        .from('role_permissions')
        .select('role, module, allowed');
      if (!error && data) {
        (data as { role: AppRole; module: ModuleKey; allowed: boolean }[]).forEach((r) => {
          if (MODULE_KEYS.includes(r.module)) base[key(r.role, r.module)] = r.allowed;
        });
      }
    } catch {
      // Table not present yet — fall back to defaults.
    }
    // Admin always has everything.
    MODULE_KEYS.forEach((m) => { base[key('admin', m)] = true; });
    setAccess({ ...base });
    setInitial({ ...base });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dirty = useMemo(
    () => Object.keys(access).some((k) => access[k] !== initial[k]),
    [access, initial]
  );

  const toggle = (role: AppRole, module: ModuleKey, value: boolean) => {
    if (role === 'admin') return; // locked
    setAccess((prev) => ({ ...prev, [key(role, module)]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = ALL_ROLES.flatMap((role) =>
        MODULE_KEYS.map((module) => ({
          role,
          module,
          allowed: role === 'admin' ? true : access[key(role, module)],
        }))
      );
      const { error } = await (supabase as any)
        .from('role_permissions')
        .upsert(rows, { onConflict: 'role,module' });
      if (error) throw error;
      toast({ title: 'Access saved', description: 'Role permissions updated. Users see changes on next load.' });
      setInitial({ ...access });
    } catch (err: any) {
      toast({
        title: 'Could not save access',
        description:
          (err?.message ? `${err.message}. ` : '') +
          'Make sure the role_permissions migration has been applied to Supabase.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setAccess({ ...initial });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Control which modules each role can access. Toggle a module on to reveal it in that role's
          sidebar and allow its pages. Admin always has full access.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
              {MODULES.map((m) => (
                <th key={m.key} className="px-3 py-3 text-center font-semibold text-muted-foreground">
                  <div className="flex flex-col items-center gap-1">
                    <m.icon className="h-4 w-4 text-primary" />
                    <span className="text-xs">{m.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role) => {
              const isAdmin = role === 'admin';
              return (
                <tr key={role} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{roleLabel(role)}</span>
                      {isAdmin && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <ShieldCheck className="h-3 w-3" /> Full
                        </Badge>
                      )}
                    </div>
                  </td>
                  {MODULES.map((m) => (
                    <td key={m.key} className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={isAdmin ? true : !!access[key(role, m.key)]}
                          disabled={isAdmin}
                          onCheckedChange={(v) => toggle(role, m.key, v)}
                          aria-label={`${roleLabel(role)} — ${m.label}`}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="border-border bg-muted/30">
        <CardContent className="grid gap-2 p-4 text-xs text-muted-foreground sm:grid-cols-2">
          {MODULES.map((m) => (
            <div key={m.key} className="flex items-start gap-2">
              <m.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span><strong className="text-foreground">{m.label}:</strong> {m.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={reset} disabled={!dirty || saving}>Reset</Button>
        <Button onClick={save} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save access
        </Button>
      </div>
    </div>
  );
};

export default RoleAccessPanel;
