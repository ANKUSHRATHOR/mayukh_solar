import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, Search, Users } from 'lucide-react';

interface StaffContact {
  user_id: string;
  full_name: string;
  mobile: string;
  role: string;
}

const roleLabel = (r: string) => r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const roleColor: Record<string, string> = {
  admin: 'bg-primary/15 text-primary border-primary/30',
  telecaller: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  sales_person: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  operator: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  welder: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  electrician: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
};

const StaffContacts = () => {
  const [contacts, setContacts] = useState<StaffContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_staff_directory' as any);
      if (!error && data) setContacts(data as StaffContact[]);
      setLoading(false);
    })();
  }, []);

  const roles = useMemo(() => Array.from(new Set(contacts.map(c => c.role))), [contacts]);

  const filtered = contacts.filter(c => {
    const matchSearch = !search ||
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search);
    const matchRole = roleFilter === 'all' || c.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Staff Contacts
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Directory of all active team members. Tap the phone icon to call.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={roleFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setRoleFilter('all')}
            className={roleFilter === 'all' ? 'gradient-primary text-primary-foreground' : ''}
          >
            All ({contacts.length})
          </Button>
          {roles.map(r => (
            <Button
              key={r}
              size="sm"
              variant={roleFilter === r ? 'default' : 'outline'}
              onClick={() => setRoleFilter(r)}
              className={roleFilter === r ? 'gradient-primary text-primary-foreground' : ''}
            >
              {roleLabel(r)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {loading ? 'Loading…' : `${filtered.length} contact${filtered.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading staff…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No staff found.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(c => (
                <div key={c.user_id} className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                    {c.full_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.mobile}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${roleColor[c.role] || ''}`}>
                    {roleLabel(c.role)}
                  </Badge>
                  <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
                    <a href={`tel:${c.mobile}`} aria-label={`Call ${c.full_name}`}>
                      <Phone className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Call</span>
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StaffContacts;
