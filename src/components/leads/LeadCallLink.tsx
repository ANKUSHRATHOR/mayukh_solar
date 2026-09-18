import { recordDialAttempt } from '@/lib/calls';

interface Props {
  leadId: string;
  mobile: string;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

/**
 * A `tel:` link on a lead that also counts the dial.
 *
 * Every call button on a lead goes through this, so "dialled today" counts the
 * calls people actually start rather than only the ones they remember to write
 * up afterwards. Logging the call later resolves this same attempt, so a call
 * that is both dialled and logged still counts once.
 *
 * The recording is fire-and-forget and swallows its own errors: the dial must
 * happen whatever the network is doing. It also stops the click from bubbling,
 * since these sit inside rows that navigate.
 */
const LeadCallLink = ({ leadId, mobile, className, children, ...rest }: Props) => (
  <a
    href={`tel:${mobile}`}
    className={className}
    aria-label={rest['aria-label']}
    onClick={(e) => {
      e.stopPropagation();
      void recordDialAttempt(leadId);
    }}
  >
    {children}
  </a>
);

export default LeadCallLink;
