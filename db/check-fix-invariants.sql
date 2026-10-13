-- Additional current-state invariants. Never reject a historical return just because
-- its destination event was legitimately closed later. No data modifications.
SELECT 'closed_event_positive_stock' AS issue, COUNT(*) AS violations
FROM stock_balances s JOIN stock_locations l ON l.id=s.location_id
JOIN booths b ON b.id=l.booth_id JOIN events e ON e.id=b.event_id
WHERE e.status='CLOSED' AND s.on_hand>0
UNION ALL
SELECT 'closed_event_authorized_restock', COUNT(*)
FROM returns r JOIN stock_locations l ON l.id=r.destination_location_id
JOIN booths b ON b.id=l.booth_id JOIN events e ON e.id=b.event_id
WHERE e.status='CLOSED' AND r.state='AUTHORIZED'
AND EXISTS (SELECT 1 FROM return_lines rl WHERE rl.return_id=r.id AND rl.disposition='RESTOCK')
UNION ALL
SELECT 'cancelled_shift_has_execution', COUNT(*) FROM shifts sh
WHERE sh.status='CANCELLED' AND (sh.actual_start IS NOT NULL OR sh.actual_end IS NOT NULL
OR EXISTS(SELECT 1 FROM sales sa WHERE sa.shift_id=sh.id));
