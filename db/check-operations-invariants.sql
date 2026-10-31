SELECT 'event_timezone_alias' AS issue,COUNT(*) AS violations FROM events WHERE timezone<>business_timezone
UNION ALL
SELECT 'chinese_profile',COUNT(*) FROM events WHERE currency='CNY' AND (price_basis<>'INCLUSIVE' OR business_timezone<>'Asia/Shanghai' OR return_days<>7)
UNION ALL
SELECT 'inclusive_sale_totals',COUNT(*) FROM sales s WHERE s.price_basis='INCLUSIVE' AND s.state IN ('CHECKOUT','POSTED') AND s.total_cents<>(SELECT COALESCE(SUM(l.quantity*l.final_unit_price_cents),0) FROM sale_lines l WHERE l.sale_id=s.id)
UNION ALL
SELECT 'transfer_transit_quantity',COUNT(*) FROM stock_transfers t LEFT JOIN stock_balances b ON b.location_id=t.transit_location_id AND b.product_id=t.product_id WHERE COALESCE(b.on_hand,0)<>IF(t.state='DISPATCHED',t.quantity,0)
UNION ALL
SELECT 'transfer_receipt_components',COUNT(*) FROM stock_transfers WHERE state='RECEIVED' AND (received_quantity IS NULL OR damaged_quantity IS NULL OR missing_quantity IS NULL OR received_quantity+damaged_quantity+missing_quantity<>quantity)
UNION ALL
SELECT 'damage_processed_limit',COUNT(*) FROM damage_records WHERE repaired_quantity+disposed_quantity>quantity
UNION ALL
SELECT 'damaged_inventory_matches_records',COUNT(*) FROM (SELECT p.id,COALESCE(b.on_hand,0) n,COALESCE((SELECT SUM(d.quantity-d.repaired_quantity-d.disposed_quantity) FROM damage_records d WHERE d.product_id=p.id),0) expected FROM products p LEFT JOIN stock_locations l ON l.code='DAMAGED' LEFT JOIN stock_balances b ON b.location_id=l.id AND b.product_id=p.id) x WHERE n<>expected
UNION ALL
SELECT 'exchange_child_state',COUNT(*) FROM exchanges x JOIN returns r ON r.id=x.return_id JOIN sales s ON s.id=x.new_sale_id WHERE (x.state='PREPARED' AND (r.state<>'AUTHORIZED' OR s.state<>'CHECKOUT')) OR (x.state='POSTED' AND (r.state<>'POSTED' OR s.state<>'POSTED')) OR (x.state='CANCELLED' AND (r.state<>'CANCELLED' OR s.state<>'CANCELLED'))
UNION ALL
SELECT 'exchange_amount_and_currency',COUNT(*) FROM exchanges x JOIN returns r ON r.id=x.return_id JOIN sales s ON s.id=x.new_sale_id JOIN sales o ON o.id=x.original_sale_id WHERE x.difference_cents<>CAST(s.total_cents AS SIGNED)-CAST(r.total_cents AS SIGNED) OR x.currency<>s.currency OR x.currency<>o.currency
UNION ALL
SELECT 'workspace_current_revision',COUNT(*) FROM sale_workspaces w LEFT JOIN sale_workspace_revisions h ON h.owner_id=w.owner_id AND h.workspace_key=w.workspace_key AND h.revision=w.revision WHERE h.revision IS NULL OR h.payload_json<>w.payload_json
UNION ALL
SELECT 'cash_refund_currency',COUNT(*) FROM returns r JOIN sales s ON s.id=r.sale_id JOIN shifts sh ON sh.id=r.cash_shift_id JOIN events e ON e.id=sh.event_id WHERE r.refund_method<>'CASH' OR s.currency<>e.currency
UNION ALL
SELECT 'settlement_currency',COUNT(*) FROM commission_settlement_lines l JOIN commission_settlements s ON s.id=l.settlement_id JOIN commission_entries e ON e.id=l.entry_id WHERE s.currency<>e.currency;
