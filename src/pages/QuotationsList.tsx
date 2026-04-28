import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatCard from '@/components/dashboard/StatCard';
import { Search, FileText, User, Phone, MapPin, Calendar, IndianRupee, Zap, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const QuotationsList = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = quotations?.filter((q) => {
    const term = searchTerm.toLowerCase();
    return (
      (q.quotation_number ?? '').toLowerCase().includes(term) ||
      (q.customer_name ?? '').toLowerCase().includes(term) ||
      (q.customer_mobile && q.customer_mobile.includes(term)) ||
      (q.project_code ?? '').toLowerCase().includes(term)
    );
  });

  const totalValue = quotations?.reduce((sum, q) => sum + Number(q.total_amount ?? 0), 0) ?? 0;
  const totalCapacity = quotations?.reduce((sum, q) => sum + Number(q.capacity_kw ?? 0), 0) ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">Search and review generated customer quotations</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Quotations" value={String(quotations?.length ?? 0)} icon={FileText} change="" changeType="neutral" />
          <StatCard title="Quoted Value" value={`₹${(totalValue / 100000).toFixed(1)}L`} icon={IndianRupee} change="" changeType="neutral" />
          <StatCard title="System Capacity" value={`${totalCapacity.toFixed(1)} kW`} icon={Zap} change="" changeType="neutral" />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by QT number, customer name, mobile, project code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !filtered?.length ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">{searchTerm ? 'No quotations found matching your search.' : 'No quotations generated yet.'}</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => (
              <Card key={q.id} className="overflow-hidden border-border bg-card shadow-card transition-shadow hover:shadow-elevated">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate">{q.quotation_number ?? 'No quotation number'}</span>
                    </CardTitle>
                    <Badge variant="outline" className="shrink-0">{q.project_code ?? 'No project code'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium truncate">{q.customer_name ?? 'Unknown customer'}</span>
                  </div>
                  {q.customer_mobile && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{q.customer_mobile}</span>
                    </div>
                  )}
                  {q.customer_address && (
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">{q.customer_address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(new Date(q.created_at), 'dd MMM yyyy')}
                      </span>
                    </div>
                    <span className="font-semibold text-primary">
                      ₹{Number(q.total_amount ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {q.capacity_kw ?? '—'} kW System
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
};

export default QuotationsList;
