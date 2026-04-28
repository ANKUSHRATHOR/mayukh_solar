import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Search, Trash2, RotateCcw, MapPin, AlertTriangle } from 'lucide-react';

const reasonLabel = (r: string | null) => r ? r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A';

const CancelledLeadsBin = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('is_in_bin', true)
      .order('updated_at', { ascending: false });
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const restoreLead = async (id: string) => {
    const lead = leads.find(l => l.id === id);
    if (lead?.status === 'final') {
      toast({ title: 'Lead locked', description: 'Finalized leads cannot be restored or edited.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('leads').update({
      is_in_bin: false, status: 'new' as any, cancelled_reason: null, cancelled_reason_other: null
    }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Lead restored', description: 'Lead has been moved back to active leads.' });
      fetchLeads();
    }
  };

  const permanentDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.status === 'final') {
      toast({ title: 'Lead locked', description: 'Finalized leads cannot be deleted.', variant: 'destructive' });
      setDeleteTarget(null);
      return;
    }

    const { error } = await supabase.from('leads').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted permanently', description: 'Lead has been removed.' });
      fetchLeads();
    }
    setDeleteTarget(null);
  };

  const filtered = leads.filter(l =>
    !search ||
    l.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    l.mobile.includes(search)
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trash2 className="h-6 w-6 text-destructive" /> Cancelled Leads Bin
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{leads.length} cancelled leads</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search name or mobile..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card className="shadow-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm py-12 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-12 text-center">No cancelled leads found.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(lead => (
                <div key={lead.id} className="flex items-center gap-4 p-4">
                  <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold text-sm shrink-0">
                    {lead.customer_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{lead.customer_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.mobile} • <MapPin className="h-3 w-3 inline" /> {lead.village_city}, {lead.district}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reason: <span className="font-medium text-destructive">{reasonLabel(lead.cancelled_reason)}</span>
                      {lead.cancelled_reason_other && ` — ${lead.cancelled_reason_other}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {lead.status === 'final' ? <Badge variant="outline">Locked</Badge> : null}
                    <Button variant="outline" size="sm" onClick={() => restoreLead(lead.id)} title="Restore lead" disabled={lead.status === 'final'}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Restore
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(lead)} title="Delete permanently" disabled={lead.status === 'final'}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanent Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.customer_name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={permanentDelete}>Delete Forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CancelledLeadsBin;
