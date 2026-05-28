import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, Package, Upload, X } from 'lucide-react';
import { format } from 'date-fns';

interface Item { name: string; qty: number; unit: string; }

interface Dispatch {
  id: string;
  project_id: string;
  items: Item[];
  image_url: string | null;
  notes: string | null;
  dispatched_by: string;
  dispatched_at: string;
}

const QUICK_ITEMS = ['Panels', 'Inverter', 'Structure', 'Wire', 'Earthing kit', 'DC Box', 'AC Box', 'Accessories'];

export default function MaterialDispatch() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const canEdit = role === 'admin' || role === 'operator';

  const [project, setProject] = useState<any>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<Item[]>([]);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState<string>('');
  const [newUnit, setNewUnit] = useState('nos');
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('projects').select('id, project_code, consumer_name, capacity_kw').eq('id', projectId).maybeSingle(),
        (supabase as any).from('material_dispatches').select('*').eq('project_id', projectId).order('dispatched_at', { ascending: false }),
      ]);
      setProject(p);
      setDispatches((d as Dispatch[]) || []);
      setLoading(false);
    })();
  }, [projectId]);

  const addItem = (name?: string) => {
    const n = (name || newName).trim();
    const q = parseFloat(newQty);
    if (!n || !q || q <= 0) { toast({ title: 'Enter item name and quantity', variant: 'destructive' }); return; }
    setItems([...items, { name: n, qty: q, unit: newUnit }]);
    setNewName(''); setNewQty('');
  };

  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const handleFile = (f: File | null) => {
    setImageFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = e => setImagePreview(e.target?.result as string);
      r.readAsDataURL(f);
    } else setImagePreview(null);
  };

  const reset = () => {
    setItems([]); setNotes(''); setImageFile(null); setImagePreview(null);
    setNewName(''); setNewQty(''); setNewUnit('nos');
  };

  const save = async () => {
    if (!projectId || !user) return;
    if (items.length === 0) { toast({ title: 'Add at least one item', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      let image_url: string | null = null;
      if (imageFile) {
        const path = `${projectId}/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('material-dispatch').upload(path, imageFile);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('material-dispatch').createSignedUrl
          ? await supabase.storage.from('material-dispatch').createSignedUrl(path, 60 * 60 * 24 * 365)
          : { data: null } as any;
        image_url = (pub as any)?.signedUrl || path;
      }
      const { error } = await (supabase as any).from('material_dispatches').insert({
        project_id: projectId,
        items,
        image_url,
        notes: notes.trim() || null,
        dispatched_by: user.id,
      });
      if (error) throw error;
      toast({ title: 'Dispatch recorded' });
      reset();
      const { data: d } = await (supabase as any).from('material_dispatches').select('*').eq('project_id', projectId).order('dispatched_at', { ascending: false });
      setDispatches((d as Dispatch[]) || []);
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this dispatch record?')) return;
    const { error } = await (supabase as any).from('material_dispatches').delete().eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setDispatches(dispatches.filter(d => d.id !== id));
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5" /> Material Dispatch
          </CardTitle>
          <p className="text-sm text-muted-foreground">{project.project_code} · {project.consumer_name} · {project.capacity_kw} kW</p>
        </CardHeader>
      </Card>

      {canEdit && (
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-lg">New Dispatch</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Quick add</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {QUICK_ITEMS.map(q => (
                  <Badge key={q} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => setNewName(q)}>{q}</Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2">
              <Input className="col-span-6" placeholder="Item name" value={newName} onChange={e => setNewName(e.target.value)} />
              <Input className="col-span-3" type="number" inputMode="decimal" placeholder="Qty" value={newQty} onChange={e => setNewQty(e.target.value)} />
              <select className="col-span-2 rounded-md border border-input bg-background px-2 text-sm" value={newUnit} onChange={e => setNewUnit(e.target.value)}>
                <option value="nos">nos</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="set">set</option>
              </select>
              <Button className="col-span-1 px-0" type="button" onClick={() => addItem()}><Plus className="h-4 w-4" /></Button>
            </div>

            {items.length > 0 && (
              <div className="space-y-1">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{it.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{it.qty} {it.unit}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeItem(i)}><X className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label className="text-xs">Photo (optional)</Label>
              <Input type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0] || null)} />
              {imagePreview && <img src={imagePreview} alt="preview" className="mt-2 max-h-40 rounded-md border" />}
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Vehicle, driver, expected arrival..." />
            </div>

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Record Dispatch'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-lg">History</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {dispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispatches yet.</p>
          ) : dispatches.map(d => (
            <div key={d.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{format(new Date(d.dispatched_at), 'dd MMM yyyy, HH:mm')}</p>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => remove(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
              <div className="flex flex-wrap gap-1">
                {(d.items || []).map((it, i) => (
                  <Badge key={i} variant="secondary">{it.name} · {it.qty} {it.unit}</Badge>
                ))}
              </div>
              {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
              {d.image_url && (
                <a href={d.image_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View photo</a>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
