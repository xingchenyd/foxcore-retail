SELECT 'sale_event_shift_mismatch' AS issue,COUNT(*) AS violations FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.event_id<>sh.event_id
UNION ALL
SELECT 'shift_event_booth_mismatch',COUNT(*) FROM shifts sh JOIN booths b ON b.id=sh.booth_id WHERE sh.event_id<>b.event_id
UNION ALL
SELECT 'balance_ledger_difference',COUNT(*) FROM stock_balances b LEFT JOIN (SELECT location_id,product_id,SUM(delta) AS quantity FROM stock_ledger GROUP BY location_id,product_id) l ON l.location_id=b.location_id AND l.product_id=b.product_id WHERE b.on_hand<>COALESCE(l.quantity,0)
UNION ALL
SELECT 'ledger_without_balance',COUNT(*) FROM (SELECT location_id,product_id FROM stock_ledger GROUP BY location_id,product_id) l LEFT JOIN stock_balances b ON b.location_id=l.location_id AND b.product_id=l.product_id WHERE b.location_id IS NULL
UNION ALL
SELECT 'balance_hold_difference',COUNT(*) FROM stock_balances b LEFT JOIN (SELECT location_id,product_id,SUM(quantity) AS quantity FROM stock_holds WHERE status='ACTIVE' GROUP BY location_id,product_id) h ON h.location_id=b.location_id AND h.product_id=b.product_id WHERE b.reserved<>COALESCE(h.quantity,0)
UNION ALL
SELECT 'negative_available',COUNT(*) FROM stock_balances WHERE on_hand<reserved
UNION ALL
SELECT 'posted_sale_amount_difference',COUNT(*) FROM sales sa JOIN (SELECT sale_id,SUM(line_net_cents) AS net,SUM(line_tax_cents) AS tax FROM sale_lines GROUP BY sale_id) l ON l.sale_id=sa.id WHERE sa.state='POSTED' AND (sa.net_cents<>l.net OR sa.tax_cents<>l.tax OR sa.total_cents<>l.net+l.tax)
UNION ALL
SELECT 'posted_sale_missing_ledger',COUNT(*) FROM sale_lines l JOIN sales sa ON sa.id=l.sale_id LEFT JOIN stock_ledger sl ON sl.source_kind='SALE' AND sl.source_id=l.sale_id AND sl.source_line_no=l.line_no WHERE sa.state='POSTED' AND (sl.id IS NULL OR sl.delta<>-CAST(l.quantity AS SIGNED))
UNION ALL
SELECT 'posted_sale_missing_commission',COUNT(*) FROM sale_lines l JOIN sales sa ON sa.id=l.sale_id LEFT JOIN commission_entries ce ON ce.source_kind='SALE' AND ce.source_id=l.sale_id AND ce.source_line_no=l.line_no WHERE sa.state='POSTED' AND l.line_commission_cents>0 AND (ce.id IS NULL OR ce.amount_cents<>l.line_commission_cents)
UNION ALL
SELECT 'return_amount_difference',COUNT(*) FROM returns r JOIN (SELECT return_id,SUM(net_cents) AS net,SUM(tax_cents) AS tax FROM return_lines GROUP BY return_id) l ON l.return_id=r.id WHERE r.state='POSTED' AND (r.net_cents<>l.net OR r.tax_cents<>l.tax OR r.total_cents<>l.net+l.tax)
UNION ALL
SELECT 'return_over_original_quantity',COUNT(*) FROM sale_lines l JOIN (SELECT r.sale_id,rl.sale_line_no,SUM(rl.quantity) AS qty FROM returns r JOIN return_lines rl ON rl.return_id=r.id WHERE r.state IN ('POSTED','AUTHORIZED') GROUP BY r.sale_id,rl.sale_line_no) x ON x.sale_id=l.sale_id AND x.sale_line_no=l.line_no WHERE x.qty>l.quantity
UNION ALL
SELECT 'return_wrong_original_line',COUNT(*) FROM return_lines rl JOIN returns r ON r.id=rl.return_id LEFT JOIN sale_lines sl ON sl.sale_id=r.sale_id AND sl.line_no=rl.sale_line_no WHERE sl.sale_id IS NULL
UNION ALL
SELECT 'posted_return_missing_restock_ledger',COUNT(*) FROM return_lines rl JOIN returns r ON r.id=rl.return_id LEFT JOIN stock_ledger sl ON sl.source_kind='RETURN' AND sl.source_id=rl.return_id AND sl.source_line_no=rl.line_no WHERE r.state='POSTED' AND rl.disposition='RESTOCK' AND (sl.id IS NULL OR sl.delta<>rl.quantity)
UNION ALL
SELECT 'posted_return_missing_commission',COUNT(*) FROM return_lines rl JOIN returns r ON r.id=rl.return_id LEFT JOIN commission_entries ce ON ce.source_kind='RETURN' AND ce.source_id=rl.return_id AND ce.source_line_no=rl.line_no WHERE r.state='POSTED' AND rl.commission_cents>0 AND (ce.id IS NULL OR ce.amount_cents<>-CAST(rl.commission_cents AS SIGNED))
UNION ALL
SELECT 'cancelled_settlement_has_claim',COUNT(*) FROM commission_claims cc JOIN commission_settlements cs ON cs.id=cc.settlement_id WHERE cs.state='CANCELLED'
UNION ALL
SELECT 'settlement_amount_difference',COUNT(*) FROM commission_settlements cs JOIN (SELECT settlement_id,SUM(amount_cents) AS total FROM commission_settlement_lines GROUP BY settlement_id) l ON l.settlement_id=cs.id WHERE cs.total_cents<>l.total;
