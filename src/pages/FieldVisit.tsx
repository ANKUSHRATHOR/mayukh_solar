// Sales person field-visit reporting: live location + bike meter photo + notes + outcome.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Camera, MapPin, Navigation, Loader2, CheckCircle2 } from 'lucide-react';
import { compressImage } from '@/lib/capture';
import { format } from 'date-fns';

const outcomes: Array<{ value: string; label: string }> = [
  { value: 'interested', label: 'Consumer interested' },
  { value: 'unavailable', label: 'Consumer unavailable' },
  { value: 'docs_pending', label: 'Documents pending' },
  { value: 'site_issue', label: 'Site issue' },
  { value: 'payment_discussion', label: 'Payment discussion' },
  { value: 'bank_followup', label: 'Bank follow-up' },
  { value: 'other', label: 'Other' },
];

const FieldVisit = () => {
  const { staff, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [reading, setReading] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('interested');
  const [projectId, setProjectId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const isSales = role === 'sales_person';

  const { data: myProjects } = useQuery({
    queryKey: ['my-projects-for-visits', staff?.user_id],
    enabled: !!staff?.user_id && isSales,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, project_code, leads(customer_name)')
        .eq('assigned_sales_person_id', staff!.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ['my-field-visits', staff?.user_id],
    enabled: !!staff?.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('field_visits' as any)
        .select('*, projects(project_code, leads(customer_name))')
        .eq('staff_user_id', staff!.user_id)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  useEffect(() => {
    if (isSales) captureLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureLocation = () => {
    if (!navigator.geolocation) { toast({ title: 'Location not supported', variant: 'destructive' }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setLocating(false); },
      (e) => { toast({ title: 'Location failed', description: e.message, variant: 'destructive' }); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const compressed = await compressImage(f);
    setImageFile(compressed);
    setImagePreview(URL.createObjectURL(compressed));
  };

  const submit = async () => {
    if (!staff?.user_id) return;
    if (!coords) { toast({ title: 'Location required', variant: 'destructive' }); return; }
    if (!imageFile) { toast({ title: 'Bike meter photo required', variant: 'destructive' }); return; }
    if (!notes.trim()) { toast({ title: 'Notes required', variant: 'destructive' }); return; }

    setBusy(true);
    try {
      const path = `${staff.user_id}/field-visits/${Date.now()}-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from('attendance-media')
        .upload(path, imageFile, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.from('field_visits' as any).insert({
        staff_user_id: staff.user_id,
        project_id: projectId || null,
        latitude: coords.lat, longitude: coords.lng, accuracy_m: coords.acc,
        bike_meter_image_path: path,
        bike_meter_reading: reading ? Number(reading) : null,
        notes: notes.trim(),
        outcome,
      });
      if (error) throw error;

      toast({ title: 'Field visit saved' });
      setNotes(''); setReading(''); setImageFile(null); setImagePreview(null); setProjectId('');
      qc.invalidateQueries({ queryKey: ['my-field-visits', staff.user_id] });
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!isSales) {
    return <div className="p-8 text-center text-muted-foreground">Field visits are for sales persons only.</div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Field Visit</h1>
        <p className="text-sm text-muted-foreground mt-1">Capture a visit anywhere with live location and bike meter photo.</p>
      </div>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">New visit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Live Location <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={captureLocation} disabled={locating}>
                <MapPin className="h-4 w-4 mr-1" />{locating ? 'Getting…' : coords ? 'Refresh' : 'Get location'}
              </Button>
              {coords && (
                <span className="text-xs text-muted-foreground">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (±{Math.round(coords.acc)}m)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bike Meter Photo <span className="text-destructive">*</span></Label>
            <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <Camera className="h-4 w-4 mr-1" />{imagePreview ? 'Retake' : 'Open camera'}
              </Button>
              {imagePreview && <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Ready</span>}
            </div>
            {imagePreview && <img src={imagePreview} alt="Bike meter" className="max-h-56 rounded-md border border-border object-contain" />}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Odometer (km)</Label>
              <Input type="number" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {outcomes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Linked project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {(myProjects || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.project_code} — {p.leads?.customer_name || '—'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes <span className="text-destructive">*</span></Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened at the visit?" />
          </div>

          <Button onClick={submit} disabled={busy || !coords || !imageFile || !notes.trim()} className="w-full gradient-primary text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Navigation className="h-4 w-4 mr-1" />} Submit visit
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base">Recent visits</CardTitle></CardHeader>
        <CardContent>
          {!recent?.length ? <p className="text-sm text-muted-foreground">No visits yet.</p> : (
            <div className="space-y-2">
              {recent.map((v: any) => (
                <div key={v.id} className="rounded-md border border-border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{v.projects?.project_code || 'No project'} — {v.projects?.leads?.customer_name || ''}</span>
                    <Badge variant="outline">{outcomes.find((o) => o.value === v.outcome)?.label || v.outcome}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{format(new Date(v.created_at), 'dd MMM HH:mm')}</p>
                  {v.notes && <p className="text-sm">{v.notes}</p>}
                  {v.latitude && (
                    <a className="text-xs text-primary underline" href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer">View on map</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FieldVisit;
