// Save/view consumer home location on a finalized project.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Navigation, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const ProjectHomeLocation = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { staff, role } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canSave = role === 'sales_person' || role === 'admin';

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('projects')
      .select('id, project_code, home_latitude, home_longitude, home_location_saved_by, home_location_saved_at, leads(customer_name, address, village_city)')
      .eq('id', projectId!).single();
    setProject(data); setLoading(false);
  };
  useEffect(() => { if (projectId) load(); }, [projectId]);

  const save = async () => {
    if (!navigator.geolocation) { toast({ title: 'Location not supported', variant: 'destructive' }); return; }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const { error } = await supabase.from('projects').update({
        home_latitude: p.coords.latitude,
        home_longitude: p.coords.longitude,
        home_location_saved_by: staff?.user_id ?? null,
        home_location_saved_at: new Date().toISOString(),
      } as any).eq('id', projectId!);
      setSaving(false);
      if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Home location saved' });
      load();
    }, (e) => { setSaving(false); toast({ title: 'Location failed', description: e.message, variant: 'destructive' }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-8 text-center text-muted-foreground">Project not found</div>;

  const lat = project.home_latitude, lng = project.home_longitude;
  const mapsLink = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const navLink = lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      <Card className="shadow-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Consumer Home Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-semibold">{project.project_code} — {project.leads?.customer_name}</p>
            <p className="text-sm text-muted-foreground">{project.leads?.address}, {project.leads?.village_city}</p>
          </div>

          {lat && lng ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 bg-accent/30 text-sm">
                <p>📍 {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</p>
                {project.home_location_saved_at && (
                  <p className="text-xs text-muted-foreground mt-1">Saved {format(new Date(project.home_location_saved_at), 'dd MMM HH:mm')}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {mapsLink && <a href={mapsLink} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><MapPin className="h-4 w-4 mr-1" />Open in Maps</Button></a>}
                {navLink && <a href={navLink} target="_blank" rel="noreferrer"><Button size="sm" className="gradient-primary text-primary-foreground"><Navigation className="h-4 w-4 mr-1" />Navigate</Button></a>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No home location saved yet.</p>
          )}

          {canSave && (
            <Button onClick={save} disabled={saving} variant={lat ? 'outline' : 'default'} className={lat ? '' : 'gradient-primary text-primary-foreground'}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
              {lat ? 'Update with current location' : 'Save current location as home'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectHomeLocation;
