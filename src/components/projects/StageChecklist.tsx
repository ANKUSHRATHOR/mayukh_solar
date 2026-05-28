import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Lock, FileText, FileCheck, FileSignature, MapPin, Hash, Package } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  projectId: string;
  isOperator?: boolean;
}

interface Requirements {
  documents_uploaded: boolean;
  documents_verified: boolean;
  quotation_created: boolean;
  home_location_saved: boolean;
  serial_numbers_entered: boolean;
  material_dispatched: boolean;
}

export default function StageChecklist({ projectId, isOperator }: Props) {
  const [req, setReq] = useState<Requirements | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).rpc('project_stage_requirements', { _project_id: projectId });
      if (!cancelled && data) setReq(data as Requirements);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!req) return null;

  const items: Array<{ key: keyof Requirements; label: string; icon: any; href?: string }> = [
    { key: 'documents_uploaded', label: 'Documents uploaded', icon: FileText, href: `/projects/${projectId}/documents` },
    { key: 'documents_verified', label: 'Documents verified', icon: FileCheck },
    { key: 'quotation_created', label: 'Quotation generated', icon: FileSignature },
    { key: 'home_location_saved', label: 'Home location saved', icon: MapPin, href: `/projects/${projectId}/home-location` },
    { key: 'serial_numbers_entered', label: 'Serial numbers entered', icon: Hash },
    { key: 'material_dispatched', label: 'Material dispatched', icon: Package, href: isOperator ? `/projects/${projectId}/material-dispatch` : undefined },
  ];

  const doneCount = items.filter(i => req[i.key]).length;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Stage Checklist</span>
          <span className="text-sm font-normal text-muted-foreground">{doneCount} / {items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(({ key, label, icon: Icon, href }) => {
          const ok = req[key];
          const content = (
            <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${ok ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'}`}>
              <Icon className={`h-4 w-4 ${ok ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`flex-1 ${ok ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
              {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
          );
          return href ? <Link key={key} to={href}>{content}</Link> : <div key={key}>{content}</div>;
        })}
      </CardContent>
    </Card>
  );
}
