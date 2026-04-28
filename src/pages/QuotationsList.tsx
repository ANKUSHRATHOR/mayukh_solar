import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, User, Phone, MapPin, Calendar } from 'lucide-react';
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
          <p className="text-muted-foreground text-sm">Search customers by quotation number, name, mobile, or project code</p>
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
          <p className="text-muted-foreground text-center py-10">Loading quotations...</p>
        ) : !filtered?.length ? (
          <p className="text-muted-foreground text-center py-10">
            {searchTerm ? 'No quotations found matching your search.' : 'No quotations generated yet.'}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((q) => (
              <Card key={q.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {q.quotation_number ?? 'No quotation number'}
                    </CardTitle>
                    <Badge variant="outline">{q.project_code ?? 'No project code'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{q.customer_name ?? 'Unknown customer'}</span>
                  </div>
                  {q.customer_mobile && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{q.customer_mobile}</span>
                    </div>
                  )}
                  {q.customer_address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">{q.customer_address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
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
    </AppLayout>
  );
};

export default QuotationsList;
