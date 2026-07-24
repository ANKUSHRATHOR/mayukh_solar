import { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface SwitchFieldProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Boolean toggle bound to react-hook-form. The whole row is the label target,
 * which gives a comfortably large tap area on mobile — several existing toggles
 * in the app are 28px tall, well under the 44px minimum.
 */
function SwitchField<T extends FieldValues>({
  form,
  name,
  label,
  description,
  disabled,
  className,
}: SwitchFieldProps<T>) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            'flex flex-row items-center justify-between gap-4 rounded-xl border border-border/70 bg-card px-4 py-3 transition-colors hover:border-border',
            className
          )}
        >
          <div className="min-w-0 space-y-0.5">
            <FormLabel className="cursor-pointer text-sm font-semibold">{label}</FormLabel>
            {description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}

export default SwitchField;
