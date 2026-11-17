import { describe, expect, it } from 'vitest';
import { ticketPictureUrl } from './TicketArt.js';

describe('ticket art', () => {
  it('finds a ticket picture by the ticket id', () => {
    expect(ticketPictureUrl('portland-calgary-churchill')).toBe('/art/tickets/portland-calgary-churchill.webp');
  });
});
