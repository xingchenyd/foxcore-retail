-- Read-only preflight before upgrading a real installation. Report; NEVER auto-correct.
-- Unresolved documents only: POSTED history is deliberately excluded.
SELECT r.id AS return_id,r.state,r.sale_id,r.destination_location_id,
       sa.event_id AS source_event,b.event_id AS destination_event,e.status AS destination_event_status
FROM returns r JOIN sales sa ON sa.id=r.sale_id
LEFT JOIN stock_locations l ON l.id=r.destination_location_id
LEFT JOIN booths b ON b.id=l.booth_id LEFT JOIN events e ON e.id=b.event_id
WHERE r.state IN ('DRAFT','AUTHORIZED') AND
 (l.id IS NULL OR l.active=FALSE OR NOT (
   (l.kind='WAREHOUSE' AND l.code='MAIN' AND l.booth_id IS NULL)
   OR (l.kind='BOOTH' AND b.active=TRUE AND b.event_id=sa.event_id AND e.status='OPEN')))
ORDER BY r.id;
-- Resulting exceptions require human reconciliation of actual money/goods.
-- For AUTHORIZED documents: use the existing reconciled cancel + new draft path ONLY
-- when the operator can truthfully confirm the offline refund did not occur/was reversed.
SELECT e.id AS event_id,l.id AS location_id,s.product_id,s.on_hand,s.reserved
FROM events e JOIN booths b ON b.event_id=e.id JOIN stock_locations l ON l.booth_id=b.id
JOIN stock_balances s ON s.location_id=l.id
WHERE e.status='CLOSED' AND (s.on_hand>0 OR s.reserved>0) ORDER BY e.id,l.id,s.product_id;
