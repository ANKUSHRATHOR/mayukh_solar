import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * The two screens shown when a session exists but no usable profile does.
 *
 * They live together because telling the two apart is the whole point: a failed
 * lookup is not a missing role. `/` and every gated route both have to make that
 * distinction, and when only one of them did, a timed-out role query told an
 * active admin their account was pending approval — sending them to the wrong
 * person for a problem that clears on its own.
 */

export const ProfileErrorScreen = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-lg space-y-3">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Couldn't load your profile</AlertTitle>
        <AlertDescription>
          We could not reach the server to check your role. This is usually temporary — your
          account is fine.
        </AlertDescription>
      </Alert>
      <Button onClick={onRetry} className="w-full gap-2">
        <RefreshCw className="h-4 w-4" /> Try again
      </Button>
    </div>
  </div>
);

export const PendingApprovalScreen = () => (
  <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-lg">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Pending Approval or Inactive Account</AlertTitle>
        <AlertDescription>
          Your account is pending admin approval, inactive, or has not been assigned a role yet.
          Please contact your administrator to activate your account and assign your role.
        </AlertDescription>
      </Alert>
    </div>
  </div>
);
