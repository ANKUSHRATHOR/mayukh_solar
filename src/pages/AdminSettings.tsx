// Admin-only settings: Geofences manager, T&C templates manager, default vendor profile, plant specs dropdown values.
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MapPin, FileText, Building2, Plus, Trash2, Save, Landmark, Star, Settings, MessageCircle, Copy, Link, Shield } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchSystemConfig } from '@/lib/systemConfig';

const AdminSettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Geofences
  const [gfName, setGfName] = useState('');
  const [gfLat, setGfLat] = useState('');
  const [gfLng, setGfLng] = useState('');
  const [gfRadius, setGfRadius] = useState('200');

  const { data: fences } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => {
      const { data } = await supabase.from('attendance_geofences' as any).select('*').order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { toast({ title: 'Geolocation not supported', variant: 'destructive' }); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      setGfLat(p.coords.latitude.toFixed(6));
      setGfLng(p.coords.longitude.toFixed(6));
    }, (e) => toast({ title: 'Could not get location', description: e.message, variant: 'destructive' }));
  };

  const addFence = async () => {
    if (!gfName || !gfLat || !gfLng) { toast({ title: 'Name and coordinates required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('attendance_geofences' as any).insert({
      name: gfName, latitude: Number(gfLat), longitude: Number(gfLng), radius_m: Number(gfRadius || 200), is_active: true,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setGfName(''); setGfLat(''); setGfLng(''); setGfRadius('200');
    qc.invalidateQueries({ queryKey: ['geofences'] });
    toast({ title: 'Geofence added' });
  };

  const toggleFence = async (id: string, active: boolean) => {
    await supabase.from('attendance_geofences' as any).update({ is_active: active }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['geofences'] });
  };
  const deleteFence = async (id: string) => {
    await supabase.from('attendance_geofences' as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['geofences'] });
  };

  // T&C templates
  const { data: terms } = useQuery({
    queryKey: ['terms'],
    queryFn: async () => {
      const { data } = await supabase.from('quotation_terms_templates' as any).select('*').order('section_order', { ascending: true });
      return (data as any[]) || [];
    },
  });
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newOrder, setNewOrder] = useState('100');

  const addTerm = async () => {
    if (!newTitle || !newBody) { toast({ title: 'Title and body required', variant: 'destructive' }); return; }
    const { error } = await supabase.from('quotation_terms_templates' as any).insert({
      title: newTitle, body: newBody, section_order: Number(newOrder || 100), is_active: true,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setNewTitle(''); setNewBody(''); setNewOrder('100');
    qc.invalidateQueries({ queryKey: ['terms'] });
    toast({ title: 'Term added' });
  };
  const updateTerm = async (id: string, patch: any) => {
    await supabase.from('quotation_terms_templates' as any).update(patch).eq('id', id);
    qc.invalidateQueries({ queryKey: ['terms'] });
  };
  const deleteTerm = async (id: string) => {
    await supabase.from('quotation_terms_templates' as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['terms'] });
  };

  // Vendor profile (default)
  const { data: vendor } = useQuery({
    queryKey: ['vendor-default'],
    queryFn: async () => {
      const { data } = await supabase.from('vendor_profiles' as any).select('*').eq('is_default', true).maybeSingle();
      return data as any;
    },
  });
  const [v, setV] = useState<any>({});
  const vRow = { ...vendor, ...v };
  const saveVendor = async () => {
    const payload: any = {
      firm_name: vRow.firm_name, gstin: vRow.gstin || null, mobile: vRow.mobile || null, email: vRow.email || null,
      address: vRow.address || null, bank_name: vRow.bank_name || null, account_no: vRow.account_no || null,
      ifsc: vRow.ifsc || null, account_type: vRow.account_type || null, license_no: vRow.license_no || null,
      is_default: true,
    };
    if (vendor?.id) {
      await supabase.from('vendor_profiles' as any).update(payload).eq('id', vendor.id);
    } else {
      await supabase.from('vendor_profiles' as any).insert(payload);
    }
    qc.invalidateQueries({ queryKey: ['vendor-default'] });
    toast({ title: 'Vendor profile saved' });
  };

  // Bank accounts
  const { data: banks } = useQuery({
    queryKey: ['vendor-banks'],
    queryFn: async () => {
      const { data } = await supabase.from('vendor_bank_accounts' as any).select('*').order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });
  const [b, setB] = useState<any>({ bank_name: '', holder_name: '', account_no: '', ifsc: '', branch_name: '', upi_image_url: '', is_default: false });
  const addBank = async () => {
    if (!b.bank_name || !b.holder_name || !b.account_no || !b.ifsc) {
      toast({ title: 'Bank name, holder, account no. and IFSC required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('vendor_bank_accounts' as any).insert({ ...b, is_active: true });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setB({ bank_name: '', holder_name: '', account_no: '', ifsc: '', branch_name: '', upi_image_url: '', is_default: false });
    qc.invalidateQueries({ queryKey: ['vendor-banks'] });
    toast({ title: 'Bank account added' });
  };
  const updateBank = async (id: string, patch: any) => {
    const { error } = await supabase.from('vendor_bank_accounts' as any).update(patch).eq('id', id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    qc.invalidateQueries({ queryKey: ['vendor-banks'] });
  };
  const deleteBank = async (id: string) => {
    if (!confirm('Delete this bank account?')) return;
    await supabase.from('vendor_bank_accounts' as any).delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['vendor-banks'] });
  };

  // Plant specs dropdown options
  const { data: dropdownConfig } = useQuery({
    queryKey: ['plant-dropdown-config'],
    queryFn: () => fetchSystemConfig<Record<string, string[]>>('plant_details_dropdown_options'),
  });

  const [dropdownsState, setDropdownsState] = useState<any>({
    phase: '',
    panel_make: '',
    panel_wt: '',
    inverter: '',
    inverter_wt: '',
    wiremake: '',
    wire_size: '',
    wire_material: ''
  });

  useEffect(() => {
    if (dropdownConfig) {
      const val = dropdownConfig as any;
      setDropdownsState({
        phase: Array.isArray(val.phase) ? val.phase.join(', ') : '',
        panel_make: Array.isArray(val.panel_make) ? val.panel_make.join(', ') : '',
        panel_wt: Array.isArray(val.panel_wt) ? val.panel_wt.join(', ') : '',
        inverter: Array.isArray(val.inverter) ? val.inverter.join(', ') : '',
        inverter_wt: Array.isArray(val.inverter_wt) ? val.inverter_wt.join(', ') : '',
        wiremake: Array.isArray(val.wiremake) ? val.wiremake.join(', ') : '',
        wire_size: Array.isArray(val.wire_size) ? val.wire_size.join(', ') : '',
        wire_material: Array.isArray(val.wire_material) ? val.wire_material.join(', ') : ''
      });
    }
  }, [dropdownConfig]);

  const saveDropdowns = async () => {
    const payload = {
      phase: dropdownsState.phase.split(',').map((s: string) => s.trim()).filter(Boolean),
      panel_make: dropdownsState.panel_make.split(',').map((s: string) => s.trim()).filter(Boolean),
      panel_wt: dropdownsState.panel_wt.split(',').map((s: string) => s.trim()).filter(Boolean),
      inverter: dropdownsState.inverter.split(',').map((s: string) => s.trim()).filter(Boolean),
      inverter_wt: dropdownsState.inverter_wt.split(',').map((s: string) => s.trim()).filter(Boolean),
      wiremake: dropdownsState.wiremake.split(',').map((s: string) => s.trim()).filter(Boolean),
      wire_size: dropdownsState.wire_size.split(',').map((s: string) => s.trim()).filter(Boolean),
      wire_material: dropdownsState.wire_material.split(',').map((s: string) => s.trim()).filter(Boolean)
    };

    const { error } = await supabase
      .from('system_configs' as any)
      .upsert({
        key: 'plant_details_dropdown_options',
        value: payload,
        updated_at: new Date().toISOString()
      });

    if (error) {
      toast({ title: 'Failed to save settings', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['plant-dropdown-config'] });
      toast({ title: 'Dropdown options saved successfully' });
    }
  };

  // WhatsApp Integration Settings
  const { data: whatsappConfig } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => fetchSystemConfig<Record<string, any>>('whatsapp_config'),
  });

  const [whatsappState, setWhatsappState] = useState<any>({
    enabled: false,
    provider: 'ultramsg',
    api_url: '',
    instance_id: '',
    access_token: '',
    sender_phone: '',
    webhook_secret: '',
  });

  useEffect(() => {
    if (whatsappConfig) {
      const val = whatsappConfig as any;
      setWhatsappState({
        enabled: !!val.enabled,
        provider: val.provider || 'ultramsg',
        api_url: val.api_url || '',
        instance_id: val.instance_id || '',
        access_token: val.access_token || '',
        sender_phone: val.sender_phone || ''
      });
    }
  }, [whatsappConfig]);

  const saveWhatsappConfig = async () => {
    const { error } = await supabase
      .from('system_configs' as any)
      .upsert({
        key: 'whatsapp_config',
        value: whatsappState,
        updated_at: new Date().toISOString()
      });

    if (error) {
      toast({ title: 'Failed to save WhatsApp config', description: error.message, variant: 'destructive' });
    } else {
      qc.invalidateQueries({ queryKey: ['whatsapp-config'] });
      toast({ title: 'WhatsApp configuration saved successfully!' });
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin Settings</h1>

      <Tabs defaultValue="geofences" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="geofences"><MapPin className="h-4 w-4 mr-1" />Geofences</TabsTrigger>
          <TabsTrigger value="terms"><FileText className="h-4 w-4 mr-1" />T&amp;C Templates</TabsTrigger>
          <TabsTrigger value="vendor"><Building2 className="h-4 w-4 mr-1" />Vendor Profile</TabsTrigger>
          <TabsTrigger value="banks"><Landmark className="h-4 w-4 mr-1" />Bank Accounts</TabsTrigger>
          <TabsTrigger value="dropdowns"><Settings className="h-4 w-4 mr-1" />Plant Dropdowns</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp Config</TabsTrigger>
        </TabsList>

        <TabsContent value="geofences" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add geofence</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-2 space-y-1.5"><Label>Name</Label><Input value={gfName} onChange={(e) => setGfName(e.target.value)} placeholder="Head office" /></div>
              <div className="space-y-1.5"><Label>Latitude</Label><Input value={gfLat} onChange={(e) => setGfLat(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Longitude</Label><Input value={gfLng} onChange={(e) => setGfLng(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Radius (m)</Label><Input type="number" value={gfRadius} onChange={(e) => setGfRadius(e.target.value)} /></div>
              <div className="md:col-span-5 flex gap-2">
                <Button variant="outline" onClick={useCurrentLocation}><MapPin className="h-4 w-4 mr-1" /> Use my location</Button>
                <Button onClick={addFence} className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Active geofences</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!fences?.length ? <p className="text-sm text-muted-foreground">No geofences yet. Without any active geofence, punches are allowed from any location.</p> : fences.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{Number(g.latitude).toFixed(5)}, {Number(g.longitude).toFixed(5)} · ±{g.radius_m}m</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={g.is_active} onCheckedChange={(v) => toggleFence(g.id, v)} />
                    <a className="text-xs text-primary underline" href={`https://www.google.com/maps?q=${g.latitude},${g.longitude}`} target="_blank" rel="noreferrer">Map</a>
                    <Button size="icon" variant="ghost" onClick={() => deleteFence(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terms" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add term</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-4 space-y-1.5"><Label>Title</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Warranty / Payment / Delivery..." /></div>
              <div className="space-y-1.5"><Label>Order</Label><Input type="number" value={newOrder} onChange={(e) => setNewOrder(e.target.value)} /></div>
              <Button onClick={addTerm} className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              <div className="md:col-span-6 space-y-1.5"><Label>Body</Label><Textarea rows={3} value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Plain text. New lines preserved." /></div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {terms?.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Input className="max-w-md font-semibold" defaultValue={t.title} onBlur={(e) => e.target.value !== t.title && updateTerm(t.id, { title: e.target.value })} />
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">order {t.section_order}</Badge>
                      <Switch checked={t.is_active} onCheckedChange={(v) => updateTerm(t.id, { is_active: v })} />
                      <Button size="icon" variant="ghost" onClick={() => deleteTerm(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                  <Textarea defaultValue={t.body} rows={3} onBlur={(e) => e.target.value !== t.body && updateTerm(t.id, { body: e.target.value })} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="vendor" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Default vendor profile (used in quotations)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['firm_name', 'Firm name'], ['gstin', 'GSTIN'], ['mobile', 'Mobile'], ['email', 'Email'],
                ['bank_name', 'Bank name'], ['account_no', 'Account number'], ['ifsc', 'IFSC'], ['account_type', 'Account type'],
                ['license_no', 'License number'],
              ].map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input value={vRow?.[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                </div>
              ))}
              <div className="md:col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Textarea rows={2} value={vRow?.address ?? ''} onChange={(e) => setV({ ...v, address: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={saveVendor} className="gradient-primary text-primary-foreground"><Save className="h-4 w-4 mr-1" /> Save vendor</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banks" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add bank account</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Bank name *</Label><Input value={b.bank_name} onChange={(e) => setB({ ...b, bank_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Account holder *</Label><Input value={b.holder_name} onChange={(e) => setB({ ...b, holder_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Account number *</Label><Input value={b.account_no} onChange={(e) => setB({ ...b, account_no: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>IFSC *</Label><Input value={b.ifsc} onChange={(e) => setB({ ...b, ifsc: e.target.value.toUpperCase() })} /></div>
              <div className="space-y-1.5"><Label>Branch</Label><Input value={b.branch_name} onChange={(e) => setB({ ...b, branch_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>UPI QR image URL</Label><Input value={b.upi_image_url} onChange={(e) => setB({ ...b, upi_image_url: e.target.value })} placeholder="https://..." /></div>
              <div className="md:col-span-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.is_default} onChange={(e) => setB({ ...b, is_default: e.target.checked })} /> Set as default</label>
                <Button onClick={addBank} className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add bank</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {!banks?.length ? <p className="text-sm text-muted-foreground">No bank accounts yet.</p> : banks.map((acc) => (
              <Card key={acc.id} className={acc.is_default ? 'border-primary' : ''}>
                <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold flex items-center gap-2">{acc.bank_name} {acc.is_default && <Badge className="bg-primary text-primary-foreground"><Star className="h-3 w-3 mr-1" />Default</Badge>}</p>
                    <p className="text-sm">{acc.holder_name} • A/C {acc.account_no} • IFSC {acc.ifsc}</p>
                    {acc.branch_name && <p className="text-xs text-muted-foreground">Branch: {acc.branch_name}</p>}
                    {acc.upi_image_url && <a className="text-xs text-primary underline" href={acc.upi_image_url} target="_blank" rel="noreferrer">UPI QR</a>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!acc.is_default && <Button size="sm" variant="outline" onClick={() => updateBank(acc.id, { is_default: true })}><Star className="h-3 w-3 mr-1" />Make default</Button>}
                    <Switch checked={acc.is_active} onCheckedChange={(v) => updateBank(acc.id, { is_active: v })} />
                    <Button size="icon" variant="ghost" onClick={() => deleteBank(acc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dropdowns" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Configure Plant Specs Dropdowns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Enter comma-separated values for each dropdown field. These values will be displayed in the site visit plant details form.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Phase options</Label>
                  <Input 
                    value={dropdownsState.phase} 
                    onChange={e => setDropdownsState({ ...dropdownsState, phase: e.target.value })} 
                    placeholder="e.g. Single Phase, Three Phase" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Panel Make options</Label>
                  <Input 
                    value={dropdownsState.panel_make} 
                    onChange={e => setDropdownsState({ ...dropdownsState, panel_make: e.target.value })} 
                    placeholder="e.g. Tata Power, Adani Solar, Waaree" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Panel Wattage options</Label>
                  <Input 
                    value={dropdownsState.panel_wt} 
                    onChange={e => setDropdownsState({ ...dropdownsState, panel_wt: e.target.value })} 
                    placeholder="e.g. 540W, 550W, 575W" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Inverter Make options</Label>
                  <Input 
                    value={dropdownsState.inverter} 
                    onChange={e => setDropdownsState({ ...dropdownsState, inverter: e.target.value })} 
                    placeholder="e.g. Growatt, Sofar, Sungrow" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Inverter Wattage/Capacity options</Label>
                  <Input 
                    value={dropdownsState.inverter_wt} 
                    onChange={e => setDropdownsState({ ...dropdownsState, inverter_wt: e.target.value })} 
                    placeholder="e.g. 3 kW, 5 kW, 8 kW" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Wire Make options</Label>
                  <Input 
                    value={dropdownsState.wiremake} 
                    onChange={e => setDropdownsState({ ...dropdownsState, wiremake: e.target.value })} 
                    placeholder="e.g. Polycab, Havells, KEI" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Wire Size options</Label>
                  <Input 
                    value={dropdownsState.wire_size} 
                    onChange={e => setDropdownsState({ ...dropdownsState, wire_size: e.target.value })} 
                    placeholder="e.g. 4 sqmm, 6 sqmm, 10 sqmm" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Wire Material options</Label>
                  <Input 
                    value={dropdownsState.wire_material} 
                    onChange={e => setDropdownsState({ ...dropdownsState, wire_material: e.target.value })} 
                    placeholder="e.g. Copper, Aluminum" 
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={saveDropdowns} className="gradient-primary text-primary-foreground">
                  <Save className="h-4 w-4 mr-1.5" /> Save Dropdown Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Configure WhatsApp Integration Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Set up your WhatsApp provider and API credentials to automate project updates and enable operator quotation/bill sharing on WhatsApp.
              </p>

              <div className="flex items-center space-x-2 bg-muted/40 p-3 rounded-xl border w-fit">
                <Switch
                  id="wa-enabled"
                  checked={whatsappState.enabled}
                  onCheckedChange={(checked) => setWhatsappState({ ...whatsappState, enabled: checked })}
                />
                <Label htmlFor="wa-enabled" className="text-sm font-semibold cursor-pointer">
                  Enable WhatsApp Notifications
                </Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>WhatsApp Provider</Label>
                  <Select
                    value={whatsappState.provider}
                    onValueChange={(val) => setWhatsappState({ ...whatsappState, provider: val })}
                  >
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ultramsg">UltraMsg (Recommended for India)</SelectItem>
                      <SelectItem value="twilio">Twilio WhatsApp API</SelectItem>
                      <SelectItem value="cloud_api">Official Meta Cloud API</SelectItem>
                      <SelectItem value="custom">Custom API Gateway</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>API Base URL (Optional for UltraMsg/Twilio)</Label>
                  <Input
                    value={whatsappState.api_url}
                    onChange={(e) => setWhatsappState({ ...whatsappState, api_url: e.target.value })}
                    placeholder="e.g. https://api.ultramsg.com/instance12345/messages/chat"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {whatsappState.provider === 'twilio' ? 'Account SID' : 
                     whatsappState.provider === 'cloud_api' ? 'Phone Number ID' : 
                     whatsappState.provider === 'ultramsg' ? 'Instance ID' : 'Sender/Instance ID'}
                  </Label>
                  <Input
                    value={whatsappState.instance_id}
                    onChange={(e) => setWhatsappState({ ...whatsappState, instance_id: e.target.value })}
                    placeholder="e.g. instance12345 or WhatsApp Phone ID"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>API Key / Auth Token / Access Token</Label>
                  <Input
                    type="password"
                    value={whatsappState.access_token}
                    onChange={(e) => setWhatsappState({ ...whatsappState, access_token: e.target.value })}
                    placeholder="Paste authentication token / token key"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Sender Phone Number (Required for Twilio/Cloud API)</Label>
                  <Input
                    value={whatsappState.sender_phone}
                    onChange={(e) => setWhatsappState({ ...whatsappState, sender_phone: e.target.value })}
                    placeholder="e.g. +14155238886"
                  />
                </div>
              </div>

              {/* Webhook Configuration */}
              <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm text-foreground">Webhook Configuration</h4>
                  <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">Quotation Confirmation</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When a customer replies to a WhatsApp quotation (with <strong>CONFIRM</strong> or <strong>REJECT</strong>), their message is received at this webhook URL. Paste this URL in your WhatsApp provider's incoming webhook / inbound message settings.
                </p>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Your Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co'}/functions/v1/whatsapp-webhook`}
                      className="font-mono text-xs bg-muted/50 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/whatsapp-webhook`);
                        toast({ title: 'Webhook URL copied to clipboard!' });
                      }}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Webhook Secret (Optional)
                  </Label>
                  <Input
                    type="password"
                    value={whatsappState.webhook_secret || ''}
                    onChange={(e) => setWhatsappState({ ...whatsappState, webhook_secret: e.target.value })}
                    placeholder="Set a secret to verify incoming webhooks (recommended)"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Provider Setup Instructions</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <p>• <strong>UltraMsg:</strong> Dashboard → Settings → Webhooks → Webhook URL → paste the URL above</p>
                    <p>• <strong>Twilio:</strong> Console → Messaging → Senders → WhatsApp Sandbox → When a message comes in → paste the URL</p>
                    <p>• <strong>Meta Cloud API:</strong> Meta for Developers → App → WhatsApp → Configuration → Webhook → Callback URL → paste the URL, set verify token = your webhook secret</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={saveWhatsappConfig} className="gradient-primary text-primary-foreground font-semibold">
                  <Save className="h-4 w-4 mr-1.5" /> Save WhatsApp Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettings;
