-- Explicit refund channel also supports returning goods obtained by exchange.
ALTER TABLE returns ADD COLUMN refund_method VARCHAR(32) CONSTRAINT refund_method_allowed CHECK (refund_method IN ('CASH','TERMINAL','EXCHANGE')) NULL;
UPDATE returns r SET refund_method=CASE WHEN r.exchange_id IS NOT NULL THEN 'EXCHANGE' WHEN s.payment_method='CASH' THEN 'CASH' ELSE 'TERMINAL' END
FROM sales s WHERE s.id=r.sale_id AND r.state='POSTED';
