import { TicketList, TicketThread } from '../../components/shared/Support.jsx';

export function SupportList() {
  return <TicketList basePath="/account/support" />;
}

export function SupportTicket() {
  return <TicketThread basePath="/account/support" />;
}
