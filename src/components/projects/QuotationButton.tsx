import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  projectId: string;
  size?: 'sm' | 'default';
}

const QuotationButton = ({ projectId, size = 'sm' }: Props) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-quotation', {
        body: { projectId },
      });
      if (error) throw error;
      if (!data?.html) throw new Error('No quotation generated');

      // Open in new window for printing/saving as PDF
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(data.html);
        win.document.close();
        win.print();
      }
    } catch (err: any) {
      toast({ title: 'Error generating quotation', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size={size} onClick={handleGenerate} disabled={loading}>
      {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
      Quotation
    </Button>
  );
};

export default QuotationButton;
